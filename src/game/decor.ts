// ของตกแต่งที่ผู้เล่นวางเองแบบอิสระในโถงและโรงเก็บหุ่น (docs/GDD.md ข้อ 19)
// ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน: กติกาว่าวางตรงไหนได้ จำนวนที่วางได้ต่อห้อง และผังของห้องเมื่อรวมของตกแต่งแล้ว
import type { Difficulty } from "../state/campaign";
import { DECOR, type Decor } from "../state/shop.config";
import { MAP_COLS } from "./constants";
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
