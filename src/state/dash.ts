// ด่านทางเชื่อมก่อนเข้าห้องเรียนครั้งแรก (GDD ข้อ 22): ฟังก์ชันล้วน ไม่มีผลต่อดาว ระดับความช่วยเหลือ การปลดล็อก หรือการวัดผล
// ทางเดิน 3 ช่อง ผู้เล่นเลื่อนซ้ายขวาหลบสิ่งกีดขวางหรือพลังของไคจู รูปแบบตายตัว (ไม่สุ่ม) ข้ามด่านได้เสมอ ผู้เรียนจึงไม่ติดถาวร
import type { Difficulty } from "./campaign";
import type { RoomProgress } from "./progressStore";

export const DASH = {
  lanes: 3,
  /** ความยาวของด่าน (วินาที) */
  duration: 24,
  /** โดนได้กี่ครั้งก่อนต้องเริ่มใหม่ */
  shield: 3,
  /** เวลาที่ใช้เลื่อนข้ามหนึ่งช่องทาง (วินาที) */
  laneMoveS: 0.2,
  /** หลังโดนแล้วไม่โดนซ้ำในช่วงนี้ */
  invulnerableS: 0.8,
  /** เวลาที่สิ่งกีดขวางใช้เลื่อนจากบนจอลงมาถึงผู้เล่น */
  travelS: 1.1,
  /** แสงเตือนก่อนพลังของไคจูมาถึง */
  warnS: 0.9,
  /** เครดิตที่ได้เมื่อผ่านด่านครั้งแรก (ข้ามไม่ได้เครดิต) */
  reward: 5,
} as const;

export type DashKind = "obstacles" | "blast";

export interface DashWave {
  /** เวลาที่คลื่นนี้ถึงผู้เล่น (วินาทีนับจากเริ่มวิ่ง) */
  at: number;
  /** ช่องทาง (0 = ซ้าย 1 = กลาง 2 = ขวา) ที่โดน เหลืออย่างน้อยหนึ่งช่องปลอดภัยเสมอ */
  blocked: number[];
}

/** รูปแบบของคลื่นตายตัว 3 แบบ หมุนตามเลขห้อง ทุกคลื่นเหลือช่องปลอดภัยอย่างน้อยหนึ่งช่อง */
const SEQUENCES: number[][][] = [
  [[0], [2], [1], [0, 1], [2], [1, 2], [0], [1], [0, 2], [1], [2], [0, 1]],
  [[1], [0], [2], [1, 2], [0], [0, 1], [2], [1], [0, 2], [0], [1, 2], [1]],
  [[2], [1], [0], [0, 2], [1], [0, 1], [2], [0], [1, 2], [2], [1], [0, 2]],
];
const FIRST_WAVE_S = 3;
const WAVE_GAP_S = 1.6;

/** ชนิดของด่านตามห้อง: ห้องเลขคี่หลบสิ่งกีดขวาง ห้องเลขคู่หลบพลังของไคจูที่เฝ้าห้อง */
export const dashKindOf = (zone: number): DashKind => (zone % 2 === 1 ? "obstacles" : "blast");

export function wavesOf(kind: DashKind, zone: number): DashWave[] {
  const sequence = SEQUENCES[(zone + (kind === "blast" ? 1 : 0)) % SEQUENCES.length];
  return sequence.map((blocked, index) => ({ at: FIRST_WAVE_S + index * WAVE_GAP_S, blocked }));
}

/** คลื่นนี้โดนผู้เล่นที่ยืนอยู่ช่องทางนี้หรือไม่ */
export const waveHits = (wave: DashWave, lane: number): boolean => wave.blocked.includes(lane);

/** ผ่านด่านเมื่อโดนน้อยกว่าจำนวนโล่ */
export const dashPassed = (hits: number): boolean => hits < DASH.shield;

// ---------------------------------------------------------------- บันทึก

/** รหัสของด่านในบันทึก: "<แมพ>:<ห้อง>" = ผ่านแล้ว, "<แมพ>:<ห้อง>:s" = ข้าม, "skip" = ตั้งค่าข้ามทุกด่าน */
export const dashKey = (map: Difficulty, zone: number): string => `${map}:${zone}`;
export const DASH_SKIP_ALL = "skip";
export const DASH_ENTRY = /^(?:(?:easy|normal|hard):\d{1,2}(?::s)?|skip)$/;

/**
 * ต้องเล่นด่านทางเชื่อมก่อนเข้าห้องนี้หรือไม่: เฉพาะการเข้าห้องครั้งแรก (ยังไม่มีความคืบหน้าของหัวข้อไหนในห้องนี้)
 * ที่ยังไม่เคยผ่านหรือข้ามด่านของห้องนี้ และผู้เล่นไม่ได้ตั้งค่าข้ามทุกด่าน (แมพที่ไม่มีห้องเรียนไม่มีด่านนี้)
 */
export function dashDue(args: { map: Difficulty; zone: number; topics: readonly number[]; progress: Record<number, RoomProgress | undefined>; done: readonly string[] }): boolean {
  const { map, zone, topics, progress, done } = args;
  if (done.includes(DASH_SKIP_ALL)) return false;
  const key = dashKey(map, zone);
  if (done.includes(key) || done.includes(`${key}:s`)) return false;
  return topics.every((topic) => {
    const room = progress[topic];
    return !room || (room.stationsSeen === 0 && !room.minigameDone && !room.core);
  });
}

/** เครดิตจากด่านที่ผ่าน (นับจากจำนวนรหัสที่ผ่านแล้วเสมอ ไม่เก็บยอดสะสม) */
export const dashCredits = (done: readonly string[]): number => done.filter((entry) => /^(?:easy|normal|hard):\d{1,2}$/.test(entry)).length * DASH.reward;
