// เครดิตวิจัยและการซื้อของในร้านสหกรณ์แล็บ (ฟังก์ชันล้วน, docs/GDD.md ข้อ 13)
// เครดิตที่ได้คำนวณจากความคืบหน้าทุกครั้ง ไม่เก็บยอดสะสม เล่นด่านเดิมซ้ำจึงไม่ได้เครดิตเพิ่ม
import { course } from "../content";
import { emptyField, fieldStatus } from "./field";
import type { AssessmentResult, RoomProgress, ShopState } from "./progressStore";
import { MIN_ANSWER_CHARS } from "./rules";
import { CATALOG, REWARDS, type ShopItem } from "./shop.config";

interface Earning {
  rooms: Record<number, RoomProgress>;
  posttest: AssessmentResult | null;
}

/** เครดิตวิจัยทั้งหมดที่ผู้เล่นได้จากความคืบหน้าจนถึงตอนนี้ */
export function earnedCredits({ rooms, posttest }: Earning): number {
  let total = posttest ? REWARDS.posttest : 0;
  for (const room of Object.values(rooms)) {
    total += room.stationsSeen * REWARDS.station + room.stars * REWARDS.star;
    if (room.reviewDone) total += REWARDS.review;
    if (room.core) total += REWARDS.core;
    if (room.battle.won) total += REWARDS.battle + (room.battle.sorties <= 1 ? REWARDS.firstSortie : 0);
    if (room.field && fieldStatus(room.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete) total += REWARDS.field;
  }
  return total;
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
