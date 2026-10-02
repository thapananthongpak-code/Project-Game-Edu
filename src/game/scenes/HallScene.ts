import { topicOf } from "../../content";
import { foeName } from "../../content/story";
import { fmt, ui } from "../../content/ui-strings";
import { type DifficultySpec, gateOf } from "../../state/campaign";
import { difficultyOf, isRoomUnlocked, pendingBattle, planOf, roomProgress, useGameStore } from "../../state/gameStore";
import { SCENE } from "../constants";
import { hallMapOf, type MapObject, objectBaseY, objectX } from "../maps";
import { WorldScene } from "./WorldScene";

/** โถงทางเดิน: ประตูห้องตามจำนวนห้องของระดับความยาก (6, 3 หรือ 1 บาน) เปิดเฉพาะห้องที่ปลดล็อกแล้ว ประตูโรงเก็บหุ่น และร้านสหกรณ์แล็บ */
export class HallScene extends WorldScene {
  private from: { room?: number; hangar?: boolean } = {};
  private doors: MapObject[] = [];
  /** ห้องของระดับความยาก ณ ตอนสร้างฉาก (ฉากนี้เป็นฉากหลังของเมนูและหน้าลงทะเบียนด้วย ระดับที่ผู้เล่นเลือกอาจเปลี่ยนก่อนฉากถูกสร้างใหม่) */
  private zones: DifficultySpec["zones"] = [];

  constructor() {
    super(SCENE.hall);
  }

  init(data: { fromRoom?: number; fromHangar?: boolean }): void {
    this.from = { room: data.fromRoom, hangar: data.fromHangar };
  }

  create(): void {
    const store = () => useGameStore.getState();
    const zones = planOf(store()).zones;
    this.zones = zones;
    this.buildMap(hallMapOf(zones.length));
    this.doors = this.objectsOf("door");

    for (const door of this.doors) {
      const zone = door.index as number;
      const topics = zones[zone - 1].topics;
      const title = topics.length === 1 ? fmt(ui.prompt.enterRoom, { n: zone, title: topicOf(topics[0]).title }) : fmt(ui.prompt.enterZone, { n: zone, from: topics[0], to: topics[topics.length - 1] });
      this.addInteractable(
        door,
        `door-${zone}`,
        () => (isRoomUnlocked(store(), zone) ? title : fmt(ui.prompt.roomLocked, { n: zone })),
        () => {
          const state = store();
          if (isRoomUnlocked(state, zone)) return state.enterRoom(zone);
          // ได้แกน AI ของห้องก่อนหน้าครบแล้วแต่ยังไม่ชนะไคจูที่เฝ้าห้องนี้: บอกให้ไปโรงเก็บหุ่น
          const missing = zones[zone - 2].topics.find((topic) => !roomProgress(state, topic).core);
          const gate = gateOf(difficultyOf(state), zone);
          state.showToast(missing === undefined && gate ? fmt(ui.toast.roomLockedBattle, { n: zone, kaiju: foeName(gate.forms[0].art) }) : fmt(ui.toast.roomLocked, { n: zone, prev: missing ?? topics[0] - 1 }));
        },
      );
    }
    const [gate] = this.objectsOf("gate");
    this.addInteractable(gate, "gate", () => ui.prompt.hangarGate, () => store().enterHangar());
    const [shop] = this.objectsOf("shop");
    this.addInteractable(shop, "shop", () => ui.prompt.shop, () => store().openShop());

    const start = this.from.hangar ? gate : (this.doors.find((door) => door.index === this.from.room) ?? this.doors[0]);
    const spot = this.spotBelow(start);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
  }

  /** ประตู ป้ายเลขห้อง และลูกศรชี้เป้าหมายตามความคืบหน้า */
  private syncWithProgress(): void {
    const state = useGameStore.getState();
    const cleared = (zone: number) => this.zones[zone - 1].topics.every((topic) => roomProgress(state, topic).core);
    for (const door of this.doors) this.placed.get(door)?.setTexture(isRoomUnlocked(state, door.index as number) ? "pr_door_open" : "pr_door_locked");

    const battle = pendingBattle(state);
    const nextZone = this.doors.map((door) => door.index as number).find((zone) => !cleared(zone));
    this.pointAt(battle !== null ? "gate" : nextZone ? `door-${nextZone}` : null);

    const labels = this.doors.map((door) => {
      const zone = door.index as number;
      const tone = cleared(zone) ? ("done" as const) : isRoomUnlocked(state, zone) ? ("default" as const) : ("locked" as const);
      return { id: `door-${zone}`, x: objectX(door), y: objectBaseY(door) - 58, text: String(zone), tone };
    });
    if (JSON.stringify(labels) !== JSON.stringify(state.labels)) state.setLabels(labels);
  }
}
