import * as Phaser from "phaser";
import { course, isFieldRoom, questTitle, ROOM_COUNT, stationsOf, stripNumber } from "../../content";
import { fmt, ui } from "../../content/ui-strings";
import { emptyField, fieldStatus } from "../../state/field";
import { roomProgress, useGameStore } from "../../state/gameStore";
import type { RoomProgress } from "../../state/progressStore";
import { MIN_ANSWER_CHARS, PLAYABLE_ROOMS } from "../../state/rules";
import { BASE_WIDTH, FLOOR_TOP, SCENE, TILE } from "../constants";
import { type Interactable, WorldScene } from "./WorldScene";

const ENTRY_X = TILE * 1.5;
const EXIT_X = BASE_WIDTH - TILE * 1.5;

/** ภารกิจภาคสนามครบตามเงื่อนไขจบเกมหรือยัง (GDD ข้อ 6.5) */
const fieldComplete = (p: RoomProgress): boolean => fieldStatus(p.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete;

/**
 * ห้องเรียน 1–5: สถานีบทสนทนาเรียงริมผนัง เครื่องฝึก (มินิเกม) โต๊ะสมุดบันทึก และแท่นแกน AI
 * ห้องสุดท้าย (ภาคสนาม): จอภารกิจ และแท่นแกน AI ที่ออกใบประกาศ
 */
export class RoomScene extends WorldScene {
  private room = 1;
  private stationCount = 0;
  private mentor!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Triangle;
  private coreIcon!: Phaser.GameObjects.Image;
  /** ประตูไปห้องถัดไป ห้องสุดท้ายไม่มี */
  private exitDoor: Phaser.GameObjects.Image | null = null;
  private terminals: Phaser.GameObjects.Image[] = [];
  private targetId = "";
  private labelKey = "";

  constructor() {
    super(SCENE.room);
  }

  init(data: { room: number }): void {
    this.room = data.room;
    this.targetId = "";
    this.labelKey = "";
    this.terminals = [];
  }

  create(): void {
    const room = this.room;
    const field = isFieldRoom(room);
    // ห้องภาคสนามไม่มีสถานี เนื้อหาของหัวข้อแสดงในหน้าต่างภารกิจ
    const stations = field ? [] : stationsOf(room);
    this.stationCount = stations.length;
    this.buildMap(`ts_r${room}`);
    const store = () => useGameStore.getState();
    const progress = () => roomProgress(store(), room);

    // ประตูเข้า (ซ้าย) กลับโถง และประตูออก (ขวา) ไปห้องถัดไป
    this.addProp("pr_door_open", ENTRY_X, FLOOR_TOP, 0);
    this.interactables.push({ id: "door-entry", x: ENTRY_X, y: FLOOR_TOP + 14, prompt: () => ui.prompt.backToHall, action: () => store().exitToHall() });
    this.exitDoor = null;
    if (room < ROOM_COUNT) {
      this.exitDoor = this.addProp("pr_door_locked", EXIT_X, FLOOR_TOP, 0);
      this.interactables.push({
        id: "door-exit",
        x: EXIT_X,
        y: FLOOR_TOP + 14,
        prompt: () => fmt(ui.prompt.nextRoom, { n: room + 1 }),
        action: () => {
          if (!progress().core) store().showToast(fmt(ui.toast.roomLocked, { n: room + 1, prev: room }));
          else if (!PLAYABLE_ROOMS.includes(room + 1)) store().showToast(fmt(ui.toast.roomNotBuilt, { n: room + 1 }));
          else store().enterRoom(room + 1);
        },
      });
    }

    // สถานีบทสนทนา: ฟังได้ตามลำดับ สถานีที่ฟังแล้วฟังซ้ำได้
    stations.forEach((station, index) => {
      const x = this.spreadX(index, stations.length, 4 * TILE);
      const baseY = FLOOR_TOP + 20;
      this.terminals.push(this.addProp("pr_station_terminal", x, baseY, 22));
      this.interactables.push({
        id: `station-${index}`,
        x,
        y: baseY + 12,
        prompt: () => fmt(ui.prompt.station, { n: index + 1, title: stripNumber(station.title) }),
        action: () => {
          if (index > progress().stationsSeen) store().showToast(fmt(ui.toast.stationLocked, { n: progress().stationsSeen + 1 }));
          else store().openStation(index);
        },
      });
    });

    const machine = { x: BASE_WIDTH - 5 * TILE, y: FLOOR_TOP + 6 * TILE };
    this.addProp("pr_r1_learning_machine", machine.x, machine.y, 46);
    if (field) {
      this.interactables.push({ id: "field", ...machineSpot(machine), prompt: () => ui.prompt.field, action: () => store().openOverlay("field") });
    } else {
      this.interactables.push({
        id: "minigame",
        ...machineSpot(machine),
        prompt: () => fmt(ui.prompt.minigame, { quest: questTitle(room) }),
        action: () => {
          if (progress().stationsSeen < this.stationCount) store().showToast(ui.toast.minigameLocked);
          else store().openOverlay("minigame");
        },
      });

      const desk = { x: 5 * TILE, y: FLOOR_TOP + 6 * TILE };
      this.addProp("pr_notebook_desk", desk.x, desk.y, 50);
      this.interactables.push({
        id: "review",
        ...machineSpot(desk),
        prompt: () => ui.prompt.review,
        action: () => {
          if (!progress().minigameDone) store().showToast(ui.toast.reviewLocked);
          else store().openOverlay("review");
        },
      });
    }

    const pedestal = { x: BASE_WIDTH / 2, y: FLOOR_TOP + 5 * TILE };
    this.addProp("pr_core_pedestal", pedestal.x, pedestal.y, 22);
    this.coreIcon = this.add.image(pedestal.x, pedestal.y - 40, `core_${room}`).setDepth(pedestal.y + 1);
    this.tweens.add({ targets: this.coreIcon, y: this.coreIcon.y - 3, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.interactables.push({
      id: "core",
      ...machineSpot(pedestal),
      prompt: () => (field ? ui.prompt.certificate : ui.prompt.core),
      action: () => {
        const p = progress();
        if (field) {
          // ห้องภาคสนาม: ภารกิจครบ → แบบทดสอบหลังเรียน → แกนชิ้นสุดท้ายและใบประกาศ จากนั้นแท่นนี้เปิดใบประกาศได้ทุกครั้ง
          if (!p.core && !fieldComplete(p)) return store().showToast(ui.toast.fieldLocked);
          if (!store().posttest) return store().openOverlay("posttest");
          store().collectCore();
          store().openOverlay("certificate");
        } else if (!p.reviewDone) store().showToast(ui.toast.coreLocked);
        else if (p.core) store().showToast(ui.toast.coreTaken);
        else {
          store().collectCore();
          store().openOverlay("reward");
        }
      },
    });

    this.mentor = this.add.image(ENTRY_X + 60, FLOOR_TOP + 60, "ch_mentor_south").setOrigin(0.5, 60 / 64);
    this.marker = this.add.triangle(0, 0, 0, 0, 12, 0, 6, 9, 0xffcd75).setStrokeStyle(1, 0x1a1c2c).setDepth(1000);
    this.tweens.add({ targets: this.marker, scaleY: 0.7, duration: 450, yoyo: true, repeat: -1 });

    this.createPlayer(ENTRY_X + 20, FLOOR_TOP + 50);
    this.syncWithProgress();
  }

  update(time: number): void {
    super.update(time);
    this.syncWithProgress();
    // สไตล์ดูภาพ: สถานีที่กำลังอ่านกะพริบเรืองแสง
    const { overlay, stationIndex, profile } = useGameStore.getState();
    const glowing = overlay === "dialogue" && profile?.style === "visual" ? stationIndex : null;
    this.terminals.forEach((terminal, index) => {
      if (index === glowing && Math.floor(time / 350) % 2 === 0) terminal.setTint(0xffcd75);
      else terminal.clearTint();
    });
  }

  /** ปรับเป้าหมายถัดไป ป้ายสถานี ประตูออก และแกน AI ให้ตรงกับความคืบหน้า */
  private syncWithProgress(): void {
    const p = roomProgress(useGameStore.getState(), this.room);

    const field = isFieldRoom(this.room);
    const ready = field ? fieldComplete(p) : p.reviewDone;
    const targetId = field
      ? !ready && !p.core ? "field" : "core"
      : p.stationsSeen < this.stationCount ? `station-${p.stationsSeen}`
      : !p.minigameDone ? "minigame"
      : !p.reviewDone ? "review"
      : !p.core ? "core"
      : this.room < ROOM_COUNT ? "door-exit" : "door-entry";
    if (targetId !== this.targetId) {
      this.targetId = targetId;
      const target = this.interactables.find((i) => i.id === targetId) as Interactable;
      // เป้าหมายอยู่หน้าวัตถุ ลูกศรชี้เหนือวัตถุ (สถานีมีป้ายเลขอยู่ใต้ลูกศร) พี่บิตเดินไปยืนข้าง ๆ
      this.marker.setPosition(target.x, target.y - (targetId.startsWith("station-") ? 92 : 84));
      // ยืนทางขวาของเป้าหมาย เว้นแต่เป้าหมายอยู่ชิดผนังขวา (ประตูออก) จึงยืนทางซ้าย
      const side = target.x + 38 > BASE_WIDTH - TILE - 20 ? -38 : 38;
      this.tweens.add({ targets: this.mentor, x: target.x + side, y: target.y + 8, duration: 600, ease: "Sine.easeInOut" });
      this.mentor.setDepth(target.y + 8);
    }

    this.coreIcon.setVisible(ready && !p.core);
    this.exitDoor?.setTexture(p.core ? "pr_door_open" : "pr_door_locked");

    const labelKey = `${p.stationsSeen}`;
    if (labelKey !== this.labelKey) {
      this.labelKey = labelKey;
      useGameStore.getState().setLabels(
        this.interactables
          .filter((i) => i.id.startsWith("station-"))
          .map((i, index) => ({
            id: i.id,
            x: i.x,
            y: i.y - 76,
            text: index < p.stationsSeen ? `${index + 1} ✓` : String(index + 1),
            tone: index < p.stationsSeen ? "done" : index === p.stationsSeen ? "default" : "locked",
          })),
      );
    }
  }
}

/** จุดยืนโต้ตอบอยู่หน้าวัตถุเล็กน้อย */
function machineSpot(prop: { x: number; y: number }): { x: number; y: number } {
  return { x: prop.x, y: prop.y + 12 };
}
