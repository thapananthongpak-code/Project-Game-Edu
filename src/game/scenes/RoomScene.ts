import type * as Phaser from "phaser";
import { course, isFieldRoom, questTitle, stationsOf, stripNumber } from "../../content";
import { fmt, ui } from "../../content/ui-strings";
import { emptyField, fieldStatus } from "../../state/field";
import { roomProgress, useGameStore } from "../../state/gameStore";
import type { RoomProgress } from "../../state/progressStore";
import { MIN_ANSWER_CHARS } from "../../state/rules";
import { SCENE } from "../constants";
import { type MapObject, objectBaseY, objectX, roomMaps } from "../maps";
import { WorldScene } from "./WorldScene";

/** ภารกิจภาคสนามครบตามเงื่อนไขจบเกมหรือยัง (GDD ข้อ 6.5) */
const fieldComplete = (p: RoomProgress): boolean => fieldStatus(p.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete;

/**
 * ห้องเรียน 1–5: สถานีบทสนทนา เครื่องฝึก (มินิเกม) โต๊ะสมุดบันทึก และแท่นแกน AI วางตามผังของแต่ละห้อง (src/game/maps.ts)
 * ห้องสุดท้าย (ภาคสนาม): จอภารกิจ และแท่นแกน AI ที่ออกใบประกาศ
 */
export class RoomScene extends WorldScene {
  private room = 1;
  private stationCount = 0;
  private coreIcon!: Phaser.GameObjects.Image;
  private stations: MapObject[] = [];
  private labelKey = "";

  constructor() {
    super(SCENE.room);
  }

  init(data: { room: number }): void {
    this.room = data.room;
    this.labelKey = "";
  }

  create(): void {
    const room = this.room;
    const field = isFieldRoom(room);
    this.buildMap(roomMaps[room]);
    const store = () => useGameStore.getState();
    const progress = () => roomProgress(store(), room);

    const [door] = this.objectsOf("door");
    this.addInteractable(door, "door-entry", () => ui.prompt.backToHall, () => store().exitToHall());

    // สถานีบทสนทนา: ฟังได้ตามลำดับ สถานีที่ฟังแล้วฟังซ้ำได้ ห้องภาคสนามไม่มีสถานี เนื้อหาของหัวข้อแสดงในหน้าต่างภารกิจ
    const content = field ? [] : stationsOf(room);
    this.stationCount = content.length;
    this.stations = this.objectsOf("station").sort((a, b) => (a.index as number) - (b.index as number));
    this.stations.forEach((object, index) => {
      this.addInteractable(
        object,
        `station-${index}`,
        () => fmt(ui.prompt.station, { n: index + 1, title: stripNumber(content[index].title) }),
        () => {
          if (index > progress().stationsSeen) store().showToast(fmt(ui.toast.stationLocked, { n: progress().stationsSeen + 1 }));
          else store().openStation(index);
        },
      );
    });

    const [fieldScreen] = this.objectsOf("field");
    if (fieldScreen) this.addInteractable(fieldScreen, "field", () => ui.prompt.field, () => store().openOverlay("field"));

    const [machine] = this.objectsOf("minigame");
    if (machine) {
      this.addInteractable(machine, "minigame", () => fmt(ui.prompt.minigame, { quest: questTitle(room) }), () => {
        if (progress().stationsSeen < this.stationCount) store().showToast(ui.toast.minigameLocked);
        else store().openOverlay("minigame");
      });
    }

    const [desk] = this.objectsOf("review");
    if (desk) {
      this.addInteractable(desk, "review", () => ui.prompt.review, () => {
        if (!progress().minigameDone) store().showToast(ui.toast.reviewLocked);
        else store().openOverlay("review");
      });
    }

    const [pedestal] = this.objectsOf("core");
    this.coreIcon = this.add.image(objectX(pedestal), objectBaseY(pedestal) - 40, `core_${room}`).setDepth(objectBaseY(pedestal) + 1);
    this.tweens.add({ targets: this.coreIcon, y: this.coreIcon.y - 3, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.addInteractable(pedestal, "core", () => (field ? ui.prompt.certificate : ui.prompt.core), () => {
      const p = progress();
      if (field) {
        // ห้องภาคสนาม: ภารกิจครบ → แบบทดสอบหลังเรียน → แกนชิ้นสุดท้าย จากนั้นแท่นนี้เปิดใบประกาศได้ทุกครั้ง
        if (!p.core && !fieldComplete(p)) return store().showToast(ui.toast.fieldLocked);
        if (!store().posttest) return store().openOverlay("posttest");
        if (!p.core) {
          store().collectCore();
          return store().openOverlay("reward");
        }
        store().openOverlay("certificate");
      } else if (!p.reviewDone) store().showToast(ui.toast.coreLocked);
      else if (p.core) store().showToast(ui.toast.coreTaken);
      else {
        store().collectCore();
        store().openOverlay("reward");
      }
    });

    const spot = this.spotBelow(door);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
    // สไตล์ดูภาพ: สถานีที่กำลังอ่านกะพริบเรืองแสง
    const { overlay, stationIndex, profile } = useGameStore.getState();
    const glowing = overlay === "dialogue" && profile?.style === "visual" ? stationIndex : null;
    this.stations.forEach((station, index) => {
      const image = this.placed.get(station);
      if (index === glowing && Math.floor(time / 350) % 2 === 0) image?.setTint(0xffcd75);
      else image?.clearTint();
    });
  }

  /** ปรับเป้าหมายถัดไป ป้ายสถานี และแกน AI ให้ตรงกับความคืบหน้า */
  private syncWithProgress(): void {
    const p = roomProgress(useGameStore.getState(), this.room);
    const field = isFieldRoom(this.room);
    const ready = field ? fieldComplete(p) : p.reviewDone;
    this.pointAt(
      field
        ? !ready && !p.core ? "field" : !p.core ? "core" : "door-entry"
        : p.stationsSeen < this.stationCount ? `station-${p.stationsSeen}`
        : !p.minigameDone ? "minigame"
        : !p.reviewDone ? "review"
        : !p.core ? "core"
        : "door-entry",
    );
    this.coreIcon.setVisible(ready && !p.core);

    const labelKey = `${p.stationsSeen}`;
    if (labelKey !== this.labelKey) {
      this.labelKey = labelKey;
      useGameStore.getState().setLabels(
        this.interactables
          .filter((i) => i.id.startsWith("station-"))
          .map((i, index) => ({
            id: i.id,
            x: i.x,
            y: i.top + 4,
            text: index < p.stationsSeen ? `${index + 1} ✓` : String(index + 1),
            tone: index < p.stationsSeen ? "done" : index === p.stationsSeen ? "default" : "locked",
          })),
      );
    }
  }
}
