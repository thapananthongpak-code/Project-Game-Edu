import type * as Phaser from "phaser";
import { extrasOf, isFieldRoom, questTitle, stationsOf, stripNumber, topicOf } from "../../content";
import { fmt, ui } from "../../content/ui-strings";
import type { DifficultySpec } from "../../state/campaign";
import { ARCHIVE, difficultyOf, fieldComplete, isTopicOpen, nextStepOf, planOf, roomProgress, useGameStore } from "../../state/gameStore";
import { SCENE } from "../constants";
import { objectBaseY, objectX, zoneMap } from "../maps";
import { WorldScene } from "./WorldScene";

/**
 * ห้องเรียน: วัตถุวางตามผังของห้อง (src/game/maps.ts) ห้องหนึ่งสอนได้หลายหัวข้อตามระดับความยาก (GDD ข้อ 15)
 * - ง่าย: ห้องละหัวข้อ สถานีบทสนทนา เครื่องฝึก โต๊ะสมุดบันทึก แท่นแกน AI
 * - กลาง: ห้องละ 2 หัวข้อ แต่ละหัวข้อมีคลังความรู้ (ไม่บังคับอ่าน) เครื่องฝึก โต๊ะสมุดบันทึก และแท่นของตัวเอง
 * - ยาก: ห้องเดียว เครื่องทดสอบรวมทำเควสทีละหัวข้อ ผ่านแล้วได้แกน AI ทันที
 * หัวข้อสุดท้าย (ภาคสนาม): จอภารกิจ และแท่นแกน AI ที่ออกใบประกาศ
 * ทุกห้องมี NPC ประจำห้อง (เควสเสริม ถามตอบพิเศษ หรือร้านพิเศษ GDD ข้อ 16) และของที่เก็บในเควสเสริม
 */
export class RoomScene extends WorldScene {
  private zone = 1;
  private topics: readonly number[] = [];
  private plan!: DifficultySpec;
  private coreIcons = new Map<number, Phaser.GameObjects.Image>();
  /** id ของจุดโต้ตอบของแต่ละหัวข้อ ใช้ชี้เป้าหมายถัดไป */
  private ids = { minigame: new Map<number, string>(), review: new Map<number, string>(), core: new Map<number, string>() };
  private labelKey = "";

  constructor() {
    super(SCENE.room);
  }

  init(data: { zone: number }): void {
    this.zone = data.zone;
    this.labelKey = "";
    this.coreIcons = new Map();
    this.ids = { minigame: new Map(), review: new Map(), core: new Map() };
  }

  create(): void {
    const store = () => useGameStore.getState();
    this.plan = planOf(store());
    this.topics = this.plan.zones[this.zone - 1].topics;
    const single = this.topics.length === 1;
    this.buildMap(zoneMap(difficultyOf(store()), this.zone));
    const progress = (topic: number) => roomProgress(store(), topic);
    const idOf = (kind: string, topic: number) => (single ? kind : `${kind}-t${topic}`);
    /** หัวข้อนี้ยังทำไม่ได้: เนื้อหาต่อยอดกัน ต้องได้แกน AI ของหัวข้อก่อนหน้าในห้องก่อน */
    const blocked = (topic: number): boolean => {
      if (isTopicOpen(store(), topic)) return false;
      store().showToast(fmt(ui.toast.topicLocked, { n: topic - 1 }));
      return true;
    };

    const [door] = this.objectsOf("door");
    this.addInteractable(door, "door-entry", () => ui.prompt.backToHall, () => store().exitToHall());

    // สถานีบทสนทนา (ระดับง่าย): ฟังได้ตามลำดับ สถานีที่ฟังแล้วฟังซ้ำได้
    const lesson = this.topics[0];
    const content = stationsOf(lesson);
    this.objectsOf("station")
      .sort((a, b) => (a.index as number) - (b.index as number))
      .forEach((object, index) => {
        this.addInteractable(
          object,
          `station-${index}`,
          () => fmt(ui.prompt.station, { n: index + 1, title: stripNumber(content[index].title) }),
          () => {
            if (index > progress(lesson).stationsSeen) return store().showToast(fmt(ui.toast.stationLocked, { n: progress(lesson).stationsSeen + 1 }));
            store().focusTopic(lesson);
            store().openStation(index);
          },
        );
      });

    // คลังความรู้ (ระดับกลาง): บทสอนทั้งหัวข้อ เปิดอ่านได้โดยไม่บังคับ
    for (const object of this.objectsOf("archive")) {
      const topic = object.topic as number;
      this.addInteractable(object, `archive-t${topic}`, () => fmt(ui.prompt.archive, { title: topicOf(topic).title }), () => {
        if (blocked(topic)) return;
        store().focusTopic(topic);
        store().openStation(ARCHIVE);
      });
    }

    const [fieldScreen] = this.objectsOf("field");
    if (fieldScreen) {
      const topic = fieldScreen.topic ?? lesson;
      this.addInteractable(fieldScreen, "field", () => ui.prompt.field, () => {
        if (blocked(topic)) return;
        store().focusTopic(topic);
        store().openOverlay("field");
      });
    }

    for (const machine of this.objectsOf("minigame")) {
      if (machine.topic === undefined && !single) {
        // เครื่องทดสอบรวม (ระดับยาก): ทำเควสของหัวข้อถัดไปที่ยังไม่ได้แกน AI
        const pending = () => this.topics.find((topic) => !isFieldRoom(topic) && !progress(topic).core);
        this.addInteractable(
          machine,
          "minigame",
          () => {
            const topic = pending();
            return topic === undefined ? ui.prompt.testMachineDone : fmt(ui.prompt.testMachine, { n: topic, quest: questTitle(topic) });
          },
          () => {
            const topic = pending();
            if (topic === undefined) return store().showToast(ui.toast.allTopicsDone);
            store().focusTopic(topic);
            store().openOverlay("minigame");
          },
        );
        continue;
      }
      const topic = machine.topic ?? lesson;
      this.ids.minigame.set(topic, idOf("minigame", topic));
      this.addInteractable(machine, idOf("minigame", topic), () => fmt(ui.prompt.minigame, { quest: questTitle(topic) }), () => {
        if (blocked(topic)) return;
        if (nextStepOf(store(), topic) === "station") return store().showToast(ui.toast.minigameLocked);
        store().focusTopic(topic);
        store().openOverlay("minigame");
      });
    }

    for (const desk of this.objectsOf("review")) {
      const topic = desk.topic ?? lesson;
      this.ids.review.set(topic, idOf("review", topic));
      this.addInteractable(desk, idOf("review", topic), () => (single ? ui.prompt.review : fmt(ui.prompt.reviewTopic, { n: topic })), () => {
        if (blocked(topic)) return;
        if (!progress(topic).minigameDone) return store().showToast(ui.toast.reviewLocked);
        store().focusTopic(topic);
        store().openOverlay("review");
      });
    }

    for (const pedestal of this.objectsOf("core")) {
      const topic = pedestal.topic ?? lesson;
      const field = isFieldRoom(topic);
      this.ids.core.set(topic, idOf("core", topic));
      const icon = this.add.image(objectX(pedestal), objectBaseY(pedestal) - 40, `core_${topic}`).setDepth(objectBaseY(pedestal) + 1);
      this.tweens.add({ targets: icon, y: icon.y - 3, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.coreIcons.set(topic, icon);
      this.addInteractable(pedestal, idOf("core", topic), () => (field ? ui.prompt.certificate : single ? ui.prompt.core : fmt(ui.prompt.coreTopic, { n: topic })), () => {
        const p = progress(topic);
        if (!p.core && blocked(topic)) return;
        store().focusTopic(topic);
        if (field) {
          // หัวข้อภาคสนาม: ภารกิจครบ → แบบทดสอบหลังเรียน → แกนชิ้นสุดท้าย จากนั้นแท่นนี้เปิดใบประกาศได้ทุกครั้ง
          if (!p.core && !fieldComplete(p)) return store().showToast(ui.toast.fieldLocked);
          if (!store().posttest) return store().openOverlay("posttest");
          if (!p.core) {
            store().collectCore();
            return store().openOverlay("reward");
          }
          return store().openOverlay("certificate");
        }
        if (p.core) return store().showToast(ui.toast.coreTaken);
        if (nextStepOf(store(), topic) !== "core") return store().showToast(p.minigameDone ? ui.toast.coreLocked : ui.toast.reviewLocked);
        store().collectCore();
        store().openOverlay("reward");
      });
    }

    // จอตัวอย่างและวิดีโอเสริม: โต้ตอบได้เฉพาะหัวข้อที่ครูกำหนดรายการไว้ (ไม่มีรายการ = เป็นของตกแต่งเฉย ๆ)
    for (const object of this.objectsOf("extras")) {
      const topic = object.topic ?? lesson;
      if (extrasOf(topic).length === 0) continue;
      this.addInteractable(object, idOf("extras", topic), () => ui.prompt.extras, () => {
        store().focusTopic(topic);
        store().openOverlay("extras");
      });
    }

    this.addNpcs();

    const spot = this.spotBelow(door);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
    this.syncPickups();
  }

  /** ปรับเป้าหมายถัดไป ป้ายสถานีและป้ายหัวข้อ และแกน AI ให้ตรงกับความคืบหน้า */
  private syncWithProgress(): void {
    const state = useGameStore.getState();
    // หัวข้อที่ต้องทำถัดไป = หัวข้อแรกของห้องที่ยังไม่ได้แกน AI
    const current = this.topics.find((topic) => !roomProgress(state, topic).core);
    const step = current === undefined ? "done" : nextStepOf(state, current);
    const target =
      current === undefined
        ? "door-entry"
        : step === "station"
          ? `station-${roomProgress(state, current).stationsSeen}`
          : step === "field"
            ? "field"
            : step === "minigame"
              ? (this.ids.minigame.get(current) ?? "minigame")
              : step === "review"
                ? (this.ids.review.get(current) ?? null)
                : (this.ids.core.get(current) ?? null);
    this.pointAt(target);

    for (const [topic, icon] of this.coreIcons) {
      const p = roomProgress(state, topic);
      icon.setVisible(!p.core && (isFieldRoom(topic) ? fieldComplete(p) : nextStepOf(state, topic) === "core"));
    }

    const seen = roomProgress(state, this.topics[0]).stationsSeen;
    const cores = this.topics.map((topic) => (roomProgress(state, topic).core ? "1" : "0")).join("");
    const labelKey = `${seen}|${cores}|${this.npcKey()}`;
    if (labelKey === this.labelKey) return;
    this.labelKey = labelKey;
    const tone = (topic: number) => (roomProgress(state, topic).core ? ("done" as const) : topic === current ? ("default" as const) : ("locked" as const));
    const stationLabels = this.interactables
      .filter((i) => i.id.startsWith("station-"))
      .map((i, index) => ({ id: i.id, x: i.x, y: i.top + 4, text: index < seen ? `${index + 1} ✓` : String(index + 1), tone: index < seen ? ("done" as const) : index === seen ? ("default" as const) : ("locked" as const) }));
    // ห้องที่มีหลายหัวข้อ: ป้ายเลขเรื่องบนเครื่องฝึกของแต่ละหัวข้อ เครื่องทดสอบรวมแสดงเรื่องที่กำลังทำ
    const topicLabels =
      this.topics.length === 1
        ? []
        : this.interactables
            .filter((i) => i.id.startsWith("minigame"))
            .map((i) => {
              const topic = i.id === "minigame" ? current : Number(i.id.split("-t")[1]);
              const quests = this.topics.filter((t) => !isFieldRoom(t));
              if (i.id === "minigame") {
                const done = quests.filter((t) => roomProgress(state, t).core).length;
                return { id: i.id, x: i.x, y: i.top + 4, text: `${done}/${quests.length}`, tone: done >= quests.length ? ("done" as const) : ("default" as const) };
              }
              return { id: i.id, x: i.x, y: i.top + 4, text: roomProgress(state, topic as number).core ? `${topic} ✓` : String(topic), tone: tone(topic as number) };
            });
    state.setLabels([...stationLabels, ...topicLabels, ...this.npcLabels()]);
  }
}
