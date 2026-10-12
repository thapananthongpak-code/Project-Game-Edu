import { fmt, ui } from "../../content/ui-strings";
import type { Difficulty } from "../../state/campaign";
import { difficultyOf, reachedMap, useGameStore } from "../../state/gameStore";
import { growthOf, potCount } from "../../state/lab";
import { SEEDS } from "../../state/shop.config";
import { SCENE } from "../constants";
import { WorldScene } from "./WorldScene";

/** ภาพของกระถางหนึ่ง: ว่าง หรือพืชตามพันธุ์และระยะ (ต้นอ่อน 1 กำลังโต 2 พร้อมเก็บ 3) */
const STAGE_NUMBER = { sprout: 1, growing: 2, ready: 3 } as const;

/**
 * ห้องวิจัยพืชต่างดาว (GDD ข้อ 21): ผังตายตัว กระถางตามจำนวนที่ผู้เล่นใช้ได้ตามแมพไกลสุดที่ไปถึง เดินไปกดโต้ตอบที่กระถางเพื่อปลูกหรือเก็บ
 * ภาพของกระถางเปลี่ยนตามระยะของพืช (คำนวณจากเวลาปัจจุบันและเวลาที่ปลูก จึงโตตามเวลาจริง)
 */
export class LabScene extends WorldScene {
  private pots: { index: number; object: ReturnType<WorldScene["objectsOf"]>[number] }[] = [];
  private looks = "";
  private world: Difficulty = "easy";

  constructor() {
    super(SCENE.lab);
  }

  create(): void {
    const store = () => useGameStore.getState();
    const world: Difficulty = difficultyOf(store());
    // ผังเต็ม 8 กระถางไว้ตรวจการวางของ แต่แสดงเฉพาะกระถางที่แมพไกลสุดที่ไปถึงเปิดแล้ว
    const open = potCount(reachedMap(store()));
    this.buildRoom(world, "lab", (object) => object.kind !== "pot" || (object.index as number) < open);
    this.world = world;
    this.looks = "";

    const [door] = this.objectsOf("door");
    this.addInteractable(door, "door-entry", () => ui.prompt.backToHall, () => store().exitToHall());
    this.pots = this.objectsOf("pot").map((object) => ({ index: object.index as number, object }));
    for (const { index, object } of this.pots) {
      this.addInteractable(
        object,
        `pot-${index}`,
        () => {
          const pot = store().shop.pots[String(index)];
          if (!pot) return fmt(ui.lab.promptEmpty, { n: index + 1 });
          const growth = growthOf(pot, Date.now());
          return fmt(growth.stage === "ready" ? ui.lab.promptReady : ui.lab.promptGrowing, { n: index + 1, name: ui.lab.seeds[pot.seed].name });
        },
        () => store().openLab(index),
      );
    }
    const [board] = this.objectsOf("decorboard");
    this.addInteractable(board, "decorboard", () => ui.prompt.decorBoard, () => store().openOverlay("decor"));
    const spot = this.spotBelow(door);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  /** สำหรับการทดสอบอัตโนมัติ: ภาพที่กระถางแต่ละใบแสดงอยู่ */
  get potTextures(): string[] {
    return this.pots.map(({ object }) => this.placed.get(object)?.texture.key ?? "");
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
  }

  private syncWithProgress(): void {
    // ย้ายกระดานตกแต่งหรือเปลี่ยนธีม: ฉากถูกสร้างใหม่ ของตกแต่งที่ผู้เล่นวางเองแสดงตามที่บันทึก
    if (this.syncRoom(this.world, "lab")) return;
    this.syncDecor(this.world, "lab");
    const { shop } = useGameStore.getState();
    const now = Date.now();
    const textures = this.pots.map(({ index }) => {
      const pot = shop.pots[String(index)];
      return pot && SEEDS.includes(pot.seed) ? `pr_plant_${pot.seed}_${STAGE_NUMBER[growthOf(pot, now).stage]}` : "pr_pot_empty";
    });
    const looks = textures.join("|");
    if (looks === this.looks) return;
    this.looks = looks;
    this.pots.forEach(({ object }, i) => this.placed.get(object)?.setTexture(textures[i]));
  }
}
