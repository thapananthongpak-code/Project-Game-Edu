// เครดิตวิจัยและการซื้อของในร้านสหกรณ์แล็บ (ฟังก์ชันล้วน, docs/GDD.md ข้อ 13)
// เครดิตที่ได้คำนวณจากความคืบหน้าทุกครั้ง ไม่เก็บยอดสะสม ระดับความยากที่สูงกว่าได้เครดิตมากกว่า (ตัวคูณใน campaign.ts)
import { course } from "../content";
import { robotMaxOf } from "./battle";
import { BATTLE } from "./battle.config";
import { campaignOf, type Difficulty } from "./campaign";
import { emptyField, fieldStatus } from "./field";
import { BAG_SIZE, type Gear, guardianPower } from "./gear";
import { type NpcRecord, npcCredits } from "./npcs";
import type { AssessmentResult, BattleRecord, RoomProgress, ShopState } from "./progressStore";
import { MIN_ANSWER_CHARS } from "./rules";
import { BIT_MODULES, type BitModule, CATALOG, REWARDS, type ShopItem, type Supply } from "./shop.config";

export interface Earning {
  difficulty: Difficulty | undefined;
  rooms: Record<number, RoomProgress>;
  battles: Record<string, BattleRecord>;
  /** กิจกรรมเสริมกับ NPC ประจำห้อง (ไม่ระบุ = ยังไม่มี) */
  npcs?: Record<string, NpcRecord>;
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
export function earnedCredits({ difficulty, rooms, battles, npcs, posttest }: Earning): number {
  const level = campaignOf(difficulty);
  let total = (posttest ? REWARDS.posttest : 0) + npcCredits(npcs ?? {});
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

/** ซื้อของหนึ่งชิ้น คืนสถานะร้านใหม่ หรือเหตุที่ซื้อไม่ได้ ชุด สีหุ่น และคอสตูมของพี่บิตที่ซื้อจะถูกใช้ให้ทันที */
export function purchase(shop: ShopState, id: string, balance: number): ShopState | PurchaseError {
  const item = findItem(id);
  if (!item) return "unknown";
  if (ownsItem(shop, item)) return "owned";
  if (balance < item.price) return "credits";
  const spent = shop.spent + item.price;
  if (item.kind === "supply") {
    // ของใช้ที่ซื้อใหม่ลงกระเป๋าให้เลยถ้ายังมีที่ว่าง ไม่เช่นนั้นเก็บไว้ในกล่อง (นับเฉพาะของที่ยังมีจริง ช่องของของที่ใช้หมดแล้วถือว่าว่าง)
    const bag = bagOf(shop);
    const loadout = bag.length < BAG_SIZE && !(item.value === "reboot" && bag.includes("reboot")) ? [...bag, item.value] : bag;
    return { ...shop, spent, loadout, supplies: { ...shop.supplies, [item.value]: shop.supplies[item.value] + 1 } };
  }
  const owned = [...shop.owned, item.id];
  if (item.kind === "weapon" || item.kind === "armor" || item.kind === "chip") return { ...shop, spent, owned, [item.kind]: item.value } as ShopState;
  if (item.kind === "outfit") return { ...shop, spent, owned, outfit: item.value };
  if (item.kind === "paint") return { ...shop, spent, owned, paint: item.value };
  if (item.kind === "bit") return { ...shop, spent, owned, bit: item.value };
  return { ...shop, spent, owned };
}

/** โมดูลอัปเกรดของพี่บิตที่ซื้อแล้ว */
export const modulesOf = (shop: ShopState): BitModule[] => BIT_MODULES.filter((module) => shop.owned.includes(`module-${module}`));

export type EquipKind = "outfit" | "paint" | "bit" | "weapon" | "armor" | "chip";
const EQUIP_DEFAULT: Record<EquipKind, string> = { outfit: "lab", paint: "standard", bit: "classic", weapon: "fist", armor: "plate", chip: "none" };

/** อุปกรณ์ของการ์เดียนที่ใส่อยู่ */
export const gearOf = (shop: ShopState): Gear => ({ weapon: shop.weapon, armor: shop.armor, chip: shop.chip });

/**
 * ของใช้ที่จะพกเข้าด่านจริง: ตามที่เลือกไว้ในกระเป๋า ตัดชิ้นที่ในกล่องไม่มีแล้ว
 * (ใช้ของในด่านแล้วของในกล่องลดลง กระเป๋าของด่านถัดไปจึงมีเฉพาะชิ้นที่ยังเหลือ)
 */
export function bagOf(shop: ShopState): Supply[] {
  const bag: Supply[] = [];
  for (const supply of shop.loadout) if (bag.length < BAG_SIZE && bag.filter((s) => s === supply).length < shop.supplies[supply]) bag.push(supply);
  return bag;
}

/** ค่าพลังรวมของการ์เดียนตอนนี้: พลังสูงสุด อุปกรณ์ เครื่องแบบ โมดูลของพี่บิต และของใช้ในกระเป๋า */
export const powerOf = (difficulty: Difficulty | undefined, shop: ShopState): number =>
  guardianPower({ robotMax: robotMaxOf(difficulty, shop.outfit, gearOf(shop)), gear: gearOf(shop), outfit: shop.outfit, modules: modulesOf(shop), bag: bagOf(shop).length });

/** จัดกระเป๋าใหม่: ไม่เกิน BAG_SIZE ชิ้น และของแต่ละชนิดไม่เกินจำนวนที่มีในกล่อง */
export function packBag(shop: ShopState, wanted: readonly Supply[]): ShopState {
  return { ...shop, loadout: bagOf({ ...shop, loadout: [...wanted] }) };
}

/** สวมชุด เปลี่ยนสีหุ่น เปลี่ยนคอสตูมของพี่บิต หรือเปลี่ยนอุปกรณ์ของการ์เดียน ได้เฉพาะของเริ่มต้นหรือของที่ซื้อแล้ว */
export function equip(shop: ShopState, kind: EquipKind, value: string): ShopState {
  const fallback = EQUIP_DEFAULT[kind];
  const item = CATALOG.find((candidate) => candidate.kind === kind && candidate.value === value);
  if (value !== fallback && !(item && shop.owned.includes(item.id))) return shop;
  return { ...shop, [kind]: value } as ShopState;
}
