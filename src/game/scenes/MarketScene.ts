import { ui } from "../../content/ui-strings";
import type { Difficulty } from "../../state/campaign";
import { difficultyOf, useGameStore } from "../../state/gameStore";
import { SCENE } from "../constants";
import { marketMapOf } from "../maps";
import { WorldScene } from "./WorldScene";

/**
 * ย่านร้านค้า (GDD ข้อ 13): ห้องของแมพที่อยู่ มีเคาน์เตอร์แยกตามประเภทของที่ขาย เดินไปที่เคาน์เตอร์แล้วกดโต้ตอบเพื่อเปิดร้านนั้น
 * ประตูด้านบนกลับโถง ผังตายตัว (ผู้เล่นไม่จัดห้องนี้) จึงสร้างจาก marketMapOf โดยตรง
 */
export class MarketScene extends WorldScene {
  constructor() {
    super(SCENE.market);
  }

  create(): void {
    const world: Difficulty = difficultyOf(useGameStore.getState());
    const store = () => useGameStore.getState();
    this.buildMap(marketMapOf(world));

    const [door] = this.objectsOf("door");
    this.addInteractable(door, "door-entry", () => ui.prompt.backToHall, () => store().exitToHall());
    for (const stall of this.objectsOf("stall")) {
      const id = stall.stall as NonNullable<typeof stall.stall>;
      this.addInteractable(stall, `stall-${id}`, () => ui.market.stalls[id].prompt, () => store().openStall(id));
    }

    const spot = this.spotBelow(door);
    this.createPlayer(spot.x, spot.y);
  }
}
