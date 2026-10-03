// แผนที่ของทุกฉาก: โถง โรงเก็บหุ่น และห้องของแต่ละระดับความยาก แต่ละห้องมีผังไม่เหมือนกัน (docs/GDD.md ข้อ 3, 5 และ 15)
// ไฟล์นี้เป็นข้อมูลล้วน ไม่ import Phaser จึงทดสอบได้ว่าผู้เล่นเดินถึงทุกจุดโต้ตอบ (maps.test.ts)
import type { Difficulty } from "../state/campaign";
import type { NpcId } from "../state/npcs";
import type { DecorSize } from "../state/shop.config";
import { MAP_COLS, MAP_ROWS, MAP_TOP, TILE } from "./constants";

export type ObjectKind =
  /** ประตูกลับโถง (ในห้องและโรงเก็บหุ่น) หรือประตูเข้าห้อง index (ในโถง) */
  | "door"
  | "station"
  /** คลังความรู้: บทสอนทั้งหัวข้อ เปิดอ่านได้โดยไม่บังคับ (ระดับกลาง) */
  | "archive"
  | "minigame"
  | "review"
  | "core"
  | "field"
  | "shop"
  /** กล่องเก็บไอเทม: อุปกรณ์ของการ์เดียนและกระเป๋าของใช้ (โถงและโรงเก็บหุ่น) */
  | "storage"
  /** กระดานแผนที่การเดินทาง: ไปแมพอื่นที่เปิดแล้ว (โถงของทุกแมพ) */
  | "travel"
  /** กระดานตกแต่งโถง: เลือกของตกแต่งมาวางในช่องตกแต่ง */
  | "decorboard"
  /** ช่องตกแต่งของโถง: ว่างจนกว่าผู้เล่นจะเลือกของมาวาง (ช่องตั้งพื้นกันทางเดินเฉพาะตอนมีของวาง maps.test.ts ตรวจผังโดยนับเป็นสิ่งกีดขวางเสมอ) */
  | "slot"
  /** จอตัวอย่างและวิดีโอเสริมของหัวข้อ (ห้องเรียนของแมพ 1) โต้ตอบได้เมื่อครูกำหนดรายการไว้ใน extras.json */
  | "extras"
  | "gate"
  | "console"
  | "wardrobe"
  | "hologram"
  /** แท่นการ์เดียน: หุ่นบนแท่นแสดงอุปกรณ์ที่ใส่ กดแล้วใส่อาวุธ เกราะ ชิป และสี */
  | "robot"
  /** ตู้กระจกเก็บแกน AI ที่เก็บได้ */
  | "corecase"
  /** แท่นปรับแต่งพี่บิต: คอสตูมและโมดูล (วางราบกับพื้น) */
  | "bitpad"
  /** NPC ประจำห้อง (src/state/npcs.ts) */
  | "npc"
  /** ของที่ผู้เล่นเก็บในเควสเสริมของ NPC วางราบกับพื้น เห็นเฉพาะตอนที่รับเควสแล้วและยังไม่ได้เก็บ */
  | "pickup"
  | "decor";

export interface MapObject {
  kind: ObjectKind;
  /** คีย์ภาพใน assets-manifest.json */
  prop: string;
  /** ช่องซ้ายสุดของฐานวัตถุ (เป็นทศนิยมได้เพื่อวางคร่อมสองช่อง) และแถวของฐาน */
  col: number;
  row: number;
  /** ความกว้างของภาพเป็นจำนวนไทล์ (ไม่ระบุ = 1) */
  w?: number;
  /** ติดผนัง: ฐานอยู่ที่ขอบล่างของช่องผนัง ไม่กันทางเดิน */
  mount?: boolean;
  /** วางราบกับพื้น (พรม ลายบนพื้น ของที่เก็บได้): ไม่กันทางเดิน ผู้เล่นเดินทับได้ */
  flat?: boolean;
  /** NPC เจ้าของวัตถุนี้ (ตัว NPC เอง หรือของที่เก็บในเควสของ NPC คนนั้น) */
  npc?: NpcId;
  /** ลำดับสถานี (เริ่มที่ 0) หรือเลขห้องของประตูในโถง */
  index?: number;
  /** ช่องตกแต่ง: รหัสช่อง (คีย์ใน ShopState.decor) และขนาดของของที่วางได้ */
  slot?: { id: string; size: DecorSize };
  /** หัวข้อ (1–6) ที่วัตถุนี้เป็นของ ใช้ในห้องที่มีหลายหัวข้อ ไม่ระบุ = หัวข้อเดียวของห้อง หรือ (เครื่องฝึกของระดับยาก) หัวข้อถัดไปที่ยังไม่ผ่าน */
  topic?: number;
}

export interface GameMap {
  tileset: string;
  /** ผังห้อง MAP_ROWS แถว แถวละ MAP_COLS ตัว: # = ผนัง, . = พื้น */
  shape: string[];
  /** ช่องที่ผู้เล่นเริ่มยืน */
  spawn: { col: number; row: number };
  objects: MapObject[];
}

const RECT = [
  "####################",
  "####################",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "####################",
];

const TERMINAL = "pr_station_terminal";
const backDoor = (col: number): MapObject => ({ kind: "door", prop: "pr_door_open", col, row: 1, mount: true });
const station = (index: number, col: number, row: number, prop = TERMINAL, w = 1): MapObject => ({ kind: "station", prop, col, row, w, index });
const decor = (prop: string, col: number, row: number, w = 2, mount = false): MapObject => ({ kind: "decor", prop, col, row, w, mount });
/** ของตกแต่งติดผนัง (หน้าต่าง จอ โปสเตอร์) และลายบนพื้น (พรม ตรา) ไม่กันทางเดิน */
const wall = (prop: string, col: number, row = 1, w = 2): MapObject => ({ kind: "decor", prop, col, row, w, mount: true });
const floor = (prop: string, col: number, row: number, w = 2): MapObject => ({ kind: "decor", prop, col, row, w, flat: true });
const WINDOW = "pr_decor_window";
const SCREENS = "pr_decor_wall_screens";
const PLANT = "pr_hall_plant";
const LAMP = "pr_decor_lamp";

const person = (npc: NpcId, col: number, row: number): MapObject => ({ kind: "npc", prop: `npc_${npc}`, col, row, npc });
const PICKUP_PROP: Partial<Record<NpcId, string>> = { mechanic: "pr_pickup_bolt", foreman: "pr_pickup_gear", ranger: "pr_pickup_beacon" };
/** จอตัวอย่างและวิดีโอเสริมของหัวข้อ ติดผนัง (เป็นของตกแต่งเฉย ๆ ถ้าครูยังไม่ได้กำหนดรายการ) */
const extras = (topic: number, col: number, row = 1): MapObject => ({ kind: "extras", prop: SCREENS, col, row, w: 2, mount: true, topic });
/** ช่องตกแต่งของโถง: ภาพในผังเป็นตัวแทนขนาดของช่อง (ฉากแสดงของที่ผู้เล่นเลือกวาง หรือไม่แสดงอะไรถ้าช่องว่าง) */
const SLOT_PROP: Record<DecorSize, string> = { wall: WINDOW, big: "pr_decor_trophy_case", small: PLANT };
const slot = (id: string, size: DecorSize, col: number, row = 1): MapObject => ({ kind: "slot", prop: SLOT_PROP[size], col, row, w: size === "small" ? 1 : 2, mount: size === "wall", slot: { id, size } });
/** ของของเควสเสริม วางตามช่องที่ให้ (ลำดับในรายการคือ index ของชิ้น) */
const pickups = (npc: NpcId, cells: [col: number, row: number][]): MapObject[] => cells.map(([col, row], index): MapObject => ({ kind: "pickup", prop: PICKUP_PROP[npc] as string, col, row, flat: true, npc, index }));

/**
 * โถงของแต่ละแมพ (GDD ข้อ 3 และ 15): ผัง ชุดไทล์ และตำแหน่งของต่างกัน ทุกโถงมีประตูห้องตามจำนวนห้องของแมพ ประตูโรงเก็บหุ่นตรงกลาง
 * ร้านสหกรณ์ กล่องเก็บไอเทม กระดานแผนที่การเดินทาง กระดานตกแต่ง และช่องตกแต่ง 7 ช่อง (ผนัง 2 ชิ้นใหญ่ 2 ชิ้นเล็ก 3)
 */
const HALLS: Record<Difficulty, GameMap> = {
  // แมพ 1 Pixel AI Lab: โถงโล่ง 6 ประตู
  easy: {
    tileset: "ts_common",
    shape: RECT,
    spawn: { col: 2, row: 3 },
    objects: [
      ...[2, 5, 8, 11, 14, 17].map((col, i): MapObject => ({ kind: "door", prop: "pr_door_locked", col, row: 1, mount: true, index: i + 1 })),
      { kind: "gate", prop: "pr_hangar_gate", col: 9, row: 1, w: 2, mount: true },
      { kind: "shop", prop: "pr_shop", col: 2, row: 8, w: 2 },
      { kind: "storage", prop: "pr_storage_box", col: 5, row: 8, w: 2 },
      { kind: "travel", prop: "pr_travel_board", col: 8, row: 8, w: 2 },
      { kind: "decorboard", prop: "pr_decor_board", col: 11, row: 8 },
      wall(SCREENS, 6),
      wall(WINDOW, 15),
      slot("wall1", "wall", 3),
      slot("wall2", "wall", 12),
      slot("big1", "big", 15, 6),
      slot("big2", "big", 3, 5),
      slot("small1", "small", 1, 5),
      slot("small2", "small", 18, 5),
      slot("small3", "small", 18, 8),
      floor("pr_decor_rug", 9, 4),
      decor("pr_hall_bench", 13, 9),
    ],
  },
  // แมพ 2 ศูนย์วิจัยภาคสนาม: ลานไม้มีเสาสองคู่ 3 ประตู
  normal: {
    tileset: "ts_outpost",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..##..........##..#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 2, row: 3 },
    objects: [
      ...[4, 7, 13].map((col, i): MapObject => ({ kind: "door", prop: "pr_door_locked", col, row: 1, mount: true, index: i + 1 })),
      { kind: "gate", prop: "pr_hangar_gate", col: 9, row: 1, w: 2, mount: true },
      { kind: "travel", prop: "pr_travel_board", col: 2, row: 8, w: 2 },
      { kind: "decorboard", prop: "pr_decor_board", col: 5, row: 8 },
      { kind: "storage", prop: "pr_storage_box", col: 12, row: 8, w: 2 },
      { kind: "shop", prop: "pr_shop", col: 15, row: 8, w: 2 },
      wall("pr_decor_tool_rack", 11),
      slot("wall1", "wall", 1),
      slot("wall2", "wall", 15),
      slot("big1", "big", 7, 6),
      slot("big2", "big", 11, 6),
      slot("small1", "small", 1, 6),
      slot("small2", "small", 18, 6),
      slot("small3", "small", 18, 3),
      floor("pr_decor_rug", 9, 3),
      decor("pr_decor_crates", 8, 9, 1),
    ],
  },
  // แมพ 3 ป้อมปราการภูเขาไฟ: ลานป้อมเหล็กดำ ไม่มีห้องเรียน (ลุยด่านต่อสู้อย่างเดียว) ประตูโรงเก็บหุ่นตรงกลาง
  hard: {
    tileset: "ts_fortress",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#....#........#....#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 2, row: 3 },
    objects: [
      { kind: "gate", prop: "pr_hangar_gate", col: 9, row: 1, w: 2, mount: true },
      wall("pr_decor_tool_rack", 5),
      { kind: "shop", prop: "pr_shop", col: 2, row: 8, w: 2 },
      { kind: "storage", prop: "pr_storage_box", col: 6, row: 8, w: 2 },
      { kind: "travel", prop: "pr_travel_board", col: 12, row: 8, w: 2 },
      { kind: "decorboard", prop: "pr_decor_board", col: 16, row: 8 },
      wall(SCREENS, 16),
      slot("wall1", "wall", 2),
      slot("wall2", "wall", 13),
      slot("big1", "big", 16, 4),
      slot("big2", "big", 9, 6),
      slot("small1", "small", 1, 6),
      slot("small2", "small", 18, 6),
      slot("small3", "small", 12, 3),
      floor("pr_decor_hazard_floor", 9, 3),
      decor("pr_decor_energy_tanks", 9, 9),
    ],
  },
};

/** โถงของแมพ */
export const hallMapOf = (difficulty: Difficulty): GameMap => HALLS[difficulty];

/** ช่องตกแต่งของแผนที่ ตามลำดับในผัง */
export const slotsOf = (map: GameMap): MapObject[] => map.objects.filter((object) => object.kind === "slot");

/**
 * โรงเก็บหุ่นของแต่ละแมพ (ผังและไทล์เซตต่างกัน) ทุกโรงมีจุดปรับแต่งแยกกันตามที่ผู้ใช้กำหนด:
 * แท่นการ์เดียน (robot: ใส่อาวุธ เกราะ ชิป และสี หุ่นบนแท่นแสดงอุปกรณ์ที่ใส่) ตู้เสื้อผ้า (wardrobe: ชุดของผู้เล่น)
 * แท่นปรับแต่งพี่บิต (bitpad: คอสตูมและโมดูลของพี่บิต) ตู้กระจกเก็บแกน AI (corecase) แผงสั่งปฏิบัติการ (console)
 * กล่องเก็บไอเทม (storage) และเครื่องฉายข้อความของอาจารย์ (hologram) แมพ 3 ไม่มีห้องเรียน NPC ของแมพนี้จึงอยู่ในโรงเก็บหุ่น
 */
const HANGARS: Record<Difficulty, GameMap> = {
  easy: {
    tileset: "ts_hangar",
    shape: RECT,
    spawn: { col: 2, row: 3 },
    objects: [
      backDoor(2),
      { kind: "robot", prop: "pr_guardian_bay", col: 8.5, row: 4, w: 3 },
      { kind: "corecase", prop: "pr_core_case", col: 12, row: 4, w: 2 },
      { kind: "console", prop: "pr_mission_console", col: 9, row: 7, w: 2 },
      { kind: "hologram", prop: "pr_hologram", col: 5, row: 2 },
      { kind: "wardrobe", prop: "pr_wardrobe", col: 16, row: 2 },
      { kind: "bitpad", prop: "pr_bit_pad", col: 4, row: 6, w: 2, flat: true },
      { kind: "storage", prop: "pr_storage_box", col: 13, row: 8, w: 2 },
      wall("pr_decor_tool_rack", 7),
      wall("pr_decor_tool_rack", 12),
      wall(SCREENS, 17),
      decor("pr_decor_energy_tanks", 5, 4),
      floor("pr_decor_hazard_floor", 9, 9),
      decor("pr_decor_crates", 18, 8, 1),
      decor("pr_decor_crates", 1, 8, 1),
    ],
  },
  // แมพ 2: โรงซ่อมริมทะเล ผนังสองช่วงกั้นเป็นอู่ซ่อมกับลานเตรียมพร้อม
  normal: {
    tileset: "ts_hangar2",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#######......#######",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 2, row: 3 },
    objects: [
      backDoor(2),
      { kind: "robot", prop: "pr_guardian_bay", col: 8.5, row: 3, w: 3 },
      { kind: "corecase", prop: "pr_core_case", col: 15, row: 3, w: 2 },
      { kind: "wardrobe", prop: "pr_wardrobe", col: 5, row: 2 },
      { kind: "hologram", prop: "pr_hologram", col: 18, row: 2 },
      { kind: "console", prop: "pr_mission_console", col: 4, row: 8, w: 2 },
      { kind: "bitpad", prop: "pr_bit_pad", col: 14, row: 7, w: 2, flat: true },
      { kind: "storage", prop: "pr_storage_box", col: 9, row: 8, w: 2 },
      wall("pr_decor_tool_rack", 11),
      wall(WINDOW, 13),
      decor("pr_decor_crates", 1, 6, 1),
      decor("pr_decor_crates", 18, 9, 1),
      decor("pr_decor_energy_tanks", 17, 6),
      floor("pr_decor_hazard_floor", 9, 6),
    ],
  },
  // แมพ 3: โรงเก็บหุ่นในป้อมบนปล่องภูเขาไฟ เสาเหล็กสี่ต้น กัปตันกับนายคลังแสงประจำอยู่ที่นี่
  hard: {
    tileset: "ts_hangar3",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..#............#..#",
      "#..................#",
      "#..................#",
      "#..#............#..#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      { kind: "robot", prop: "pr_guardian_bay", col: 8.5, row: 4, w: 3 },
      { kind: "corecase", prop: "pr_core_case", col: 5, row: 4, w: 2 },
      { kind: "console", prop: "pr_mission_console", col: 9, row: 8, w: 2 },
      { kind: "wardrobe", prop: "pr_wardrobe", col: 15, row: 2 },
      { kind: "hologram", prop: "pr_hologram", col: 17, row: 2 },
      { kind: "bitpad", prop: "pr_bit_pad", col: 13, row: 5, w: 2, flat: true },
      { kind: "storage", prop: "pr_storage_box", col: 5, row: 8, w: 2 },
      wall(SCREENS, 6),
      wall("pr_decor_tool_rack", 11),
      decor("pr_r3_server_rack", 18, 9, 1),
      floor("pr_decor_hazard_floor", 9, 6),
      person("captain", 14, 8),
      person("keeper", 2, 6),
    ],
  },
};

/** โรงเก็บหุ่นของแมพ */
export const hangarMapOf = (difficulty: Difficulty): GameMap => HANGARS[difficulty];

export const roomMaps: Record<number, GameMap> = {
  // ห้อง 1 ห้องปฐมนิเทศ: ห้องโล่ง สถานีเรียงริมผนังบน มีเสาสองต้น
  1: {
    tileset: "ts_r1",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#....##......##....#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      station(0, 4, 2),
      station(1, 7, 2),
      station(2, 10, 2),
      station(3, 13, 2),
      station(4, 16, 2),
      decor("pr_r1_photo_board", 17, 1, 2, true),
      decor("pr_r1_rule_machine", 1, 7),
      decor("pr_r1_mail_sorter", 16, 5),
      { kind: "review", prop: "pr_notebook_desk", col: 4, row: 8, w: 2 },
      { kind: "core", prop: "pr_core_pedestal", col: 9.5, row: 7 },
      { kind: "minigame", prop: "pr_r1_learning_machine", col: 14, row: 8, w: 2 },
      wall(WINDOW, 5),
      extras(1, 11),
      wall(WINDOW, 14),
      floor("pr_r1_ring_emblem", 9, 5),
      decor(PLANT, 18, 9, 1),
      decor(LAMP, 18, 7, 1),
      person("mechanic", 2, 5),
      ...pickups("mechanic", [[8, 6], [18, 3], [12, 9]]),
    ],
  },
  // ห้อง 2 โรงฝึกสามสาย: สามคอกด้านบน คอกละหนึ่งสถานี พื้นที่รวมด้านล่าง
  2: {
    tileset: "ts_r2",
    shape: [
      "####################",
      "####################",
      "#.....#......#.....#",
      "#.....#......#.....#",
      "#.....#......#.....#",
      "#.....#......#.....#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      station(0, 3, 2),
      decor("pr_r2_basket_supervised", 4, 4),
      station(1, 9.5, 2),
      decor("pr_r2_basket_unsupervised", 11, 4),
      station(2, 16, 2),
      decor("pr_r2_basket_reinforcement", 14, 4),
      decor("pr_r2_maze_arena", 17, 5),
      station(3, 9.5, 6),
      { kind: "review", prop: "pr_notebook_desk", col: 2, row: 8, w: 2 },
      { kind: "minigame", prop: "pr_r2_flashcard_desk", col: 12, row: 8, w: 2 },
      { kind: "core", prop: "pr_core_pedestal", col: 16.5, row: 8 },
      wall(WINDOW, 4),
      extras(2, 7),
      wall(WINDOW, 11),
      decor("pr_r2_compare_board", 1, 4),
      decor("pr_r2_cluster_table", 7, 4),
      decor(PLANT, 1, 9, 1),
      decor(LAMP, 18, 9, 1),
      person("coach", 6, 8),
    ],
  },
  // ห้อง 3 คลังข้อมูล: ห้องรูปตัวแอล ชั้นเก็บของเรียงตามผนัง
  3: {
    tileset: "ts_r3",
    shape: [
      "####################",
      "####################",
      "#..........#########",
      "#..........#########",
      "#..........#########",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      station(0, 3, 2),
      decor("pr_r3_cabinet_structured", 5, 2),
      station(1, 8, 2),
      decor("pr_r3_crate_unstructured", 9, 4),
      decor("pr_r3_server_rack", 11, 5, 1),
      station(2, 13, 5),
      decor("pr_r3_server_rack", 15, 5, 1),
      station(3, 17, 5),
      { kind: "review", prop: "pr_notebook_desk", col: 3, row: 8, w: 2 },
      { kind: "core", prop: "pr_core_pedestal", col: 9.5, row: 8 },
      { kind: "minigame", prop: "pr_r3_quality_scanner", col: 14, row: 8, w: 2 },
      wall(WINDOW, 9),
      extras(3, 6),
      decor("pr_r3_label_printer", 10, 2, 1),
      decor("pr_r3_compare_board", 6, 9),
      decor("pr_r3_intake_table", 17, 8),
      decor("pr_decor_bookshelf", 1, 5),
      person("archivist", 6, 6),
    ],
  },
  // ห้อง 4 โรงงานโมเดล: ทางเดินวกกลับตามสายการผลิต สถานีเรียงตามลำดับขั้นตอน
  4: {
    tileset: "ts_r4",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "################...#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      station(0, 3, 2),
      station(1, 5, 2, "pr_r4_station_collect", 2),
      station(2, 8, 2, "pr_r4_station_prepare", 2),
      station(3, 11, 2, "pr_r4_station_split", 2),
      station(4, 14, 2, "pr_r4_station_train", 2),
      station(5, 13, 6, "pr_r4_station_evaluate", 2),
      station(6, 10, 6, "pr_r4_station_deploy", 2),
      { kind: "minigame", prop: "pr_r4_calculator", col: 7, row: 6, w: 2 },
      { kind: "review", prop: "pr_notebook_desk", col: 4, row: 6, w: 2 },
      { kind: "core", prop: "pr_core_pedestal", col: 1.5, row: 6 },
      wall("pr_decor_tool_rack", 17),
      extras(4, 2, 5),
      decor("pr_decor_crates", 18, 2, 1),
      decor("pr_decor_vending", 1, 9, 1),
      decor("pr_decor_energy_tanks", 14, 9),
      person("foreman", 17, 8),
      ...pickups("foreman", [[2, 4], [16, 4], [9, 9], [18, 6]]),
    ],
  },
  // ห้อง 5 ลานชีวิตประจำวัน: ลานมุมมน ระบบในชีวิตประจำวันตั้งรอบลาน
  5: {
    tileset: "ts_r5",
    shape: [
      "####################",
      "####################",
      "###..............###",
      "##................##",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "##................##",
      "###..............###",
      "####################",
    ],
    spawn: { col: 4, row: 3 },
    objects: [
      backDoor(4),
      station(0, 6, 2),
      station(1, 9, 2),
      station(2, 12, 2),
      station(3, 15, 2),
      decor("pr_r5_tv", 1, 5),
      decor("pr_r5_face_phone", 1, 7),
      decor("pr_r5_speaker", 17, 5),
      decor("pr_r5_shop_kiosk", 17, 7),
      decor("pr_r5_mailbox", 3, 9),
      decor("pr_r5_dictation", 15, 9),
      { kind: "review", prop: "pr_notebook_desk", col: 5, row: 6, w: 2 },
      { kind: "minigame", prop: "pr_r5_notice_board", col: 9.5, row: 6 },
      { kind: "core", prop: "pr_core_pedestal", col: 13.5, row: 6 },
      wall("pr_r5_light_switch", 13, 1, 1),
      wall(WINDOW, 7),
      extras(5, 10),
      floor("pr_decor_rug", 9, 4),
      decor(LAMP, 2, 3, 1),
      decor(LAMP, 17, 3, 1),
      decor("pr_decor_vending", 12, 9, 1),
      person("vendor", 8, 8),
    ],
  },
  // ห้อง 6 สตูดิโอภาคสนาม: เวทีถ่ายทำตรงกลาง มุมซ้ายเป็นกระดานผล มุมขวาเป็นแท่นใบประกาศ
  6: {
    tileset: "ts_r6",
    shape: [
      "####################",
      "####################",
      "#......#######.....#",
      "#......#######.....#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 2, row: 3 },
    objects: [
      backDoor(2),
      decor("pr_r6_result_board", 4, 2),
      decor("pr_r6_checklist_stand", 7, 4, 1),
      { kind: "field", prop: "pr_r6_portal_pc", col: 9, row: 4, w: 2 },
      decor("pr_r6_webcam", 12, 4, 1),
      { kind: "core", prop: "pr_core_pedestal", col: 15, row: 2 },
      decor("pr_r6_cert_printer", 17, 3),
      wall("pr_r6_poster_rock", 8, 3, 1),
      wall("pr_r6_poster_paper", 11, 3, 1),
      wall("pr_r6_poster_scissors", 13, 3, 1),
      extras(6, 15, 1),
      floor("pr_decor_rug", 9, 6),
      decor("pr_decor_bookshelf", 1, 7),
      decor("pr_decor_crates", 18, 8, 1),
      decor(LAMP, 6, 5, 1),
      person("director", 13, 7),
    ],
  },
};

const archive = (topic: number, col: number, row: number): MapObject => ({ kind: "archive", prop: TERMINAL, col, row, topic });
const desk = (topic: number, col: number, row: number): MapObject => ({ kind: "review", prop: "pr_notebook_desk", col, row, w: 2, topic });
const pedestal = (topic: number, col: number, row: number): MapObject => ({ kind: "core", prop: "pr_core_pedestal", col, row, topic });
const machine = (topic: number, prop: string, col: number, row: number, w = 2): MapObject => ({ kind: "minigame", prop, col, row, w, topic });

/** แมพ 2: 3 ห้อง (หัวข้อ 1–2, 3–4 และ 5) แต่ละหัวข้อมีคลังความรู้ เครื่องฝึก โต๊ะทบทวน และแท่นแกน AI ของตัวเอง NPC ของแมพนี้ยืนประจำห้อง */
export const normalMaps: Record<number, GameMap> = {
  // ห้อง 1 (หัวข้อ 1–2): สองปีกคั่นด้วยผนังกลาง ปีกซ้ายหัวข้อ 1 ปีกขวาหัวข้อ 2
  1: {
    tileset: "ts_r2",
    shape: [
      "####################",
      "####################",
      "#........##........#",
      "#........##........#",
      "#........##........#",
      "#........##........#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      archive(1, 3, 2),
      machine(1, "pr_r1_learning_machine", 5, 2),
      desk(1, 2, 5),
      pedestal(1, 6, 5),
      archive(2, 12, 2),
      machine(2, "pr_r2_flashcard_desk", 14, 2),
      desk(2, 12, 5),
      pedestal(2, 16, 5),
      decor("pr_r2_maze_arena", 9, 8),
      wall(WINDOW, 7),
      wall(SCREENS, 17),
      decor(PLANT, 1, 9, 1),
      decor(LAMP, 18, 9, 1),
      person("smith", 4, 8),
      person("sage", 15, 8),
    ],
  },
  // ห้อง 2 (หัวข้อ 3–4): ชั้นบนหัวข้อ 3 ชั้นล่างหัวข้อ 4 เชื่อมกันด้วยช่องกลาง
  2: {
    tileset: "ts_r4",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#####........#######",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 1, row: 3 },
    objects: [
      backDoor(1),
      archive(3, 3, 2),
      machine(3, "pr_r3_quality_scanner", 5, 2),
      desk(3, 9, 2),
      pedestal(3, 13, 2),
      decor("pr_r3_server_rack", 16, 2, 1),
      archive(4, 2, 6),
      machine(4, "pr_r4_calculator", 14, 6),
      desk(4, 17, 6),
      pedestal(4, 9.5, 8),
      wall(WINDOW, 7),
      wall("pr_decor_tool_rack", 14),
      decor("pr_decor_crates", 1, 9, 1),
      person("ranger", 5, 8),
      ...pickups("ranger", [[7, 4], [11, 6], [2, 9], [18, 3]]),
    ],
  },
  // ห้อง 3 (หัวข้อ 5): ลานเดียว เครื่องฝึกกลางห้อง หมอสนามตั้งโต๊ะอยู่ด้านขวา
  3: {
    tileset: "ts_r5",
    shape: [
      "####################",
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#......######......#",
      "#..................#",
      "#..................#",
      "#..................#",
      "####################",
    ],
    spawn: { col: 2, row: 3 },
    objects: [
      backDoor(2),
      archive(5, 5, 2),
      machine(5, "pr_r5_notice_board", 9.5, 4, 1),
      desk(5, 12, 2),
      pedestal(5, 16, 3),
      decor("pr_r5_speaker", 2, 8),
      decor("pr_r5_mailbox", 16, 8),
      wall(WINDOW, 8),
      wall(SCREENS, 16),
      floor("pr_decor_rug", 9, 8),
      decor(LAMP, 1, 5, 1),
      person("medic", 14, 5),
    ],
  },
};

/** แมพ 3: ห้องเดียว ไม่มีบทสอน เครื่องทดสอบรวมตรงกลางทำเควสของหัวข้อ 1–5 ทีละหัวข้อ ผ่านแล้วได้แกน AI ทันที */
/** แมพ 3 ไม่มีห้องเรียน (ลุยด่านต่อสู้อย่างเดียว GDD ข้อ 15) */
export const hardMaps: Record<number, GameMap> = {};

/** แผนที่ของห้องลำดับที่ zone ของแมพ */
export const zoneMap = (difficulty: Difficulty, zone: number): GameMap => (difficulty === "easy" ? roomMaps : difficulty === "normal" ? normalMaps : hardMaps)[zone];

// ---------------------------------------------------------------- เรขาคณิต

export const isFloorCell = (map: GameMap, col: number, row: number): boolean =>
  row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS && map.shape[row][col] === ".";

/** จุดกึ่งกลางแนวนอนของวัตถุ (พิกเซล) */
export const objectX = (object: MapObject): number => (object.col + (object.w ?? 1) / 2) * TILE;

/** ตำแหน่งฐานของวัตถุ (พิกเซล): ติดผนัง = ขอบล่างของช่อง, ตั้งพื้น = เหนือขอบล่างเล็กน้อย */
export const objectBaseY = (object: MapObject): number => MAP_TOP + (object.row + 1) * TILE - (object.mount ? 0 : 4);

/** จุดที่ผู้เล่นยืนโต้ตอบ: หน้าวัตถุเล็กน้อย */
export const interactSpot = (object: MapObject): { x: number; y: number } =>
  object.flat ? cellSpot(Math.floor(object.col), object.row) : { x: objectX(object), y: objectBaseY(object) + (object.mount ? 14 : 12) };

/** จุดยืนของผู้เล่นในช่อง (พิกเซล) */
export const cellSpot = (col: number, row: number): { x: number; y: number } => ({ x: col * TILE + TILE / 2, y: MAP_TOP + row * TILE + 20 });

/** ช่องที่ฐานของวัตถุตั้งพื้นกินพื้นที่ (กันทางเดิน) */
export function blockedCells(object: MapObject): { col: number; row: number }[] {
  if (object.mount || object.flat) return [];
  const cells = [];
  for (let col = Math.floor(object.col); col < Math.ceil(object.col + (object.w ?? 1)); col++) cells.push({ col, row: object.row });
  return cells;
}

/** ช่องพื้นที่เดินถึงได้จากจุดเริ่ม (เดิน 4 ทิศ ไม่ทะลุผนังและวัตถุ) ในรูป "col,row" */
export function reachableCells(map: GameMap): Set<string> {
  const blocked = new Set(map.objects.flatMap(blockedCells).map((cell) => `${cell.col},${cell.row}`));
  const open = (col: number, row: number) => isFloorCell(map, col, row) && !blocked.has(`${col},${row}`);
  const seen = new Set<string>();
  const queue = [map.spawn];
  while (queue.length > 0) {
    const { col, row } = queue.pop() as { col: number; row: number };
    const key = `${col},${row}`;
    if (seen.has(key) || !open(col, row)) continue;
    seen.add(key);
    queue.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
  }
  return seen;
}

/** ช่องที่ผู้เล่นยืนแล้วโต้ตอบกับวัตถุได้: ช่องใต้ฐานของวัตถุ (ของที่วางราบกับพื้น: ช่องของมันเอง) */
export function accessCells(object: MapObject): { col: number; row: number }[] {
  if (object.flat) return [{ col: Math.floor(object.col), row: object.row }];
  const cells = [];
  for (let col = Math.floor(object.col); col < Math.ceil(object.col + (object.w ?? 1)); col++) cells.push({ col, row: object.row + 1 });
  return cells;
}
