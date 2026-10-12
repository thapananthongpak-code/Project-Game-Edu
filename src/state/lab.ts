// ห้องวิจัยพืชต่างดาว (GDD ข้อ 21): ฟังก์ชันล้วน ไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ หรือการวัดผล
// พืชโตตามเวลาจริง: บันทึกเวลาที่ปลูก (plantedAt) แล้วคำนวณระยะจากเวลาปัจจุบันเสมอ จึงโตต่อแม้ปิดเกม
// นาฬิกาเครื่องแก้ได้ จึงกันด้วยเพดานแทนการตรวจเวลา: เมล็ดแต่ละพันธุ์ซื้อได้จำกัดต่อแมพ (shop.config.ts) และเครดิตคำนวณจากจำนวนครั้งที่เก็บ
import type { Pot, ShopState } from "./progressStore";
import { type Difficulty, mapIndex } from "./campaign";
import { CATALOG, LAB, type Seed, SEEDS } from "./shop.config";

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
 * ของแถมของการเก็บครั้งนี้ (คำนวณจากพันธุ์ จำนวนครั้งที่เก็บ และของที่มี จึงตายตัว ผู้เรียนทุกคนได้เท่ากันเมื่อเก็บเท่ากัน):
 * กระถางของพันธุ์นั้นเมื่อเก็บครั้งแรก ของใช้หมุนเวียนทุกครั้งที่ 3 ของการเก็บทั้งหมด และของพิเศษหรืออาวุธเมื่อถึงครั้งที่กำหนด
 * ของแถมเป็นของที่ร้านขายอยู่แล้วและแมพนั้นเปิดขายแล้วเท่านั้น ได้แล้วไม่ซ้ำ รหัสของใช้คือ "supply-<ชื่อ>"
 */
export function giftsOf(shop: ShopState, seed: Seed, harvestsAfter: Record<Seed, number>, reached: Difficulty): string[] {
  const { gifts } = LAB;
  const gift: string[] = [];
  const has = (id: string) => shop.owned.includes(id) || gift.includes(id);
  const potId = `decor-${gifts.potDecor[seed]}`;
  if (harvestsAfter[seed] === 1 && !has(potId)) gift.push(potId);
  const total = SEEDS.reduce((sum, s) => sum + harvestsAfter[s], 0);
  if (total % gifts.supplyEvery === 0) {
    const supply = gifts.supplies[(total / gifts.supplyEvery - 1) % gifts.supplies.length];
    const max = CATALOG.flatMap((item) => (item.kind === "supply" && item.value === supply ? [item.max] : []))[0] ?? 1;
    if (shop.supplies[supply] < max) gift.push(`supply-${supply}`);
  }
  for (const rule of [gifts.rare, gifts.gear]) {
    if (seed !== rule.seed || harvestsAfter[seed] !== rule.nth) continue;
    const pick = rule.picks.find((id) => {
      const item = CATALOG.find((entry) => entry.id === id);
      return item !== undefined && !has(id) && mapIndex(item.tier) <= mapIndex(reached);
    });
    if (pick) gift.push(pick);
  }
  return gift;
}

/**
 * เก็บผลผลิตของกระถางที่โตเต็มที่แล้ว: กระถางว่างลง นับจำนวนครั้งที่เก็บของพันธุ์นั้น (เครดิตคำนวณจากจำนวนครั้ง) และรับของแถม (giftsOf)
 * เก็บครบทุกพันธุ์อย่างน้อยพันธุ์ละครั้งแล้วได้ของตกแต่งรางวัล (LAB.rewardDecor)
 */
export function harvest(shop: ShopState, index: number, now: number, reached: Difficulty = "hard"): { shop: ShopState; gained: number; unlocked: boolean; gifts: string[] } | HarvestError {
  const pot = shop.pots[String(index)];
  if (!pot) return "empty";
  if (growthOf(pot, now).stage !== "ready") return "not-ready";
  const { [String(index)]: _, ...pots } = shop.pots;
  const harvests = { ...shop.harvests, [pot.seed]: shop.harvests[pot.seed] + 1 };
  const gifts = giftsOf(shop, pot.seed, harvests, reached);
  const rewardId = `decor-${LAB.rewardDecor}`;
  const unlocked = SEEDS.every((seed) => harvests[seed] > 0) && !shop.owned.includes(rewardId);
  const supplies = { ...shop.supplies };
  const owned = [...shop.owned];
  for (const id of gifts) {
    if (id.startsWith("supply-")) supplies[id.slice(7) as keyof typeof supplies] += 1;
    else owned.push(id);
  }
  if (unlocked) owned.push(rewardId);
  return { shop: { ...shop, pots, harvests, supplies, owned }, gained: LAB.seeds[pot.seed].yield, unlocked, gifts };
}

/** เครดิตที่ได้จากผลผลิตทั้งหมด (คำนวณจากจำนวนครั้งที่เก็บของแต่ละพันธุ์เสมอ) */
export const gardenCredits = (shop: Pick<ShopState, "harvests">): number => SEEDS.reduce((sum, seed) => sum + (shop.harvests[seed] ?? 0) * LAB.seeds[seed].yield, 0);

/** จำนวนพันธุ์ที่เก็บผลผลิตแล้ว (สมุดสะสมพันธุ์พืช) */
export const codexCount = (shop: Pick<ShopState, "harvests">): number => SEEDS.filter((seed) => (shop.harvests[seed] ?? 0) > 0).length;
