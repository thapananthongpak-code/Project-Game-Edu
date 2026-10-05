import { topicOf } from "../../content";
import { foeName } from "../../content/story";
import { fmt, ui } from "../../content/ui-strings";
import { DIFFICULTIES, type Difficulty, type DifficultySpec, gateOf, mapIndex } from "../../state/campaign";
import { allBattlesWon, difficultyOf, isRoomUnlocked, mapUnlocked, pendingBattle, planOf, roomProgress, useGameStore } from "../../state/gameStore";
import { SCENE } from "../constants";
import { hallMapOf, type MapObject, objectBaseY, objectX } from "../maps";
import { WorldScene } from "./WorldScene";

/**
 * โถงของแมพที่ผู้เล่นอยู่ (GDD ข้อ 3 และ 15): ประตูห้องตามจำนวนห้องของแมพ เปิดเฉพาะห้องที่ปลดล็อกแล้ว ประตูโรงเก็บหุ่น ร้านสหกรณ์แล็บ
 * กล่องเก็บไอเทม กระดานแผนที่การเดินทาง กระดานตกแต่ง และของตกแต่งที่ผู้เล่นลากวางเองได้อิสระ (GDD ข้อ 19)
 */
export class HallScene extends WorldScene {
  private from: { room?: number; hangar?: boolean; travel?: boolean } = {};
  private doors: MapObject[] = [];
  /** แมพและห้อง ณ ตอนสร้างฉาก (ฉากนี้เป็นฉากหลังของเมนูและหน้าลงทะเบียนด้วย แมพอาจเปลี่ยนก่อนฉากถูกสร้างใหม่) */
  private world: Difficulty = "easy";
  private zones: DifficultySpec["zones"] = [];

  constructor() {
    super(SCENE.hall);
  }

  init(data: { fromRoom?: number; fromHangar?: boolean; fromTravel?: boolean }): void {
    this.from = { room: data.fromRoom, hangar: data.fromHangar, travel: data.fromTravel };
  }

  create(): void {
    const store = () => useGameStore.getState();
    const zones = planOf(store()).zones;
    this.zones = zones;
    this.world = difficultyOf(store());
    const hall = hallMapOf(this.world);
    this.buildMap(hall);
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
          // แมพที่ข้ามการทบทวนได้ (แมพ 2) ไม่ต้องใช้แกน AI ของห้องก่อนหน้า ขาดแค่การชนะไคจู
          const missing = planOf(state).roomsNeedCores ? zones[zone - 2].topics.find((topic) => !roomProgress(state, topic).core) : undefined;
          const gate = gateOf(difficultyOf(state), zone);
          state.showToast(missing === undefined && gate ? fmt(ui.toast.roomLockedBattle, { n: zone, kaiju: foeName(gate.forms[0].art) }) : fmt(ui.toast.roomLocked, { n: zone, prev: missing ?? topics[0] - 1 }));
        },
      );
    }
    const [gate] = this.objectsOf("gate");
    this.addInteractable(gate, "gate", () => ui.prompt.hangarGate, () => store().enterHangar());
    const [shop] = this.objectsOf("shop");
    this.addInteractable(shop, "shop", () => ui.prompt.shop, () => store().openShop());
    const [storage] = this.objectsOf("storage");
    this.addInteractable(storage, "storage", () => ui.prompt.storage, () => store().openOverlay("storage"));
    const [travel] = this.objectsOf("travel");
    this.addInteractable(travel, "travel", () => ui.prompt.travel, () => store().openOverlay("travel"));
    const [board] = this.objectsOf("decorboard");
    this.addInteractable(board, "decorboard", () => ui.prompt.decorBoard, () => store().openOverlay("decor"));

    // แมพที่ไม่มีห้องเรียน (แมพ 3) ไม่มีประตูห้อง: เริ่มที่หน้าประตูโรงเก็บหุ่น
    const start = this.from.travel ? travel : this.from.hangar ? gate : (this.doors.find((door) => door.index === this.from.room) ?? this.doors[0] ?? gate);
    const spot = this.spotBelow(start);
    this.createPlayer(spot.x, spot.y);
    this.syncWithProgress();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.syncWithProgress();
  }

  /** ประตู ป้ายเลขห้อง ลูกศรชี้เป้าหมาย และของตกแต่งตามความคืบหน้าและสิ่งที่ผู้เล่นเลือกวาง */
  private syncWithProgress(): void {
    const state = useGameStore.getState();
    const cleared = (zone: number) => this.zones[zone - 1].topics.every((topic) => roomProgress(state, topic).core);
    for (const door of this.doors) this.placed.get(door)?.setTexture(isRoomUnlocked(state, door.index as number) ? "pr_door_open" : "pr_door_locked");

    // ของตกแต่งที่ผู้เล่นวางเองในโถงของแมพนี้
    this.syncDecor(this.world, "hall");

    const battle = pendingBattle(state);
    const nextZone = this.doors.map((door) => door.index as number).find((zone) => !cleared(zone));
    // ชนะครบทุกด่านของแมพนี้และแมพถัดไปเปิดแล้ว: ชี้ไปที่กระดานแผนที่
    const onward = DIFFICULTIES[mapIndex(this.world) + 1];
    const travel = battle === null && nextZone === undefined && allBattlesWon(state) && onward !== undefined && mapUnlocked(state, onward) && difficultyOf(state) === this.world;
    this.pointAt(battle !== null ? "gate" : nextZone ? `door-${nextZone}` : travel ? "travel" : null);

    const labels = this.doors.map((door) => {
      const zone = door.index as number;
      const tone = cleared(zone) ? ("done" as const) : isRoomUnlocked(state, zone) ? ("default" as const) : ("locked" as const);
      return { id: `door-${zone}`, x: objectX(door), y: objectBaseY(door) - 58, text: String(zone), tone };
    });
    if (JSON.stringify(labels) !== JSON.stringify(state.labels)) state.setLabels(labels);
  }
}
