// แผนที่ของทุกฉาก: โถง โรงเก็บหุ่น และห้อง 1–6 แต่ละห้องมีผังไม่เหมือนกัน (docs/GDD.md ข้อ 3 และ 5)
// ไฟล์นี้เป็นข้อมูลล้วน ไม่ import Phaser จึงทดสอบได้ว่าผู้เล่นเดินถึงทุกจุดโต้ตอบ (maps.test.ts)
import { MAP_COLS, MAP_ROWS, MAP_TOP, TILE } from "./constants";

export type ObjectKind =
  /** ประตูกลับโถง (ในห้องและโรงเก็บหุ่น) หรือประตูเข้าห้อง index (ในโถง) */
  | "door"
  | "station"
  | "minigame"
  | "review"
  | "core"
  | "field"
  | "shop"
  | "gate"
  | "console"
  | "wardrobe"
  | "hologram"
  | "robot"
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
  /** ลำดับสถานี (เริ่มที่ 0) หรือเลขห้องของประตูในโถง */
  index?: number;
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

/** โถงทางเดิน: ประตูห้อง 1–6 ประตูโรงเก็บหุ่นตรงกลาง และร้านสหกรณ์แล็บ */
export const HALL_DOOR_COLS = [2, 5, 8, 11, 14, 17];
export const hallMap: GameMap = {
  tileset: "ts_common",
  shape: RECT,
  spawn: { col: 2, row: 3 },
  objects: [
    ...HALL_DOOR_COLS.map((col, i): MapObject => ({ kind: "door", prop: "pr_door_locked", col, row: 1, mount: true, index: i + 1 })),
    { kind: "gate", prop: "pr_hangar_gate", col: 9, row: 1, w: 2, mount: true },
    { kind: "shop", prop: "pr_shop", col: 2, row: 8, w: 2 },
    decor("pr_hall_plant", 1, 5, 1),
    decor("pr_hall_plant", 18, 5, 1),
    decor("pr_hall_bench", 8, 9),
    decor("pr_hall_bench", 12, 9),
    decor("pr_hall_plant", 17, 9, 1),
  ],
};

/** โรงเก็บหุ่น: หุ่นการ์เดียน แผงสั่งปฏิบัติการ ตู้เสื้อผ้า และเครื่องฉายข้อความของอาจารย์ */
export const hangarMap: GameMap = {
  tileset: "ts_hangar",
  shape: RECT,
  spawn: { col: 2, row: 3 },
  objects: [
    backDoor(2),
    { kind: "robot", prop: "pr_robot_dock", col: 8.5, row: 4, w: 3 },
    { kind: "console", prop: "pr_mission_console", col: 9, row: 7, w: 2 },
    { kind: "hologram", prop: "pr_hologram", col: 5, row: 2 },
    { kind: "wardrobe", prop: "pr_wardrobe", col: 16, row: 2 },
  ],
};

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
    ],
  },
};

// ---------------------------------------------------------------- เรขาคณิต

export const isFloorCell = (map: GameMap, col: number, row: number): boolean =>
  row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS && map.shape[row][col] === ".";

/** จุดกึ่งกลางแนวนอนของวัตถุ (พิกเซล) */
export const objectX = (object: MapObject): number => (object.col + (object.w ?? 1) / 2) * TILE;

/** ตำแหน่งฐานของวัตถุ (พิกเซล): ติดผนัง = ขอบล่างของช่อง, ตั้งพื้น = เหนือขอบล่างเล็กน้อย */
export const objectBaseY = (object: MapObject): number => MAP_TOP + (object.row + 1) * TILE - (object.mount ? 0 : 4);

/** จุดที่ผู้เล่นยืนโต้ตอบ: หน้าวัตถุเล็กน้อย */
export const interactSpot = (object: MapObject): { x: number; y: number } => ({ x: objectX(object), y: objectBaseY(object) + (object.mount ? 14 : 12) });

/** จุดยืนของผู้เล่นในช่อง (พิกเซล) */
export const cellSpot = (col: number, row: number): { x: number; y: number } => ({ x: col * TILE + TILE / 2, y: MAP_TOP + row * TILE + 20 });

/** ช่องที่ฐานของวัตถุตั้งพื้นกินพื้นที่ (กันทางเดิน) */
export function blockedCells(object: MapObject): { col: number; row: number }[] {
  if (object.mount) return [];
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

/** ช่องที่ผู้เล่นยืนแล้วโต้ตอบกับวัตถุได้: ช่องใต้ฐานของวัตถุ */
export function accessCells(object: MapObject): { col: number; row: number }[] {
  const cells = [];
  for (let col = Math.floor(object.col); col < Math.ceil(object.col + (object.w ?? 1)); col++) cells.push({ col, row: object.row + 1 });
  return cells;
}
