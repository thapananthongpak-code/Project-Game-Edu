// เครดิตวิจัยและการซื้อของในร้านสหกรณ์แล็บ (ฟังก์ชันล้วน, docs/GDD.md ข้อ 13)
// เครดิตที่ได้คำนวณจากความคืบหน้าทุกครั้ง ไม่เก็บยอดสะสม แมพที่ยากกว่าได้เครดิตมากกว่า (ตัวคูณใน campaign.ts)
import { course } from "../content";
import { robotMaxOf } from "./battle";
import { BATTLE } from "./battle.config";
import { type BattleSpec, campaignOf, DIFFICULTIES, type Difficulty, mapIndex } from "./campaign";
import { emptyField, fieldStatus } from "./field";
import { bagSizeOf, type Gear, guardianPower, matchupOf } from "./gear";
import { type NpcId, type NpcRecord, npcCredits, NPCS } from "./npcs";
import type { AssessmentResult, BattleRecord, RoomProgress, ShopState } from "./progressStore";
import { BIT_MODULES, type BitModule, CATALOG, DECOR, type Decor, type DecorSize, REWARDS, type ShopItem, STARTER_DECOR, type Supply } from "./shop.config";

export interface Earning {
  /** ความคืบหน้ารายหัวข้อของแต่ละแมพ (แมพที่ยังไม่ได้ไปไม่ต้องมี) */
  maps: Partial<Record<Difficulty, Record<number, RoomProgress>>>;
  battles: Record<string, BattleRecord>;
  /** กิจกรรมเสริมกับ NPC (ไม่ระบุ = ยังไม่มี) */
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

/** เครดิตที่ได้จากแมพหนึ่ง (คูณตัวคูณของแมพแล้ว): ความคืบหน้าของหัวข้อ ด่านต่อสู้ และกิจกรรมเสริมของแมพนั้น แบบทดสอบหลังเรียนนับที่แมพ 1 */
export function mapCredits(map: Difficulty, { maps, battles, npcs, posttest }: Earning): number {
  const level = campaignOf(map);
  let total = (map === "easy" && posttest ? REWARDS.posttest : 0) + npcCredits(npcs ?? {}, map);
  for (const room of Object.values(maps[map] ?? {})) {
    total += room.stationsSeen * REWARDS.station + room.stars * REWARDS.star;
    if (room.reviewDone) total += REWARDS.review;
    if (room.core) total += REWARDS.core;
    if (room.field && fieldStatus(room.field ?? emptyField(course.finalQuest), course.finalQuest).complete) total += REWARDS.field;
  }
  for (const battle of level.battles) total += battleCredits(battles[battle.id], battle.boss);
  return Math.round(total * level.creditMultiplier);
}

/** เครดิตวิจัยทั้งหมดที่ผู้เล่นได้จากความคืบหน้าของทุกแมพจนถึงตอนนี้ */
export const earnedCredits = (earning: Earning): number => DIFFICULTIES.reduce((sum, map) => sum + mapCredits(map, earning), 0);

export const creditBalance = (earning: Earning, shop: ShopState): number => Math.max(0, earnedCredits(earning) - shop.spent);

export const findItem = (id: string): ShopItem | undefined => CATALOG.find((item) => item.id === id);

/** ผู้เล่นมีของชิ้นนี้อยู่แล้วหรือไม่ (ของใช้: ถือเต็มจำนวนสูงสุดแล้ว) */
export function ownsItem(shop: ShopState, item: ShopItem): boolean {
  return item.kind === "supply" ? shop.supplies[item.value] >= item.max : shop.owned.includes(item.id);
}

/** ของชิ้นนี้วางขายแล้วหรือยัง: ผู้เล่นไปถึงแมพของของชิ้นนั้นแล้ว (reached = แมพไกลสุดที่เปิดแล้ว) */
export const tierOpen = (item: ShopItem, reached: Difficulty): boolean => mapIndex(item.tier) <= mapIndex(reached);

/** จำนวนของใช้ชนิดนี้ที่ร้านของแมพนี้ยังเหลือขาย */
export const stockLeft = (shop: ShopState, item: Extract<ShopItem, { kind: "supply" }>, map: Difficulty): number => Math.max(0, item.stock - (shop.bought[`${map}:${item.value}`] ?? 0));

export type PurchaseError = "unknown" | "owned" | "credits" | "locked" | "sold-out";

/** ที่ที่ซื้อ: map = แมพที่ผู้เล่นอยู่ (ของใช้มีจำนวนจำกัดต่อแมพ), reached = แมพไกลสุดที่เปิดแล้ว (ของบางชิ้นขายตั้งแต่แมพนั้น) */
export interface ShopContext {
  map: Difficulty;
  reached: Difficulty;
}

/**
 * ซื้อของหนึ่งชิ้น คืนสถานะร้านใหม่ หรือเหตุที่ซื้อไม่ได้
 * ชุด สีหุ่น คอสตูมของพี่บิต และอุปกรณ์ของการ์เดียนที่ซื้อจะถูกใช้ให้ทันที ของใช้ลงกระเป๋าให้ถ้ายังมีที่ว่าง
 */
export function purchase(shop: ShopState, id: string, balance: number, context: ShopContext = { map: "easy", reached: "hard" }): ShopState | PurchaseError {
  const item = findItem(id);
  if (!item) return "unknown";
  if (!tierOpen(item, context.reached)) return "locked";
  if (ownsItem(shop, item)) return "owned";
  if (item.kind === "supply" && stockLeft(shop, item, context.map) <= 0) return "sold-out";
  if (balance < item.price) return "credits";
  const spent = shop.spent + item.price;
  if (item.kind === "supply") {
    // ของใช้ที่ซื้อใหม่ลงกระเป๋าให้เลยถ้ายังมีที่ว่าง ไม่เช่นนั้นเก็บไว้ในกล่อง (นับเฉพาะของที่ยังมีจริง ช่องของของที่ใช้หมดแล้วถือว่าว่าง)
    const bag = bagOf(shop);
    const loadout = bag.length < bagSizeOf(shop.outfit) && !(item.value === "reboot" && bag.includes("reboot")) ? [...bag, item.value] : bag;
    const key = `${context.map}:${item.value}`;
    return { ...shop, spent, loadout, supplies: { ...shop.supplies, [item.value]: shop.supplies[item.value] + 1 }, bought: { ...shop.bought, [key]: (shop.bought[key] ?? 0) + 1 } };
  }
  // ร้านขายอย่างเดียว: ของที่ซื้อแล้วผู้เล่นไปใส่เองที่จุดปรับแต่งในโรงเก็บหุ่น (ตู้เสื้อผ้า แท่นการ์เดียน แท่นปรับแต่งพี่บิต)
  return { ...shop, spent, owned: [...shop.owned, item.id] };
}

/** โมดูลอัปเกรดของพี่บิตที่ซื้อแล้ว */
export const modulesOf = (shop: ShopState): BitModule[] => BIT_MODULES.filter((module) => shop.owned.includes(`module-${module}`));

export type EquipKind = "outfit" | "paint" | "bit" | "weapon" | "armor" | "chip";
const EQUIP_DEFAULT: Record<EquipKind, string> = { outfit: "lab", paint: "standard", bit: "classic", weapon: "fist", armor: "plate", chip: "none" };

/** อุปกรณ์ของการ์เดียนที่ใส่อยู่ */
export const gearOf = (shop: ShopState): Gear => ({ weapon: shop.weapon, armor: shop.armor, chip: shop.chip });

/**
 * ของใช้ที่จะพกเข้าด่านจริง: ตามที่เลือกไว้ในกระเป๋า ตัดชิ้นที่ในกล่องไม่มีแล้ว
 * (ใช้ของในด่านแล้วของในกล่องลดลง กระเป๋าของด่านถัดไปจึงมีเฉพาะชิ้นที่ยังเหลือ) ขนาดกระเป๋าขึ้นกับเครื่องแบบ (bagSizeOf)
 */
export function bagOf(shop: ShopState): Supply[] {
  const bag: Supply[] = [];
  const size = bagSizeOf(shop.outfit);
  for (const supply of shop.loadout) if (bag.length < size && bag.filter((s) => s === supply).length < shop.supplies[supply]) bag.push(supply);
  return bag;
}

/** สัดส่วนของร่างของคู่ต่อสู้ในด่านนี้ที่อาวุธชนะทาง ลบสัดส่วนที่แพ้ทาง (−1 ถึง 1) */
export const advantageShare = (spec: BattleSpec, gear: Gear): number =>
  spec.forms.reduce((sum, form) => sum + ({ strong: 1, even: 0, weak: -1 } as const)[matchupOf(gear.weapon, form.weak)], 0) / spec.forms.length;

/**
 * ค่าพลังรวมของการ์เดียนตอนนี้: พลังสูงสุด อุปกรณ์ เครื่องแบบ โมดูลของพี่บิต และของใช้ในกระเป๋า
 * ระบุด่าน: นับความได้เปรียบของอาวุธที่ใส่อยู่กับคู่ต่อสู้ของด่านนั้นด้วย
 */
export const powerOf = (difficulty: Difficulty | undefined, shop: ShopState, spec?: BattleSpec, coreBonus = 0): number =>
  guardianPower({
    robotMax: robotMaxOf(difficulty, shop.outfit, gearOf(shop), coreBonus),
    gear: gearOf(shop),
    outfit: shop.outfit,
    modules: modulesOf(shop),
    bag: bagOf(shop).length,
    advantage: spec ? advantageShare(spec, gearOf(shop)) : 0,
  });

/** จัดกระเป๋าใหม่: ไม่เกินขนาดกระเป๋า และของแต่ละชนิดไม่เกินจำนวนที่มีในกล่อง */
export function packBag(shop: ShopState, wanted: readonly Supply[]): ShopState {
  return { ...shop, loadout: bagOf({ ...shop, loadout: [...wanted] }) };
}

/** สวมชุด เปลี่ยนสีหุ่น เปลี่ยนคอสตูมของพี่บิต หรือเปลี่ยนอุปกรณ์ของการ์เดียน ได้เฉพาะของเริ่มต้นหรือของที่ซื้อแล้ว */
export function equip(shop: ShopState, kind: EquipKind, value: string): ShopState {
  const fallback = EQUIP_DEFAULT[kind];
  const item = CATALOG.find((candidate) => candidate.kind === kind && candidate.value === value);
  if (value !== fallback && !(item && shop.owned.includes(item.id))) return shop;
  const next = { ...shop, [kind]: value } as ShopState;
  // เปลี่ยนชุดแล้วขนาดกระเป๋าอาจเล็กลง: ตัดของส่วนเกินออกจากกระเป๋า (ของยังอยู่ในกล่อง)
  return kind === "outfit" ? { ...next, loadout: bagOf(next) } : next;
}

// ---------------------------------------------------------------- ของตกแต่งโถง (GDD ข้อ 19)

/** ของตกแต่งที่ผู้เล่นมี: ของเริ่มต้นและของที่ซื้อแล้ว */
export const ownedDecor = (shop: ShopState): Decor[] => (Object.keys(DECOR) as Decor[]).filter((decor) => STARTER_DECOR.includes(decor) || shop.owned.includes(`decor-${decor}`));

/**
 * วางของตกแต่งในช่องของโถงของแมพ (decor = null เอาออก) วางได้เฉพาะของที่มีและขนาดตรงกับช่อง
 * ของชิ้นหนึ่งวางได้ช่องเดียวต่อแมพ: ถ้าวางอยู่ช่องอื่นของแมพนั้นจะย้ายมา
 */
export function placeDecor(shop: ShopState, map: Difficulty, slot: { id: string; size: DecorSize }, decor: Decor | null): ShopState {
  const placed = { ...(shop.decor[map] ?? {}) };
  if (decor === null) delete placed[slot.id];
  else {
    if (!ownedDecor(shop).includes(decor) || DECOR[decor].size !== slot.size) return shop;
    for (const [id, value] of Object.entries(placed)) if (value === decor) delete placed[id];
    placed[slot.id] = decor;
  }
  return { ...shop, decor: { ...shop.decor, [map]: placed } };
}

// ---------------------------------------------------------------- ของช่วยเหลือจาก NPC (GDD ข้อ 16)

/** รับของใช้จาก NPC ที่มีบทบาทช่วยเหลือ: ของแต่ละชนิดไม่เกินจำนวนที่ถือได้ ลงกระเป๋าให้ถ้ายังมีที่ว่าง */
export function receiveGift(shop: ShopState, id: NpcId): ShopState {
  let next = shop;
  for (const supply of NPCS[id].gift) {
    const item = CATALOG.find((candidate) => candidate.kind === "supply" && candidate.value === supply) as Extract<ShopItem, { kind: "supply" }> | undefined;
    if (!item || next.supplies[supply] >= item.max) continue;
    const bag = bagOf(next);
    next = { ...next, supplies: { ...next.supplies, [supply]: next.supplies[supply] + 1 }, loadout: bag.length < bagSizeOf(next.outfit) ? [...bag, supply] : bag };
  }
  return next;
}
