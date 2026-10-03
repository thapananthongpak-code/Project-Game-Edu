import type * as Phaser from "phaser";
import { fmt, ui } from "../../content/ui-strings";
import { coreTotal, difficultyOf, learningRooms, pendingBattle, roomProgress, useGameStore } from "../../state/gameStore";
import type { Paint } from "../../state/shop.config";
import { SCENE } from "../constants";
import { hangarMapOf, objectBaseY, objectX } from "../maps";
import { WorldScene } from "./WorldScene";

/** สีย้อมของหุ่นบนแท่นในฉาก Phaser (ฉากต่อสู้ใช้ CSS filter ใน PAINT_FILTER หุ่นเป็นสีขาว การคูณสีจึงได้สีใกล้เคียงกัน) */
const PAINT_TINT: Record<Paint, number | null> = { standard: null, crimson: 0xff8a8a, violet: 0xb79cff, gold: 0xffd56b, emerald: 0x86e6a8, sakura: 0xffb6d5 };

/** ตำแหน่งของแกน AI ในตู้กระจก (ชั้นบน 3 ชิ้น ชั้นล่าง 3 ชิ้น) เทียบกับฐานของตู้ */
const CASE_SLOTS = [-14, 0, 14].flatMap((dx) => [-40, -22].map((dy) => ({ dx, dy }))).sort((a, b) => a.dy - b.dy || a.dx - b.dx);

/**
 * โรงเก็บหุ่นของแมพที่อยู่ (ผังต่างกันทุกแมพ GDD ข้อ 3): แท่นการ์เดียน (หุ่นแสดงอาวุธ เกราะ ชิป และสีที่ใส่) ตู้กระจกเก็บแกน AI
 * แผงสั่งปฏิบัติการ ตู้เสื้อผ้า แท่นปรับแต่งพี่บิต กล่องเก็บไอเทม เครื่องฉายข้อความของอาจารย์ และ NPC ของแมพ 3
 */
export class HangarScene extends WorldScene {
  private cores: Phaser.GameObjects.Image[] = [];
  private guardian!: Phaser.GameObjects.Image;
  private chipGlow!: Phaser.GameObjects.Arc;
  private looks = "";
  private labelKey = "";

  constructor() {
    super(SCENE.hangar);
  }

  create(): void {
    const map = difficultyOf(useGameStore.getState());
    this.buildMap(hangarMapOf(map));
    this.looks = "";
    this.labelKey = "";
    const store = () => useGameStore.getState();

    const [door] = this.objectsOf("door");
    this.addInteractable(door, "door-entry", () => ui.prompt.backToHall, () => store().exitToHall());

    // แท่นการ์เดียน: หุ่นยืนบนแท่น ภาพของหุ่นเปลี่ยนตามอาวุธและเกราะที่ใส่ ชิปเรืองแสงที่อก
    const [robot] = this.objectsOf("robot");
    const baseY = objectBaseY(robot);
    this.guardian = this.add.image(objectX(robot), baseY - 10, "gd_plate_fist").setOrigin(0.5, 1).setScale(0.8).setDepth(baseY + 1);
    this.chipGlow = this.add.circle(objectX(robot) - 4, baseY - 64, 4, 0xffcd75).setStrokeStyle(1, 0x1a1c2c).setDepth(baseY + 2);
    this.tweens.add({ targets: this.chipGlow, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
    this.addInteractable(robot, "robot", () => ui.prompt.robotDock, () => store().openOverlay("guardian"));

    // ตู้กระจกเก็บแกน AI: แกนที่เก็บได้ตั้งอยู่บนชั้นในตู้
    const [caseObject] = this.objectsOf("corecase");
    const caseY = objectBaseY(caseObject);
    this.cores = CASE_SLOTS.map(({ dx, dy }, i) =>
      this.add
        .image(objectX(caseObject) + dx, caseY + dy, `core_${i + 1}`)
        .setScale(0.38)
        .setDepth(caseY + 1),
    );
    this.addInteractable(caseObject, "corecase", () => ui.prompt.coreCase, () => {
      const shown = this.cores.filter((core) => core.visible).length;
      store().showToast(fmt(ui.toast.coreCase, { n: shown, total: coreTotal(store()) || this.cores.length }));
    });

    const [console_] = this.objectsOf("console");
    this.addInteractable(console_, "console", () => ui.prompt.missionConsole, () => store().openOverlay("missions"));
    const [hologram] = this.objectsOf("hologram");
    this.addInteractable(hologram, "hologram", () => ui.prompt.hologram, () => store().openStory("prologue"));
    const [wardrobe] = this.objectsOf("wardrobe");
    this.addInteractable(wardrobe, "wardrobe", () => ui.prompt.wardrobe, () => store().openOverlay("wardrobe"));
    const [bitpad] = this.objectsOf("bitpad");
    this.addInteractable(bitpad, "bitpad", () => ui.prompt.bitPad, () => store().openOverlay("bit"));
    const [storage] = this.objectsOf("storage");
    this.addInteractable(storage, "storage", () => ui.prompt.storage, () => store().openOverlay("storage"));
    this.addNpcs();

    const spot = this.spotBelow(door);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  /** สำหรับการทดสอบอัตโนมัติ: ภาพหุ่นบนแท่น สีที่ย้อม ชิปที่เรืองแสง และจำนวนแกนในตู้กระจก */
  get bayState(): { texture: string; tint: number | null; chip: boolean; cores: number } {
    return {
      texture: this.guardian.texture.key,
      tint: this.guardian.isTinted ? this.guardian.tintTopLeft : null,
      chip: this.chipGlow.visible,
      cores: this.cores.filter((core) => core.visible).length,
    };
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
  }

  private syncWithProgress(): void {
    const state = useGameStore.getState();
    // แกนในตู้: แกนของแมพที่อยู่ แมพที่ไม่มีห้องเรียน (แมพ 3) แสดงแกน 6 ชิ้นจากแมพ 1 ที่ให้พลังงานการ์เดียนอยู่
    const own = coreTotal(state) > 0;
    const learned = learningRooms(state);
    this.cores.forEach((core, i) => core.setVisible(own ? roomProgress(state, i + 1).core : (learned[i + 1]?.core ?? false)));

    const { weapon, armor, chip, paint } = state.shop;
    const looks = `${armor}_${weapon}|${chip}|${paint}`;
    if (looks !== this.looks) {
      this.looks = looks;
      this.guardian.setTexture(`gd_${armor}_${weapon}`);
      const tint = PAINT_TINT[paint];
      if (tint === null) this.guardian.clearTint();
      else this.guardian.setTint(tint);
      // ชิปที่ติดตั้งเรืองแสงที่อกของหุ่น: เร่งพลัง = ส้ม คิดทบทวน = เขียว
      this.chipGlow.setVisible(chip !== "none");
      this.chipGlow.setFillStyle(chip === "retry" ? 0x38b764 : 0xffcd75);
    }
    this.syncPickups();
    const labelKey = this.npcKey();
    if (labelKey !== this.labelKey) {
      this.labelKey = labelKey;
      state.setLabels(this.npcLabels());
    }
    this.pointAt(pendingBattle(state) !== null ? "console" : null);
  }
}
