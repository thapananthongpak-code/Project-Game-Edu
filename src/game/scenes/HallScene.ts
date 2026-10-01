import { ROOM_COUNT, topicOf } from "../../content";
import { fmt, ui } from "../../content/ui-strings";
import { isRoomUnlocked, useGameStore } from "../../state/gameStore";
import { PLAYABLE_ROOMS } from "../../state/rules";
import { FLOOR_TOP, SCENE } from "../constants";
import { WorldScene } from "./WorldScene";

/** โถงทางเดิน: ประตู 6 บานเรียงตามลำดับห้อง เปิดเฉพาะห้องที่ปลดล็อกแล้ว */
export class HallScene extends WorldScene {
  private fromRoom = 1;

  constructor() {
    super(SCENE.hall);
  }

  init(data: { fromRoom?: number }): void {
    this.fromRoom = data.fromRoom ?? 1;
  }

  create(): void {
    this.buildMap("ts_common");
    const store = useGameStore.getState();
    const doorX = (room: number) => this.spreadX(room - 1, ROOM_COUNT, 80);

    for (let room = 1; room <= ROOM_COUNT; room++) {
      const x = doorX(room);
      const unlocked = isRoomUnlocked(store, room);
      this.addProp(unlocked ? "pr_door_open" : "pr_door_locked", x, FLOOR_TOP, 0);
      this.interactables.push({
        id: `door-${room}`,
        x,
        y: FLOOR_TOP + 14,
        prompt: () =>
          isRoomUnlocked(useGameStore.getState(), room)
            ? fmt(ui.prompt.enterRoom, { n: room, title: topicOf(room).title })
            : fmt(ui.prompt.roomLocked, { n: room }),
        action: () => {
          const state = useGameStore.getState();
          if (!isRoomUnlocked(state, room)) state.showToast(fmt(ui.toast.roomLocked, { n: room, prev: room - 1 }));
          else if (!PLAYABLE_ROOMS.includes(room)) state.showToast(fmt(ui.toast.roomNotBuilt, { n: room }));
          else state.enterRoom(room);
        },
      });
    }

    store.setLabels(
      Array.from({ length: ROOM_COUNT }, (_, i) => ({
        id: `door-${i + 1}`,
        x: doorX(i + 1),
        y: FLOOR_TOP - 58,
        text: String(i + 1),
        tone: store.progress[i + 1]?.core ? "done" : isRoomUnlocked(store, i + 1) ? "default" : "locked",
      })),
    );

    this.add.image(doorX(1) + 44, FLOOR_TOP + 44, "ch_mentor_south").setOrigin(0.5, 60 / 64).setDepth(FLOOR_TOP + 44);

    this.createPlayer(doorX(this.fromRoom), FLOOR_TOP + 70);
  }
}
