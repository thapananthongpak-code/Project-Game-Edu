// เลเวล EXP ชาเลนจ์ และรางวัลพิเศษ (ฟังก์ชันล้วน, docs/GDD.md ข้อ 27)
// EXP คำนวณจากบันทึกการเล่นทุกครั้ง ไม่เก็บยอดสะสม (เหมือนเครดิต) เป็นส่วนของเกมอย่างเดียว:
// ไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ การวัดผล ใบประกาศ และไม่ส่งให้แดชบอร์ดผู้สอน
import { CAMPAIGN, DIFFICULTIES, type Difficulty } from "./campaign";
import { npcActivitiesDone } from "./npcs";
import type { BattleRecord, RoomProgress, ShopState } from "./progressStore";
import type { Earning } from "./shop";
import { CATALOG, SEEDS } from "./shop.config";

/** เลเวลสูงสุด */
export const MAX_LEVEL = 20;

/** EXP ที่ได้จากแต่ละที่มา (ชาเลนจ์อยู่ที่ CHALLENGES) */
export const EXP = {
  /** ชนะไคจูครั้งแรก (ไคจูประจำห้อง / บอสของแมพ) */
  battle: 80,
  boss: 150,
  /** ชนะตั้งแต่การออกปฏิบัติการครั้งแรก */
  flawless: 20,
  /** ต่อข้อที่ตอบถูกในด่านต่อสู้ (นับไม่เกิน correctCap ข้อต่อด่าน กันการเล่นซ้ำเพื่อเก็บ EXP) */
  correct: 2,
  correctCap: 20,
  /** ซ้อมรบชนะซ้ำ ต่อครั้ง (ไม่เกิน replayCap ครั้งต่อด่าน) */
  replay: 10,
  replayCap: 5,
} as const;

/** EXP รวมที่ต้องมีจึงถึงเลเวลนี้ (เลเวล 1 = 0) เพิ่มขึ้นทีละขั้น */
export const expAt = (level: number): number => {
  const n = Math.min(MAX_LEVEL, Math.max(1, level)) - 1;
  return Math.round(40 * n + 7.5 * n * n);
};

/** รางวัลของแต่ละเลเวล: เครดิตทุกเลเวล และของพิเศษที่ไม่วางขายในร้าน (รหัสสินค้าใน CATALOG ที่ `reward: true`) */
export const LEVEL_REWARDS: Record<number, { credits: number; items?: readonly string[] }> = Object.fromEntries(
  Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).map((level) => [level, { credits: level % 5 === 0 ? 28 : 8 }]),
);
LEVEL_REWARDS[3].items = ["paint-camo"];
LEVEL_REWARDS[5].items = ["bit-crown"];
LEVEL_REWARDS[8].items = ["paint-platinum"];
LEVEL_REWARDS[10].items = ["paint-neon"];
LEVEL_REWARDS[15].items = ["bit-rainbow"];
LEVEL_REWARDS[18].items = ["paint-aurora"];

/** เลเวลที่เปลี่ยนฉายา (ฉายาอยู่ใน ui.level.titles ตามลำดับนี้) */
export const TITLE_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15, 18, 20] as const;
/** ลำดับของฉายาของเลเวลนี้ */
export const titleOf = (level: number): number => TITLE_LEVELS.filter((from) => from <= level).length - 1;

/** ข้อมูลที่ใช้คำนวณ: ความคืบหน้าทั้งหมดกับสถานะร้าน */
export interface LevelInput {
  earning: Earning;
  shop: ShopState;
}

// ---------------------------------------------------------------- ชาเลนจ์

export interface Challenge {
  id: string;
  exp: number;
  /** ความคืบหน้า (ไม่เกินเป้า) และเป้าหมาย */
  progress: (input: LevelInput) => number;
  goal: number;
}

const battlesOf = ({ earning }: LevelInput): BattleRecord[] => Object.values(earning.battles);
const wonCount = (input: LevelInput): number => battlesOf(input).filter((record) => record.won).length;
const mapWon = (input: LevelInput, map: Difficulty): number => CAMPAIGN[map].battles.filter((battle) => input.earning.battles[battle.id]?.won).length;
const rooms = (input: LevelInput): RoomProgress[] => DIFFICULTIES.flatMap((map) => Object.values(input.earning.maps[map] ?? {}));
const bestStreak = (input: LevelInput): number => Math.max(0, ...battlesOf(input).map((record) => record.streak ?? 0));
const harvested = ({ shop }: LevelInput): number => SEEDS.reduce((sum, seed) => sum + shop.harvests[seed], 0);
const mostPlaced = ({ shop }: LevelInput): number => Math.max(0, ...Object.values(shop.decor).map((placed) => placed.length));
const gearWorn = ({ shop }: LevelInput): number => (shop.weapon !== "fist" ? 1 : 0) + (shop.armor !== "plate" ? 1 : 0) + (shop.chip !== "none" ? 1 : 0);

/** ชาเลนจ์ทำได้ครั้งเดียว นับความคืบหน้าของการเล่น (ไม่ใช้คะแนนแบบทดสอบ) บางข้อดูจากสถิติที่ด่านต่อสู้บันทึกไว้ (streak, untouched) */
export const CHALLENGES: readonly Challenge[] = [
  { id: "first-win", exp: 30, goal: 1, progress: (i) => wonCount(i) },
  { id: "wins-4", exp: 40, goal: 4, progress: (i) => wonCount(i) },
  { id: "wins-8", exp: 60, goal: 8, progress: (i) => wonCount(i) },
  { id: "wins-all", exp: 100, goal: DIFFICULTIES.reduce((sum, map) => sum + CAMPAIGN[map].battles.length, 0), progress: (i) => wonCount(i) },
  { id: "clear-easy", exp: 60, goal: CAMPAIGN.easy.battles.length, progress: (i) => mapWon(i, "easy") },
  { id: "clear-normal", exp: 80, goal: CAMPAIGN.normal.battles.length, progress: (i) => mapWon(i, "normal") },
  { id: "clear-hard", exp: 100, goal: CAMPAIGN.hard.battles.length, progress: (i) => mapWon(i, "hard") },
  { id: "streak-3", exp: 30, goal: 3, progress: (i) => bestStreak(i) },
  { id: "streak-5", exp: 50, goal: 5, progress: (i) => bestStreak(i) },
  { id: "streak-8", exp: 70, goal: 8, progress: (i) => bestStreak(i) },
  { id: "untouched", exp: 50, goal: 1, progress: (i) => battlesOf(i).filter((record) => record.untouched).length },
  { id: "first-core", exp: 30, goal: 1, progress: (i) => rooms(i).filter((room) => room.core).length },
  { id: "all-cores", exp: 80, goal: 6, progress: (i) => (Object.values(i.earning.maps.easy ?? {}) as RoomProgress[]).filter((room) => room.core).length },
  { id: "harvest-5", exp: 40, goal: 5, progress: (i) => harvested(i) },
  { id: "harvest-15", exp: 70, goal: 15, progress: (i) => harvested(i) },
  { id: "npc-3", exp: 50, goal: 3, progress: (i) => npcActivitiesDone(i.earning.npcs ?? {}) },
  // แทนชาเลนจ์ด่านทางเชื่อมที่เลิกใช้ในรอบ 20
  { id: "npc-6", exp: 40, goal: 6, progress: (i) => npcActivitiesDone(i.earning.npcs ?? {}) },
  { id: "decor-6", exp: 30, goal: 6, progress: (i) => mostPlaced(i) },
  { id: "shopper", exp: 20, goal: 1, progress: ({ shop }) => shop.owned.filter((id) => !CATALOG.find((item) => item.id === id)?.reward).length },
  { id: "gear-3", exp: 40, goal: 3, progress: (i) => gearWorn(i) },
];

export const challengeDone = (challenge: Challenge, input: LevelInput): boolean => challenge.progress(input) >= challenge.goal;

// ---------------------------------------------------------------- EXP และเลเวล

/** EXP ของด่านต่อสู้หนึ่งด่าน: ชนะครั้งแรก ชนะตั้งแต่ครั้งแรกที่ออกปฏิบัติการ ข้อที่ตอบถูก และซ้อมรบซ้ำ (แต่ละอย่างมีเพดาน) */
export function battleExp(record: BattleRecord | undefined, boss: boolean): number {
  if (!record) return 0;
  const answers = Math.min(EXP.correctCap, record.correct) * EXP.correct;
  if (!record.won) return answers;
  const replays = Math.min(EXP.replayCap, Math.max(0, record.wins - 1));
  return (boss ? EXP.boss : EXP.battle) + (record.sorties <= record.wins ? EXP.flawless : 0) + answers + replays * EXP.replay;
}

/** EXP ทั้งหมดที่ผู้เล่นมีตอนนี้ */
export function expOf(input: LevelInput): number {
  let total = 0;
  for (const map of DIFFICULTIES) for (const battle of CAMPAIGN[map].battles) total += battleExp(input.earning.battles[battle.id], battle.boss);
  for (const challenge of CHALLENGES) if (challengeDone(challenge, input)) total += challenge.exp;
  return total;
}

/** เลเวลของ EXP นี้ (1 ถึง MAX_LEVEL) */
export const levelOf = (exp: number): number => {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expAt(level + 1)) level++;
  return level;
};

export interface LevelStatus {
  exp: number;
  level: number;
  /** EXP ที่สะสมในเลเวลนี้ กับที่ต้องใช้ถึงเลเวลถัดไป (เลเวลสูงสุด: next = 0) */
  into: number;
  next: number;
  max: boolean;
}

export function statusOf(input: LevelInput): LevelStatus {
  const exp = expOf(input);
  const level = levelOf(exp);
  const max = level >= MAX_LEVEL;
  return { exp, level, into: exp - expAt(level), next: max ? 0 : expAt(level + 1) - expAt(level), max };
}

/** เครดิตที่ได้จากเลเวลที่ถึงแล้ว (คำนวณจาก EXP เสมอ เหมือนเครดิตอื่น) */
export const levelCredits = (level: number): number => Object.entries(LEVEL_REWARDS).reduce((sum, [at, reward]) => (Number(at) <= level ? sum + reward.credits : sum), 0);

/** ของพิเศษที่ได้ถึงเลเวลนี้แล้ว */
export const rewardItemsUpTo = (level: number): string[] => Object.entries(LEVEL_REWARDS).flatMap(([at, reward]) => (Number(at) <= level ? [...(reward.items ?? [])] : []));
