// เครดิตวิจัยและการซื้อของในร้านสหกรณ์แล็บ (ฟังก์ชันล้วน, docs/GDD.md ข้อ 13)
// เครดิตที่ได้คำนวณจากความคืบหน้าทุกครั้ง ไม่เก็บยอดสะสม ระดับความยากที่สูงกว่าได้เครดิตมากกว่า (ตัวคูณใน campaign.ts)
import { course } from "../content";
import { BATTLE } from "./battle.config";
import { campaignOf, type Difficulty } from "./campaign";
import { emptyField, fieldStatus } from "./field";
import type { AssessmentResult, BattleRecord, RoomProgress, ShopState } from "./progressStore";
import { MIN_ANSWER_CHARS } from "./rules";
import { CATALOG, REWARDS, type ShopItem } from "./shop.config";

export interface Earning {
  difficulty: Difficulty | undefined;
  rooms: Record<number, RoomProgress>;
  battles: Record<string, BattleRecord>;
  posttest: AssessmentResult | null;
}

/** เครดิตของด่านต่อสู้หนึ่งด่าน: ชนะครั้งแรก โบนัสชนะในการออกปฏิบัติการครั้งแรก และการซ้อมรบซ้ำ (จำกัดจำนวนครั้ง) */
export function battleCredits(record: BattleRecord | undefined, boss: boolean): number {
  if (!record?.won) return 0;
  const replays = Math.min(BATTLE.replayRewards, Math.max(0, record.wins - 1));
  // ชนะตั้งแต่ครั้งแรกที่ออกปฏิบัติการ = จำนวนครั้งที่ออกเท่ากับจำนวนครั้งที่ชนะ
  const flawless = record.sorties <= record.wins ? REWARDS.firstSortie : 0;
  return (boss ? REWARDS.boss : REWARDS.battle) + flawless + replays * REWARDS.replay;
}

/** เครดิตวิจัยทั้งหมดที่ผู้เล่นได้จากความคืบหน้าจนถึงตอนนี้ */
export function earnedCredits({ difficulty, rooms, battles, posttest }: Earning): number {
  const level = campaignOf(difficulty);
  let total = posttest ? REWARDS.posttest : 0;
  for (const room of Object.values(rooms)) {
    total += room.stationsSeen * REWARDS.station + room.stars * REWARDS.star;
    if (room.reviewDone) total += REWARDS.review;
    if (room.core) total += REWARDS.core;
    if (room.field && fieldStatus(room.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete) total += REWARDS.field;
  }
  for (const battle of level.battles) total += battleCredits(battles[battle.id], battle.boss);
  return Math.round(total * level.creditMultiplier);
}

export const creditBalance = (earning: Earning, shop: ShopState): number => Math.max(0, earnedCredits(earning) - shop.spent);

export const findItem = (id: string): ShopItem | undefined => CATALOG.find((item) => item.id === id);

/** ผู้เล่นมีของชิ้นนี้อยู่แล้วหรือไม่ (ของใช้: ถือเต็มจำนวนสูงสุดแล้ว) */
export function ownsItem(shop: ShopState, item: ShopItem): boolean {
  return item.kind === "supply" ? shop.supplies[item.value] >= item.max : shop.owned.includes(item.id);
}

export type PurchaseError = "unknown" | "owned" | "credits";

/** ซื้อของหนึ่งชิ้น คืนสถานะร้านใหม่ หรือเหตุที่ซื้อไม่ได้ ชุดและสีหุ่นที่ซื้อจะถูกสวมให้ทันที */
export function purchase(shop: ShopState, id: string, balance: number): ShopState | PurchaseError {
  const item = findItem(id);
  if (!item) return "unknown";
  if (ownsItem(shop, item)) return "owned";
  if (balance < item.price) return "credits";
  const spent = shop.spent + item.price;
  if (item.kind === "supply") return { ...shop, spent, supplies: { ...shop.supplies, [item.value]: shop.supplies[item.value] + 1 } };
  const owned = [...shop.owned, item.id];
  return item.kind === "outfit" ? { ...shop, spent, owned, outfit: item.value } : { ...shop, spent, owned, paint: item.value };
}

/** สวมชุดหรือเปลี่ยนสีหุ่น ได้เฉพาะของเริ่มต้นหรือของที่ซื้อแล้ว */
export function equip(shop: ShopState, kind: "outfit" | "paint", value: string): ShopState {
  const fallback = kind === "outfit" ? "lab" : "standard";
  const item = CATALOG.find((candidate) => candidate.kind === kind && candidate.value === value);
  if (value !== fallback && !(item && shop.owned.includes(item.id))) return shop;
  return { ...shop, [kind]: value } as ShopState;
}
