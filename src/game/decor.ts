// การจัดห้องของผู้เล่นในโถงและโรงเก็บหุ่น (docs/GDD.md ข้อ 19): ของตกแต่งที่วางเองแบบอิสระ และจุดใช้งานที่ย้ายเองได้
// ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน: กติกาว่าวางตรงไหนได้ จำนวนที่วางได้ต่อห้อง และผังของห้องเมื่อรวมของตกแต่งและจุดที่ย้ายแล้ว
import type { Difficulty } from "../state/campaign";
import { DECOR, type Decor } from "../state/shop.config";
import { MAP_COLS, MAP_ROWS } from "./constants";
import { accessCells, blockedCells, type GameMap, hallMapOf, hangarMapOf, isFloorCell, type MapObject, reachableCells } from "./maps";

/** ห้องที่ตกแต่งได้ของแต่ละแมพ */
export const DECOR_AREAS = ["hall", "hangar"] as const;
export type DecorArea = (typeof DECOR_AREAS)[number];
/** คีย์ของห้องใน ShopState.decor เช่น "easy:hall" */
export type DecorRoom = `${Difficulty}:${DecorArea}`;
export const decorRoom = (map: Difficulty, area: DecorArea): DecorRoom => `${map}:${area}`;

/** ของตกแต่งหนึ่งชิ้นที่วางแล้ว: ช่องซ้ายสุดของฐานและแถวของฐาน (ของติดผนังอยู่แถวผนังด้านบน) */
export interface DecorPlacement {
  decor: Decor;
  col: number;
  row: number;
}

/** จำนวนของตกแต่งที่วางได้ต่อห้อง (จำกัดไว้ไม่ให้ห้องรกและไม่ให้ทางเดินตัน) โรงเก็บหุ่นมีจุดปรับแต่งมากกว่าจึงวางได้น้อยกว่า */
export const DECOR_LIMIT: Record<DecorArea, number> = { hall: 8, hangar: 6 };

/** แถวของผนังด้านบนที่ของติดผนังเกาะอยู่ (แถวถัดลงมาเป็นพื้น) */
const WALL_ROW = 1;

/** ผังของห้องก่อนวางของตกแต่ง */
export const baseMapOf = (map: Difficulty, area: DecorArea): GameMap => (area === "hall" ? hallMapOf(map) : hangarMapOf(map));

/** จำนวนช่องที่ของตกแต่งกว้าง */
export const decorWidth = (decor: Decor): number => (DECOR[decor].size === "small" ? 1 : 2);

/** ของตกแต่งที่วางแล้วในรูปวัตถุของแผนที่ */
export const decorObject = ({ decor, col, row }: DecorPlacement): MapObject => ({ kind: "decor", prop: DECOR[decor].prop, col, row, w: decorWidth(decor), mount: DECOR[decor].size === "wall" });

/** ผังของห้องเมื่อรวมของตกแต่งที่วางแล้ว */
export const decoratedMap = (base: GameMap, placements: readonly DecorPlacement[]): GameMap => ({ ...base, objects: [...base.objects, ...placements.map(decorObject)] });

/**
 * เหตุที่วางไม่ได้: limit = เกินจำนวนของห้อง, duplicate = ชิ้นนี้วางอยู่ในห้องนี้แล้ว, wall = ของติดผนังต้องอยู่บนผนังด้านบนที่ว่าง,
 * floor = ของตั้งพื้นต้องอยู่บนพื้นที่ว่าง, access = บังจุดยืนหน้าประตูหรือจุดใช้งาน, blocks = ทำให้เดินไปบางจุดไม่ได้
 */
export type PlaceError = "limit" | "duplicate" | "wall" | "floor" | "access" | "blocks";

const span = (object: MapObject): [number, number] => [Math.floor(object.col), Math.ceil(object.col + (object.w ?? 1))];
const key = (col: number, row: number): string => `${col},${row}`;

/**
 * ตรวจว่าวางของชิ้นนี้ลงในห้องได้หรือไม่ (placed = ของที่วางอยู่แล้ว ไม่รวมชิ้นที่กำลังย้าย) คืน null ถ้าวางได้
 * ทุกจุดโต้ตอบของห้อง (ประตู ร้าน แท่น NPC) ต้องยังเดินถึงได้ และช่องยืนหน้าจุดเหล่านั้นต้องว่าง
 */
export function placementError(base: GameMap, area: DecorArea, placed: readonly DecorPlacement[], candidate: DecorPlacement): PlaceError | null {
  if (placed.length >= DECOR_LIMIT[area]) return "limit";
  if (placed.some((p) => p.decor === candidate.decor)) return "duplicate";
  const { col, row } = candidate;
  if (!Number.isInteger(col) || !Number.isInteger(row)) return DECOR[candidate.decor].size === "wall" ? "wall" : "floor";
  const width = decorWidth(candidate.decor);
  const current = decoratedMap(base, placed);
  const cols = Array.from({ length: width }, (_, i) => col + i);

  if (DECOR[candidate.decor].size === "wall") {
    // บนผนังด้านบน: ทุกช่องต้องเป็นผนังที่มีพื้นอยู่ข้างใต้ และไม่ทับของติดผนังชิ้นอื่น (ประตู จอ ของตกแต่ง)
    if (row !== WALL_ROW || col < 0 || col + width > MAP_COLS) return "wall";
    if (!cols.every((c) => !isFloorCell(base, c, WALL_ROW) && isFloorCell(base, c, WALL_ROW + 1))) return "wall";
    const taken = current.objects.filter((object) => object.mount && object.row === WALL_ROW).map(span);
    return taken.some(([from, to]) => col < to && col + width > from) ? "wall" : null;
  }

  // ตั้งพื้น: ทุกช่องต้องเป็นพื้นที่ไม่มีวัตถุตั้งอยู่และไม่มีของวางราบ (แท่น พรม)
  const blocked = new Set(current.objects.flatMap(blockedCells).map((cell) => key(cell.col, cell.row)));
  const flat = new Set(current.objects.filter((object) => object.flat).flatMap((object) => Array.from({ length: span(object)[1] - span(object)[0] }, (_, i) => key(span(object)[0] + i, object.row))));
  if (!cols.every((c) => isFloorCell(base, c, row) && !blocked.has(key(c, row)) && !flat.has(key(c, row)))) return "floor";
  // จุดเริ่มของผู้เล่นและช่องยืนหน้าจุดโต้ตอบทุกจุดต้องว่าง (ผู้เล่นโผล่ที่หน้าประตูเมื่อเข้าห้อง)
  const stations = base.objects.filter((object) => object.kind !== "decor");
  const reserved = new Set([key(base.spawn.col, base.spawn.row), ...stations.flatMap(accessCells).map((cell) => key(cell.col, cell.row))]);
  if (cols.some((c) => reserved.has(key(c, row)))) return "access";
  // วางแล้วต้องยังเดินถึงทุกจุดโต้ตอบ
  const reachable = reachableCells(decoratedMap(base, [...placed, candidate]));
  return stations.every((object) => accessCells(object).some((cell) => reachable.has(key(cell.col, cell.row)))) ? null : "blocks";
}

/** ของตกแต่งที่วางได้จริงตามกติกา ตามลำดับที่บันทึกไว้ (ข้อมูลที่ผิดหรือขัดกับผังปัจจุบันถูกข้าม) */
export function validPlacements(base: GameMap, area: DecorArea, placements: readonly DecorPlacement[]): DecorPlacement[] {
  const kept: DecorPlacement[] = [];
  for (const placement of placements) if (placementError(base, area, kept, placement) === null) kept.push(placement);
  return kept;
}

/** ช่องทั้งหมดที่วางของชิ้นนี้ได้ (ใช้ไฮไลต์บนกระดานตกแต่ง) */
export function openCells(base: GameMap, area: DecorArea, placed: readonly DecorPlacement[], decor: Decor): { col: number; row: number }[] {
  const cells = [];
  const rows = DECOR[decor].size === "wall" ? [WALL_ROW] : base.shape.map((_, row) => row);
  for (const row of rows) for (let col = 0; col < MAP_COLS; col++) if (placementError(base, area, placed, { decor, col, row }) === null) cells.push({ col, row });
  return cells;
}

// ---------------------------------------------------------------- จุดใช้งานและเสาที่ผู้เล่นย้ายเองได้ (GDD ข้อ 19)

/**
 * จุดใช้งานเริ่มต้นของโถงและโรงเก็บหุ่นที่ผู้เล่นย้ายตำแหน่งเองได้ (ชนิดของวัตถุในผัง แต่ละห้องมีชนิดละจุดเดียว)
 * ที่ย้ายไม่ได้: ประตูและประตูโรงเก็บหุ่น (ติดผนัง ลำดับห้องต้องคงเดิม) ตู้กระจกเก็บแกน AI (ผู้ใช้กำหนดว่าไม่ต้องแก้) และ NPC
 */
export const STATIONS = ["shop", "storage", "travel", "decorboard", "robot", "console", "hologram", "wardrobe", "bitpad"] as const;
export type Station = (typeof STATIONS)[number];
/**
 * เสาและผนังกั้นกลางห้อง (ช่องผนังที่อยู่ในพื้นที่ของห้อง ไม่ใช่ผนังรอบห้อง) ผู้เล่นย้ายได้เหมือนจุดใช้งาน
 * เรียงเลขตามแถวแล้วตามช่องของผังเริ่มต้น ห้องหนึ่งมีได้ไม่เกิน 4 ชิ้น (มีเทสต์ตรวจ)
 */
export const PILLARS = ["pillar1", "pillar2", "pillar3", "pillar4"] as const;
export type Pillar = (typeof PILLARS)[number];
/** ชิ้นของห้องที่ย้ายได้: จุดใช้งานหรือเสา */
export type Piece = Station | Pillar;
export const PIECES: readonly Piece[] = [...STATIONS, ...PILLARS];
/** ตำแหน่งที่ผู้เล่นย้ายชิ้นของห้องไป (ช่องซ้ายสุดและแถวของฐาน) ชิ้นที่ไม่อยู่ในนี้อยู่ที่ตำแหน่งเริ่มต้นของผัง */
export type RoomLayout = Partial<Record<Piece, { col: number; row: number }>>;

const isStation = (kind: string): kind is Station => STATIONS.some((station) => station === kind);

/** พื้นที่ภายในห้อง (ไม่รวมผนังรอบห้อง): เสาอยู่ได้ในบริเวณนี้ */
const INNER = { top: 2, bottom: MAP_ROWS - 2, left: 1, right: MAP_COLS - 2 };
/** เสาย้ายไปชิดผนังด้านบนไม่ได้ (แถวนั้นเป็นที่ยืนหน้าประตูและของติดผนัง) */
const PILLAR_TOP = INNER.top + 1;

export interface PillarSpec {
  id: Pillar;
  col: number;
  row: number;
  /** ความกว้างเป็นจำนวนช่อง (เสา 1–2 ช่อง ผนังกั้นยาวกว่านั้น) */
  w: number;
}

/** จุดใช้งานที่ย้ายได้ของห้องนี้ ตามลำดับใน STATIONS */
export const stationsIn = (base: GameMap): Station[] => STATIONS.filter((station) => base.objects.some((object) => object.kind === station));

/** เสาและผนังกั้นของผังเริ่มต้น: ช่องผนังที่ต่อกันในแถวเดียวกันภายในห้อง */
export function pillarsIn(base: GameMap): PillarSpec[] {
  const runs: { col: number; row: number; w: number }[] = [];
  for (let row = INNER.top; row <= INNER.bottom; row++) {
    let start = -1;
    for (let col = INNER.left; col <= INNER.right + 1; col++) {
      const wall = col <= INNER.right && base.shape[row][col] === "#";
      if (wall && start < 0) start = col;
      if (!wall && start >= 0) {
        runs.push({ col: start, row, w: col - start });
        start = -1;
      }
    }
  }
  return runs.slice(0, PILLARS.length).map((run, index) => ({ id: PILLARS[index], ...run }));
}

/** ชิ้นที่ย้ายได้ทั้งหมดของห้องนี้: จุดใช้งานแล้วตามด้วยเสา */
export const piecesIn = (base: GameMap): Piece[] => [...stationsIn(base), ...pillarsIn(base).map((pillar) => pillar.id)];

/** ผังของห้องเมื่อย้ายจุดใช้งานและเสาตามที่ผู้เล่นจัด (ไม่ตรวจกติกา ใช้ layoutError หรือ validLayout ก่อน) */
export function arrangedMap(base: GameMap, layout: RoomLayout): GameMap {
  const pillars = pillarsIn(base);
  let shape = base.shape;
  if (pillars.some((pillar) => layout[pillar.id])) {
    // ถอนเสาทุกต้นออกจากผังก่อน แล้วตั้งใหม่ตามตำแหน่งล่าสุด (ช่องที่อยู่นอกห้องถูกข้าม)
    const grid = base.shape.map((line) => line.split(""));
    for (const pillar of pillars) for (let i = 0; i < pillar.w; i++) grid[pillar.row][pillar.col + i] = ".";
    for (const pillar of pillars) {
      const at = layout[pillar.id] ?? pillar;
      for (let i = 0; i < pillar.w; i++) {
        const col = at.col + i;
        if (Number.isInteger(col) && Number.isInteger(at.row) && at.row >= INNER.top && at.row <= INNER.bottom && col >= INNER.left && col <= INNER.right) grid[at.row][col] = "#";
      }
    }
    shape = grid.map((line) => line.join(""));
  }
  return { ...base, shape, objects: base.objects.map((object) => (isStation(object.kind) && layout[object.kind] ? { ...object, ...layout[object.kind] } : object)) };
}

/**
 * ตรวจผังทั้งห้องหลังย้ายจุดใช้งานหรือเสา (รวมของตกแต่งที่วางอยู่) คืน null ถ้าใช้ได้:
 * วัตถุตั้งพื้นทุกชิ้นอยู่บนพื้นและไม่ทับกัน เสาอยู่ในห้องและไม่ทับกัน (floor) ช่องยืนหน้าประตูและจุดใช้งานทุกจุดรวมทั้งจุดเริ่มว่าง (access)
 * และเดินจากจุดเริ่มถึงทุกจุดใช้งานได้ (blocks) ผู้เรียนจึงย้ายของจนขังตัวเองหรือปิดทางไปห้องเรียนไม่ได้
 */
export function layoutError(base: GameMap, layout: RoomLayout, decor: readonly DecorPlacement[] = []): PlaceError | null {
  for (const at of Object.values(layout)) if (!Number.isInteger(at.col) || !Number.isInteger(at.row)) return "floor";
  const pillars = pillarsIn(base);
  for (const pillar of pillars) {
    const at = layout[pillar.id];
    if (at && (at.row < PILLAR_TOP || at.row > INNER.bottom || at.col < INNER.left || at.col + pillar.w - 1 > INNER.right)) return "floor";
  }
  const arranged = arrangedMap(base, layout);
  // เสาไม่ทับกัน: จำนวนช่องผนังภายในห้องต้องเท่ากับความกว้างรวมของเสา
  let walls = 0;
  for (let row = INNER.top; row <= INNER.bottom; row++) for (let col = INNER.left; col <= INNER.right; col++) if (arranged.shape[row][col] === "#") walls++;
  if (walls !== pillars.reduce((sum, pillar) => sum + pillar.w, 0)) return "floor";
  const map = decoratedMap(arranged, decor);
  const taken = new Set<string>();
  for (const object of map.objects) {
    for (const cell of blockedCells(object)) {
      const at = key(cell.col, cell.row);
      if (!isFloorCell(arranged, cell.col, cell.row) || taken.has(at)) return "floor";
      taken.add(at);
    }
  }
  // ของที่วางราบกับพื้น (ถ้ามี) ต้องไม่ถูกทับ
  for (const object of map.objects.filter((item) => item.flat)) if (taken.has(key(Math.floor(object.col), object.row)) || !isFloorCell(arranged, Math.floor(object.col), object.row)) return "floor";
  const access = arranged.objects.flatMap(accessCells);
  if (!isFloorCell(arranged, base.spawn.col, base.spawn.row) || taken.has(key(base.spawn.col, base.spawn.row))) return "access";
  if (access.some((cell) => !isFloorCell(arranged, cell.col, cell.row) || taken.has(key(cell.col, cell.row)))) return "access";
  const reachable = reachableCells(map);
  return arranged.objects.every((object) => accessCells(object).some((cell) => reachable.has(key(cell.col, cell.row)))) ? null : "blocks";
}

/** ตำแหน่งที่ย้ายไว้ซึ่งยังใช้ได้กับผังปัจจุบัน (ข้อมูลที่ผิดหรือขัดกับผังทำให้ทั้งห้องกลับไปตำแหน่งเริ่มต้น) */
export function validLayout(base: GameMap, layout: RoomLayout | undefined): RoomLayout {
  if (!layout) return {};
  const kept: RoomLayout = {};
  for (const piece of piecesIn(base)) {
    const at = layout[piece];
    if (at) kept[piece] = { col: at.col, row: at.row };
  }
  return layoutError(base, kept) === null ? kept : {};
}

/** ช่องทั้งหมดที่ย้ายชิ้นนี้ไปได้ (ใช้ไฮไลต์บนกระดานตกแต่ง) */
export function stationCells(base: GameMap, layout: RoomLayout, decor: readonly DecorPlacement[], piece: Piece): { col: number; row: number }[] {
  const cells = [];
  for (let row = 0; row < base.shape.length; row++) for (let col = 0; col < MAP_COLS; col++) if (layoutError(base, { ...layout, [piece]: { col, row } }, decor) === null) cells.push({ col, row });
  return cells;
}
