import type * as Phaser from "phaser";
import { ROOM_COUNT } from "../../content";
import { fmt, ui } from "../../content/ui-strings";
import { coreCount, coreTotal, guardianPowerOf, pendingBattle, roomProgress, useGameStore } from "../../state/gameStore";
import { SCENE } from "../constants";
import { hangarMap, objectBaseY, objectX } from "../maps";
import { WorldScene } from "./WorldScene";

/** โรงเก็บหุ่น: หุ่นการ์เดียนกับแกน AI ที่เก็บได้ แผงสั่งปฏิบัติการ (รายการด่านต่อสู้และการซ้อมรบ) ตู้เสื้อผ้า กล่องเก็บไอเทม และข้อความของอาจารย์ */
export class HangarScene extends WorldScene {
  private cores: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SCENE.hangar);
  }

  create(): void {
    this.buildMap(hangarMap);
    const store = () => useGameStore.getState();

    const [door] = this.objectsOf("door");
    this.addInteractable(door, "door-entry", () => ui.prompt.backToHall, () => store().exitToHall());

    const [robot] = this.objectsOf("robot");
    this.addInteractable(robot, "robot", () => ui.prompt.robotDock, () => store().showToast(fmt(ui.toast.robotStatus, { n: coreCount(store()), total: coreTotal(store()), power: guardianPowerOf(store()) })));
    // แกน AI ที่ติดตั้งแล้วเรียงเป็นแถวใต้หุ่น
    const baseY = objectBaseY(robot);
    this.cores = Array.from({ length: ROOM_COUNT }, (_, i) =>
      this.add
        .image(objectX(robot) + (i - (ROOM_COUNT - 1) / 2) * 18, baseY + 12, `core_${i + 1}`)
        .setScale(0.5)
        .setDepth(baseY + 1),
    );

    const [console_] = this.objectsOf("console");
    this.addInteractable(console_, "console", () => ui.prompt.missionConsole, () => store().openOverlay("missions"));

    const [hologram] = this.objectsOf("hologram");
    this.addInteractable(hologram, "hologram", () => ui.prompt.hologram, () => store().openStory("prologue"));
    const [wardrobe] = this.objectsOf("wardrobe");
    this.addInteractable(wardrobe, "wardrobe", () => ui.prompt.wardrobe, () => store().openShop());
    const [storage] = this.objectsOf("storage");
    this.addInteractable(storage, "storage", () => ui.prompt.storage, () => store().openOverlay("storage"));

    const spot = this.spotBelow(door);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
  }

  private syncWithProgress(): void {
    const state = useGameStore.getState();
    this.cores.forEach((core, i) => core.setVisible(roomProgress(state, i + 1).core));
    this.pointAt(pendingBattle(state) !== null ? "console" : null);
  }
}
