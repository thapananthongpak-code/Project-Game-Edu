// ห้องวิจัยพืชต่างดาว (GDD ข้อ 21): ฟังก์ชันล้วน ไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ หรือการวัดผล
// พืชโตตามเวลาจริง: บันทึกเวลาที่ปลูก (plantedAt) แล้วคำนวณระยะจากเวลาปัจจุบันเสมอ จึงโตต่อแม้ปิดเกม
// นาฬิกาเครื่องแก้ได้ จึงกันด้วยเพดานแทนการตรวจเวลา: เมล็ดแต่ละพันธุ์ซื้อได้จำกัดต่อแมพ (shop.config.ts) และเครดิตคำนวณจากจำนวนครั้งที่เก็บ
import type { Difficulty } from "./campaign";
import type { Pot, ShopState } from "./progressStore";
import { LAB, type Seed, SEEDS } from "./shop.config";

export type PotStage = "sprout" | "growing" | "ready";

/** จำนวนกระถางที่ใช้ได้ตามแมพไกลสุดที่ผู้เล่นไปถึง */
export const potCount = (reached: Difficulty): number => LAB.pots[reached];

export interface Growth {
  stage: PotStage;
  /** 0–1 */
  ratio: number;
  /** เวลาที่เหลือจนโตเต็มที่ (มิลลิวินาที) 0 เมื่อพร้อมเก็บ */
  remainingMs: number;
}

/**
 * ระยะของพืช: ต้นอ่อน (ยังไม่ถึงหนึ่งในสามของเวลา) กำลังโต พร้อมเก็บ
 * ถ้านาฬิกาเครื่องย้อนหลังกว่าเวลาที่ปลูก ถือว่าเพิ่งปลูก (ไม่ติดลบ)
 */
export function growthOf(pot: Pot, now: number): Growth {
  const { growMs } = LAB.seeds[pot.seed];
  const elapsed = Math.max(0, now - pot.plantedAt);
  const ratio = Math.min(1, elapsed / growMs);
  return { stage: ratio >= 1 ? "ready" : ratio >= 1 / 3 ? "growing" : "sprout", ratio, remainingMs: Math.max(0, growMs - elapsed) };
}

export type PlantError = "no-pot" | "occupied" | "no-seed";

/** ปลูกเมล็ดหนึ่งเม็ดในกระถางที่ว่าง (index เริ่มที่ 0) ใช้เมล็ดจากกล่อง 1 เม็ด */
export function plant(shop: ShopState, index: number, seed: Seed, now: number, reached: Difficulty): ShopState | PlantError {
  if (!Number.isInteger(index) || index < 0 || index >= potCount(reached)) return "no-pot";
  if (shop.pots[String(index)]) return "occupied";
  if (!SEEDS.includes(seed) || shop.seeds[seed] <= 0) return "no-seed";
  return { ...shop, seeds: { ...shop.seeds, [seed]: shop.seeds[seed] - 1 }, pots: { ...shop.pots, [String(index)]: { seed, plantedAt: now } } };
}

export type HarvestError = "empty" | "not-ready";

/**
 * เก็บผลผลิตของกระถางที่โตเต็มที่แล้ว: กระถางว่างลง นับจำนวนครั้งที่เก็บของพันธุ์นั้น (เครดิตคำนวณจากจำนวนครั้ง)
 * เก็บครบทุกพันธุ์อย่างน้อยพันธุ์ละครั้งแล้วได้ของตกแต่งรางวัล (LAB.rewardDecor)
 */
export function harvest(shop: ShopState, index: number, now: number): { shop: ShopState; gained: number; unlocked: boolean } | HarvestError {
  const pot = shop.pots[String(index)];
  if (!pot) return "empty";
  if (growthOf(pot, now).stage !== "ready") return "not-ready";
  const { [String(index)]: _, ...pots } = shop.pots;
  const harvests = { ...shop.harvests, [pot.seed]: shop.harvests[pot.seed] + 1 };
  const rewardId = `decor-${LAB.rewardDecor}`;
  const unlocked = SEEDS.every((seed) => harvests[seed] > 0) && !shop.owned.includes(rewardId);
  return { shop: { ...shop, pots, harvests, owned: unlocked ? [...shop.owned, rewardId] : shop.owned }, gained: LAB.seeds[pot.seed].yield, unlocked };
}

/** เครดิตที่ได้จากผลผลิตทั้งหมด (คำนวณจากจำนวนครั้งที่เก็บของแต่ละพันธุ์เสมอ) */
export const gardenCredits = (shop: Pick<ShopState, "harvests">): number => SEEDS.reduce((sum, seed) => sum + (shop.harvests[seed] ?? 0) * LAB.seeds[seed].yield, 0);

/** จำนวนพันธุ์ที่เก็บผลผลิตแล้ว (สมุดสะสมพันธุ์พืช) */
export const codexCount = (shop: Pick<ShopState, "harvests">): number => SEEDS.filter((seed) => (shop.harvests[seed] ?? 0) > 0).length;
