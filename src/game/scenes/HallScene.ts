import { ROOM_COUNT, topicOf } from "../../content";
import { kaijuName } from "../../content/story";
import { fmt, ui } from "../../content/ui-strings";
import { isRoomUnlocked, pendingBattle, roomProgress, useGameStore } from "../../state/gameStore";
import { PLAYABLE_ROOMS } from "../../state/rules";
import { SCENE } from "../constants";
import { hallMap, type MapObject, objectBaseY, objectX } from "../maps";
import { WorldScene } from "./WorldScene";

/** โถงทางเดิน: ประตู 6 บานเรียงตามลำดับห้อง เปิดเฉพาะห้องที่ปลดล็อกแล้ว ประตูโรงเก็บหุ่น และร้านสหกรณ์แล็บ */
export class HallScene extends WorldScene {
  private from: { room?: number; hangar?: boolean } = {};
  private doors: MapObject[] = [];

  constructor() {
    super(SCENE.hall);
  }

  init(data: { fromRoom?: number; fromHangar?: boolean }): void {
    this.from = { room: data.fromRoom, hangar: data.fromHangar };
  }

  create(): void {
    this.buildMap(hallMap);
    const store = () => useGameStore.getState();
    this.doors = this.objectsOf("door");

    for (const door of this.doors) {
      const room = door.index as number;
      this.addInteractable(
        door,
        `door-${room}`,
        () => (isRoomUnlocked(store(), room) ? fmt(ui.prompt.enterRoom, { n: room, title: topicOf(room).title }) : fmt(ui.prompt.roomLocked, { n: room })),
        () => {
          const state = store();
          if (!isRoomUnlocked(state, room)) {
            // ได้แกน AI ของห้องก่อนหน้าแล้วแต่ยังไม่ชนะไคจู: บอกให้ไปโรงเก็บหุ่น
            const needsBattle = roomProgress(state, room - 1).core;
            state.showToast(needsBattle ? fmt(ui.toast.roomLockedBattle, { n: room, kaiju: kaijuName(room - 1) }) : fmt(ui.toast.roomLocked, { n: room, prev: room - 1 }));
          } else if (!PLAYABLE_ROOMS.includes(room)) state.showToast(fmt(ui.toast.roomNotBuilt, { n: room }));
          else state.enterRoom(room);
        },
      );
    }
    const [gate] = this.objectsOf("gate");
    this.addInteractable(gate, "gate", () => ui.prompt.hangarGate, () => store().enterHangar());
    const [shop] = this.objectsOf("shop");
    this.addInteractable(shop, "shop", () => ui.prompt.shop, () => store().openOverlay("shop"));

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
    for (const door of this.doors) this.placed.get(door)?.setTexture(isRoomUnlocked(state, door.index as number) ? "pr_door_open" : "pr_door_locked");

    const battle = pendingBattle(state);
    const nextRoom = Array.from({ length: ROOM_COUNT }, (_, i) => i + 1).find((room) => !roomProgress(state, room).core);
    this.pointAt(battle !== null ? "gate" : nextRoom ? `door-${nextRoom}` : null);

    const labels = this.doors.map((door) => {
      const room = door.index as number;
      const tone = roomProgress(state, room).core ? ("done" as const) : isRoomUnlocked(state, room) ? ("default" as const) : ("locked" as const);
      return { id: `door-${room}`, x: objectX(door), y: objectBaseY(door) - 58, text: String(room), tone };
    });
    if (JSON.stringify(labels) !== JSON.stringify(state.labels)) state.setLabels(labels);
  }
}
