// ที่เก็บความคืบหน้าของผู้เล่น
//
// เกมเรียกผ่าน interface ProgressStore เท่านั้น (load / save / clear) มีสองตัวที่ implement:
//   - LocalProgressStore: localStorage ของเบราว์เซอร์ ใช้เมื่อยังไม่ได้ตั้งค่า Supabase และเป็นสำเนาในเครื่องเสมอ
//   - SyncedProgressStore: สำเนาในเครื่อง + ฐานข้อมูลกลาง (Supabase) ผ่าน RemoteBackend
// createProgressStore() เลือกตาม VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY (ดู docs/TEACHER_GUIDE.md และ supabase/schema.sql)
import { course } from "../content";
import type { FormId } from "../content/schema";
import { DIFFICULTIES, type Difficulty, topicsOf } from "./campaign";
import { emptyField, type FieldProgress } from "./field";
import { type Armor, ARMORS, bagSizeOf, type Chip, CHIPS, DEFAULT_GEAR, type Weapon, WEAPONS } from "./gear";
import { isNpcId, type NpcRecord, NPCS } from "./npcs";
import { MAX_NAME_CHARS } from "./rules";
import { DECOR_AREAS, DECOR_LIMIT, type DecorPlacement, type DecorRoom, decorRoom, PIECES, type RoomLayout } from "../game/decor";
import { AVATARS, type Avatar, BIT_MODULES, BIT_SKINS, BIT_SLOTS, type BitModule, type BitSkin, CATALOG, type Decor, DECORS, OUTFITS, type Outfit, PAINTS, type Paint, STARTER_DECOR, SUPPLIES, type Supply, type Theme, THEME_IDS } from "./shop.config";

export const SAVE_VERSION = 9;

export interface Profile {
  /** ชื่อที่แสดง แนะนำให้ใช้ชื่อเล่นหรือเลขที่ ไม่ใช้ชื่อจริง */
  name: string;
  /** แมพที่ผู้เล่นอยู่ตอนนี้ (easy = แมพ 1, normal = แมพ 2, hard = แมพ 3) กำหนดจำนวนห้อง ด่านต่อสู้ และตัวช่วย (src/state/campaign.ts) */
  difficulty: Difficulty;
  /** รหัสห้องเรียนที่ครูกำหนด ว่าง = เล่นคนเดียว ไม่ส่งข้อมูลให้ครู */
  classCode: string;
  /** ตัวละครที่เลือก (รูปลักษณ์ในเกมเท่านั้น ไม่ใช่ข้อมูลเพศของผู้เรียน และไม่แสดงในแดชบอร์ดผู้สอน) */
  avatar: Avatar;
}

/** ผลของด่านต่อสู้หนึ่งด่าน (GDD ข้อ 12) */
export interface BattleRecord {
  won: boolean;
  /** จำนวนครั้งที่ชนะ รวมการซ้อมรบซ้ำหลังชนะครั้งแรก */
  wins: number;
  /** จำนวนครั้งที่ออกปฏิบัติการ (รวมครั้งที่ถอยกลับมาซ่อม) */
  sorties: number;
  /** โจทย์ที่ตอบทั้งหมด และที่ตอบถูก สะสมทุกครั้ง */
  asked: number;
  correct: number;
}

/** ร้านสหกรณ์แล็บ (GDD ข้อ 13) เครดิตคงเหลือ = เครดิตที่ได้จากความคืบหน้า - spent */
export interface ShopState {
  spent: number;
  /** รหัสสินค้าที่ซื้อแล้ว (ชุด สีหุ่น คอสตูมและโมดูลอัปเกรดของพี่บิต) */
  owned: string[];
  /** ของใช้ในด่านต่อสู้ที่ถืออยู่ */
  supplies: Record<Supply, number>;
  outfit: Outfit;
  paint: Paint;
  /** คอสตูมของพี่บิตที่ใช้อยู่ */
  bit: BitSkin;
  /** โมดูลของพี่บิตที่ติดตั้งอยู่ (ไม่เกิน BIT_SLOTS ชิ้น เลือกจากที่ซื้อแล้วที่แท่นชาร์จพี่บิต) */
  modules: BitModule[];
  /** อุปกรณ์ของการ์เดียนที่ใส่อยู่ (src/state/gear.ts) */
  weapon: Weapon;
  armor: Armor;
  chip: Chip;
  /** ของใช้ที่เลือกพกเข้าด่านต่อสู้ ไม่เกินขนาดกระเป๋า ที่เหลืออยู่ในกล่องเก็บไอเทม (supplies) */
  loadout: Supply[];
  /** จำนวนของใช้ที่ซื้อจากร้านของแต่ละแมพไปแล้ว คีย์คือ "<แมพ>:<ของใช้>" (ร้านมีของจำกัดต่อแมพ) */
  bought: Record<string, number>;
  /** ของตกแต่งที่ผู้เล่นวางเองในโถงและโรงเก็บหุ่นของแต่ละแมพ: คีย์ "<แมพ>:<ห้อง>" -> ของที่วางพร้อมตำแหน่ง (GDD ข้อ 19) */
  decor: Partial<Record<DecorRoom, DecorPlacement[]>>;
  /** จุดใช้งานและเสาที่ผู้เล่นย้ายเองในโถงและโรงเก็บหุ่น: คีย์ "<แมพ>:<ห้อง>" -> ตำแหน่งของจุดที่ย้าย (ไม่มี = ตำแหน่งเริ่มต้น GDD ข้อ 19) */
  layout: Partial<Record<DecorRoom, RoomLayout>>;
  /** ธีมสีที่เลือกใช้ในโถงและโรงเก็บหุ่น: คีย์ "<แมพ>:<ห้อง>" -> ธีมที่ซื้อแล้ว (ไม่มี = พื้นและผนังเดิมของแมพ) */
  theme: Partial<Record<DecorRoom, Theme>>;
}

/** ผลแบบทดสอบก่อนเรียนหรือหลังเรียนหนึ่งครั้ง */
export interface AssessmentResult {
  form: FormId;
  /** จำนวนข้อที่ถูกของแต่ละสมรรถนะ (หัวข้อ) */
  correctByTopic: Record<number, number>;
  /** ผลรายข้อ id ตรงกับ quests.json ผู้เล่นไม่เห็นคะแนนจนกว่าจะทำหลังเรียนเสร็จ */
  items: { id: string; topic: number; correct: boolean; timeMs: number }[];
  completedAt: string;
}

export interface RoomProgress {
  /** จำนวนสถานีที่ฟังจบแล้ว นับเรียงจากสถานีแรก */
  stationsSeen: number;
  minigameDone: boolean;
  /** ดาวที่ดีที่สุดของมินิเกม (0 = ยังไม่ผ่าน) */
  stars: number;
  /** ผลของมินิเกมรอบล่าสุดที่เล่นจบ ใช้ตั้งระดับเริ่มต้นของห้องถัดไป */
  outcome: { totalMisses: number; requiredRepair: boolean } | null;
  /** สรุปการตรวจคำตอบของรอบล่าสุด สำหรับครู */
  summary: { checks: number; correct: number; totalTimeMs: number; repairVisits: number } | null;
  /** ชิ้นที่ตอบผิดในมินิเกม (ข้อความบนการ์ด -> จำนวนครั้ง) สะสมทุกรอบ สำหรับครู */
  missed: Record<string, number>;
  /** ผลของคำถามทบทวนแบบเลือกตอบ (จับคู่ เชื่อมโยง ถูกหรือผิด): จำนวนข้อที่ตอบถูกตั้งแต่ครั้งแรก (เกมไม่เก็บข้อความที่ผู้เรียนเขียน) */
  review: { correct: number; total: number } | null;
  reviewDone: boolean;
  /** ภารกิจภาคสนาม (เฉพาะห้องสุดท้าย) */
  field: FieldProgress | null;
  core: boolean;
  /** เวลาที่ได้แกน AI ของห้องนี้ (ISO) ห้องสุดท้ายใช้เป็นวันที่บนใบประกาศ */
  coreAt: string | null;
  /** เวลาที่อยู่ในห้องนี้สะสม (มิลลิวินาที) นับเฉพาะตอนเปิดหน้าเกมอยู่ */
  timeMs: number;
  /** จำนวนครั้งที่ถามพี่บิตในห้องนี้: ได้คำตอบจาก AI และได้คำใบ้สำเร็จรูป */
  tutor: { ai: number; hints: number };
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** เวลาที่บันทึกล่าสุด (ISO) ใช้เลือกสำเนาที่ใหม่กว่าระหว่างในเครื่องกับฐานข้อมูลกลาง */
  updatedAt: string;
  profile: Profile | null;
  pretest: AssessmentResult | null;
  posttest: AssessmentResult | null;
  /** ความคืบหน้ารายหัวข้อของแมพ 1 (แมพเรียน): ใช้กับใบประกาศและแดชบอร์ดผู้สอน */
  rooms: Record<number, RoomProgress>;
  /** ความคืบหน้ารายหัวข้อของแมพ 2 และ 3 (ทบทวนที่ระดับสูงขึ้น) */
  maps: { normal: Record<number, RoomProgress>; hard: Record<number, RoomProgress> };
  /** ผลของด่านต่อสู้ คีย์คือรหัสด่านใน src/state/campaign.ts */
  battles: Record<string, BattleRecord>;
  /** กิจกรรมเสริมกับ NPC ประจำห้อง คีย์คือรหัส NPC ใน src/state/npcs.ts */
  npcs: Record<string, NpcRecord>;
  /** ฉากเนื้อเรื่องที่ดูจบแล้ว (รหัสใน src/content/story.ts) */
  story: string[];
  shop: ShopState;
}

export interface ProgressStore {
  /** คืน null เมื่อยังไม่มีข้อมูลที่บันทึกไว้ */
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}

export const emptyRoom = (): RoomProgress => ({
  stationsSeen: 0,
  minigameDone: false,
  stars: 0,
  outcome: null,
  summary: null,
  missed: {},
  review: null,
  reviewDone: false,
  field: null,
  core: false,
  coreAt: null,
  timeMs: 0,
  tutor: { ai: 0, hints: 0 },
});

export const emptyBattle = (): BattleRecord => ({ won: false, wins: 0, sorties: 0, asked: 0, correct: 0 });

/** ของตกแต่งที่วางไว้ให้ตั้งแต่เริ่มในโถงของแมพ 1 (ผู้เล่นย้ายหรือเอาออกได้) */
export const STARTER_PLACEMENT: readonly DecorPlacement[] = [
  { decor: "window", col: 3, row: 1 },
  { decor: "plant", col: 1, row: 5 },
];
const starterDecor = (): ShopState["decor"] => ({ "easy:hall": STARTER_PLACEMENT.map((placement) => ({ ...placement })) });

/** ตำแหน่งของช่องตกแต่งในข้อมูลรุ่น 8 (ของตกแต่งเคยวางได้เฉพาะในช่องที่กำหนดของโถง): ใช้ย้ายของที่วางไว้มาเป็นตำแหน่งอิสระ */
const LEGACY_SLOTS: Record<Difficulty, Record<string, [col: number, row: number]>> = {
  easy: { wall1: [3, 1], wall2: [12, 1], big1: [15, 6], big2: [3, 5], small1: [1, 5], small2: [18, 5], small3: [18, 8] },
  normal: { wall1: [1, 1], wall2: [15, 1], big1: [7, 6], big2: [11, 6], small1: [1, 6], small2: [18, 6], small3: [18, 3] },
  hard: { wall1: [2, 1], wall2: [13, 1], big1: [16, 4], big2: [9, 6], small1: [1, 6], small2: [18, 6], small3: [12, 3] },
};

export const emptyShop = (): ShopState => ({
  spent: 0,
  owned: [],
  supplies: Object.fromEntries(SUPPLIES.map((supply) => [supply, 0])) as Record<Supply, number>,
  outfit: "lab",
  paint: "standard",
  bit: "classic",
  modules: [],
  ...DEFAULT_GEAR,
  loadout: [],
  bought: {},
  decor: starterDecor(),
  layout: {},
  theme: {},
});

export const emptySave = (): SaveData => ({ version: SAVE_VERSION, updatedAt: new Date(0).toISOString(), profile: null, pretest: null, posttest: null, rooms: {}, maps: { normal: {}, hard: {} }, battles: {}, npcs: {}, story: [], shop: emptyShop() });

// ---------------------------------------------------------------- อ่านข้อมูลที่บันทึกไว้
// ข้อมูลที่อ่านกลับมาอาจไม่ครบหรือผิดรูป (รุ่นเก่า ไฟล์เสีย หรือถูกแก้จากนอกเกม) ทุกช่องจึงถูกตรวจชนิดและเติมค่าเริ่มต้น
// ทั้งตัวเกมและแดชบอร์ดผู้สอนอ่านผ่านทางนี้ แถวที่ผิดรูปของผู้เรียนคนเดียวจึงไม่ทำให้หน้าของทั้งห้องพัง

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function fieldOf(raw: unknown): FieldProgress | null {
  if (raw === null || typeof raw !== "object") return null;
  const data = raw as Raw;
  const base = emptyField(course.finalQuest);
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const evidence = object(data.evidence);
  return {
    ready: data.ready === true,
    steps: base.steps.map((_, i) => list(data.steps)[i] === true),
    results: base.results.map((_, i) => ({ images: whole(object(list(data.results)[i]).images), correct: whole(object(list(data.results)[i]).correct) })),
    // รุ่นก่อนเก็บข้อความที่ผู้เรียนเขียน: ข้อที่เคยเขียนแล้วถือว่าคิดทบทวนแล้ว ข้อความไม่ถูกเก็บต่อ
    reflected: base.reflected.map((_, i) => list(data.reflected)[i] === true || (typeof list(data.notes)[i] === "string" && (list(data.notes)[i] as string).trim() !== "")),
    evidence: {
      image: typeof evidence.image === "string" && evidence.image.startsWith("data:image/") ? evidence.image : null,
      outsideGame: evidence.outsideGame === true,
      ...(evidence.onDevice === true ? { onDevice: true } : {}),
    },
  };
}

function roomOf(raw: unknown): RoomProgress {
  const data = object(raw);
  const outcome = data.outcome === null || data.outcome === undefined ? null : object(data.outcome);
  const summary = data.summary === null || data.summary === undefined ? null : object(data.summary);
  const missed: Record<string, number> = {};
  for (const [label, times] of Object.entries(object(data.missed))) if (count(times) > 0) missed[label] = count(times);
  return {
    stationsSeen: count(data.stationsSeen),
    minigameDone: data.minigameDone === true,
    stars: Math.min(3, count(data.stars)),
    outcome: outcome && { totalMisses: count(outcome.totalMisses), requiredRepair: outcome.requiredRepair === true },
    summary: summary && { checks: count(summary.checks), correct: count(summary.correct), totalTimeMs: count(summary.totalTimeMs), repairVisits: count(summary.repairVisits) },
    missed,
    review: data.review === null || data.review === undefined ? null : { correct: Math.floor(count(object(data.review).correct)), total: Math.floor(count(object(data.review).total)) },
    reviewDone: data.reviewDone === true,
    field: fieldOf(data.field),
    core: data.core === true,
    coreAt: typeof data.coreAt === "string" ? data.coreAt : null,
    timeMs: count(data.timeMs),
    tutor: { ai: count(object(data.tutor).ai), hints: count(object(data.tutor).hints) },
  };
}

function battleOf(raw: unknown): BattleRecord {
  const data = object(raw);
  const won = data.won === true;
  return { won, wins: won ? Math.max(1, Math.floor(count(data.wins))) : 0, sorties: count(data.sorties), asked: count(data.asked), correct: count(data.correct) };
}

const MAX_BATTLES = 20;
function battlesOf(raw: unknown): Record<string, BattleRecord> {
  const battles: Record<string, BattleRecord> = {};
  for (const [id, value] of Object.entries(object(raw)).slice(0, MAX_BATTLES)) if (/^[a-z0-9-]{1,20}$/.test(id)) battles[id] = battleOf(value);
  return battles;
}

/** รหัสด่านของระดับง่ายที่ตรงกับห้องในข้อมูลรุ่นก่อน (ด่านเคยเก็บไว้กับห้อง) */
const legacyBattleId = (room: number): string => (room === course.topics.length ? "omega" : `k${room}`);

function shopOf(raw: unknown): ShopState {
  const data = object(raw);
  const base = emptyShop();
  const items = new Map(CATALOG.map((item) => [item.id, item]));
  const owned = [...new Set(Array.isArray(data.owned) ? data.owned.filter((id): id is string => typeof id === "string" && items.has(id) && items.get(id)?.kind !== "supply") : [])];
  const has = (kind: "outfit" | "paint" | "bit" | "module" | "weapon" | "armor" | "chip" | "decor" | "theme", value: string) => owned.some((id) => items.get(id)?.kind === kind && items.get(id)?.value === value);
  const supplies = { ...base.supplies };
  for (const item of CATALOG) if (item.kind === "supply") supplies[item.value] = Math.min(item.max, Math.floor(count(object(data.supplies)[item.value])));
  const outfit = OUTFITS.find((o) => o === data.outfit) ?? base.outfit;
  const paint = PAINTS.find((c) => c === data.paint) ?? base.paint;
  const bit = BIT_SKINS.find((skin) => skin === data.bit) ?? base.bit;
  const weapon = WEAPONS.find((w) => w === data.weapon) ?? base.weapon;
  const armor = ARMORS.find((a) => a === data.armor) ?? base.armor;
  const chip = CHIPS.find((c) => c === data.chip) ?? base.chip;
  // กระเป๋า: ของแต่ละชนิดพกได้ไม่เกินจำนวนที่มีในกล่อง ข้อมูลรุ่นที่ยังไม่มีกระเป๋าได้ของในกล่องเรียงตามรายการจนเต็ม
  const packed: Supply[] = [];
  const wanted = Array.isArray(data.loadout) ? data.loadout.filter((s): s is Supply => SUPPLIES.some((supply) => supply === s)) : SUPPLIES.flatMap((supply) => Array.from({ length: supplies[supply] }, () => supply));
  const worn = outfit === base.outfit || has("outfit", outfit) ? outfit : base.outfit;
  for (const supply of wanted) if (packed.length < bagSizeOf(worn) && packed.filter((s) => s === supply).length < supplies[supply]) packed.push(supply);
  // ของใช้ที่ซื้อจากร้านของแต่ละแมพ: ข้อมูลรุ่นก่อนไม่มี จึงเริ่มนับใหม่
  const bought: Record<string, number> = {};
  for (const [key, value] of Object.entries(object(data.bought))) {
    const [map, supply] = key.split(":");
    if (DIFFICULTIES.some((d) => d === map) && SUPPLIES.some((s) => s === supply) && count(value) > 0) bought[key] = Math.floor(count(value));
  }
  // ของตกแต่ง: วางได้เฉพาะของที่มี (ของเริ่มต้นหรือของที่ซื้อแล้ว) ชิ้นหนึ่งวางได้ครั้งเดียวต่อห้อง ไม่เกินจำนวนของห้อง
  // ตำแหน่งตรวจกับผังอีกครั้งตอนแสดง (validPlacements) ข้อมูลรุ่นก่อนที่ยังไม่มีของตกแต่งได้ของเริ่มต้นวางไว้ให้
  const mine = (value: unknown): Decor | undefined => {
    const item = DECORS.find((d) => d === value);
    return item && (STARTER_DECOR.includes(item) || has("decor", item)) ? item : undefined;
  };
  const saved = object(data.decor);
  const decor: ShopState["decor"] = data.decor === undefined ? starterDecor() : {};
  for (const map of DIFFICULTIES) {
    for (const area of DECOR_AREAS) {
      const placed: DecorPlacement[] = [];
      const raw = saved[decorRoom(map, area)];
      for (const entry of Array.isArray(raw) ? raw.slice(0, 24) : []) {
        const { decor: value, col, row } = object(entry);
        const item = mine(value);
        if (item && Number.isInteger(col) && Number.isInteger(row) && (col as number) >= 0 && (col as number) < 20 && (row as number) >= 0 && (row as number) < 11 && placed.length < DECOR_LIMIT[area] && !placed.some((p) => p.decor === item)) placed.push({ decor: item, col: col as number, row: row as number });
      }
      if (placed.length > 0) decor[decorRoom(map, area)] = placed;
    }
    // รุ่น 8: ของตกแต่งของโถงเก็บตามรหัสช่อง ย้ายมาเป็นตำแหน่งของช่องนั้น
    const legacy = object(saved[map]);
    const placed: DecorPlacement[] = [];
    for (const [slot, value] of Object.entries(legacy)) {
      const item = mine(value);
      const at = LEGACY_SLOTS[map][slot];
      if (item && at && !placed.some((p) => p.decor === item)) placed.push({ decor: item, col: at[0], row: at[1] });
    }
    if (placed.length > 0 && decor[decorRoom(map, "hall")] === undefined) decor[decorRoom(map, "hall")] = placed;
  }
  // จุดใช้งานที่ย้ายเอง: เก็บเฉพาะจุดที่รู้จักและตำแหน่งที่เป็นช่องในผัง (กติกาตรวจกับผังอีกครั้งตอนแสดง validLayout)
  // ธีมของห้อง: เฉพาะธีมที่ซื้อแล้ว ข้อมูลรุ่นก่อนไม่มีทั้งสองอย่าง ทุกห้องจึงเป็นค่าเริ่มต้น
  const layout: ShopState["layout"] = {};
  const theme: ShopState["theme"] = {};
  for (const map of DIFFICULTIES) {
    for (const area of DECOR_AREAS) {
      const room = decorRoom(map, area);
      const moved: RoomLayout = {};
      for (const station of PIECES) {
        const { col, row } = object(object(object(data.layout)[room])[station]);
        if (Number.isInteger(col) && Number.isInteger(row) && (col as number) >= 0 && (col as number) < 20 && (row as number) >= 0 && (row as number) < 11) moved[station] = { col: col as number, row: row as number };
      }
      if (Object.keys(moved).length > 0) layout[room] = moved;
      const chosen = THEME_IDS.find((id) => id === object(data.theme)[room]);
      if (chosen && has("theme", chosen)) theme[room] = chosen;
    }
  }
  // โมดูลของพี่บิตที่ติดตั้ง: เฉพาะที่ซื้อแล้ว ไม่เกิน BIT_SLOTS ข้อมูลรุ่นก่อน (โมดูลทำงานทุกชิ้นที่ซื้อ) ได้ชิ้นแรก ๆ ที่มีติดตั้งให้
  const ownedModules = BIT_MODULES.filter((module) => has("module", module));
  const modules = (Array.isArray(data.modules) ? BIT_MODULES.filter((module) => (data.modules as unknown[]).includes(module) && ownedModules.includes(module)) : ownedModules).slice(0, BIT_SLOTS);
  return {
    spent: Math.floor(count(data.spent)),
    owned,
    supplies,
    // สวมได้เฉพาะของเริ่มต้นหรือของที่ซื้อแล้ว
    outfit: worn,
    paint: paint === base.paint || has("paint", paint) ? paint : base.paint,
    bit: bit === base.bit || has("bit", bit) ? bit : base.bit,
    modules,
    weapon: weapon === base.weapon || has("weapon", weapon) ? weapon : base.weapon,
    armor: armor === base.armor || has("armor", armor) ? armor : base.armor,
    chip: chip === base.chip || has("chip", chip) ? chip : base.chip,
    loadout: packed,
    bought,
    decor,
    layout,
    theme,
  };
}

function npcsOf(raw: unknown): Record<string, NpcRecord> {
  const npcs: Record<string, NpcRecord> = {};
  for (const [id, value] of Object.entries(object(raw))) {
    if (!isNpcId(id)) continue;
    const data = object(value);
    const spec = NPCS[id];
    const found = [...new Set(Array.isArray(data.found) ? data.found.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < spec.pickups) : [])];
    // ส่งของได้เมื่อเก็บครบเท่านั้น
    const done = spec.role === "quest" && data.done === true && found.length >= spec.pickups;
    const tries = Math.floor(count(data.tries));
    npcs[id] = {
      met: data.met === true || data.accepted === true || found.length > 0 || done || tries > 0,
      accepted: data.accepted === true || found.length > 0 || done,
      found,
      done,
      best: Math.min(spec.questions, Math.floor(count(data.best))),
      tries,
      gifted: spec.role === "gift" && data.gifted === true,
    };
  }
  return npcs;
}

/**
 * ข้อมูลจากรุ่นที่ยังไม่มีภาพเนื้อเรื่องหลังชนะด่าน: ด่านที่ชนะไปแล้วถือว่าดูฉากนั้นแล้ว
 * ไม่เช่นนั้นผู้เล่นเดิมจะเห็นฉากของทุกด่านที่เคยชนะต่อกันรวดเดียวเมื่อเปิดเกม
 */
const withWinBeats = (story: string[], battles: Record<string, BattleRecord>): string[] => [...new Set([...story, ...Object.entries(battles).filter(([, record]) => record.won).map(([id]) => `win-${id}`)])];

const MAX_STORY_BEATS = 60;
const storyOf = (raw: unknown): string[] => [...new Set(Array.isArray(raw) ? raw.filter((beat): beat is string => typeof beat === "string" && beat.length <= 40) : [])].slice(0, MAX_STORY_BEATS);

const roomsOf = (raw: unknown): Record<number, RoomProgress> => {
  const rooms: Record<number, RoomProgress> = {};
  for (const [room, value] of Object.entries(object(raw))) if (Number.isInteger(Number(room)) && Number(room) >= 1 && Number(room) <= course.topics.length) rooms[Number(room)] = roomOf(value);
  return rooms;
};

/** ข้อมูลจากรุ่นที่ยังไม่มีด่านต่อสู้: ห้องที่ได้แกน AI แล้วถือว่าผ่านด่านต่อสู้ของห้องนั้น */
const battlesFromCores = (rooms: Record<number, RoomProgress>): Record<string, BattleRecord> => {
  const battles: Record<string, BattleRecord> = {};
  for (const [room, progress] of Object.entries(rooms)) if (progress.core) battles[legacyBattleId(Number(room))] = { ...emptyBattle(), won: true, wins: 1 };
  return battles;
};

function profileOf(raw: unknown): Profile | null {
  const data = object(raw);
  const name = text(data.name, MAX_NAME_CHARS).trim();
  if (!name) return null;
  // ข้อมูลรุ่นก่อนไม่มีระดับความยาก (เคยมีสไตล์การเรียนแทน): เป็นระดับง่าย ซึ่งมีโครงห้องเหมือนเกมรุ่นก่อน
  const difficulty = DIFFICULTIES.find((candidate) => candidate === data.difficulty) ?? "easy";
  return { name, difficulty, classCode: text(data.classCode, 20), avatar: AVATARS.find((candidate) => candidate === data.avatar) ?? "a" };
}

function assessmentOf(raw: unknown): AssessmentResult | null {
  if (raw === null || typeof raw !== "object") return null;
  const data = raw as Raw;
  const correctByTopic: Record<number, number> = {};
  for (const [topic, correct] of Object.entries(object(data.correctByTopic))) correctByTopic[Number(topic)] = count(correct);
  const items = (Array.isArray(data.items) ? data.items : []).map(object).filter((item) => typeof item.id === "string" && typeof item.topic === "number");
  return {
    form: data.form === "B" ? "B" : "A",
    correctByTopic,
    items: items.map((item) => ({ id: item.id as string, topic: item.topic as number, correct: item.correct === true, timeMs: count(item.timeMs) })),
    completedAt: text(data.completedAt, 40),
  };
}

/**
 * ข้อมูลรุ่น 5–7: ผู้เล่นเลือก "ระดับความยาก" ตอนเริ่มเกมและเล่นระดับเดียว ตอนนี้ระดับเป็นแมพที่เล่นต่อกัน
 * ผู้เล่นที่เคยเลือกระดับกลางหรือยาก: ความคืบหน้าเดิมเก็บเป็นบันทึกการเรียน (rooms) และเป็นความคืบหน้าของแมพที่ตรงกับระดับนั้นด้วย
 * (หัวข้อ 6 ไม่มีในแมพ 2 และ 3) ผู้เล่นอยู่ที่แมพนั้นต่อ และกลับไปเล่นแมพก่อนหน้าได้ บทส่งท้ายที่ดูแล้วเป็นของแมพนั้น
 */
function legacyMaps(profile: Profile | null, rooms: Record<number, RoomProgress>, story: string[]): Pick<SaveData, "maps" | "story"> {
  const maps: SaveData["maps"] = { normal: {}, hard: {} };
  const map = profile?.difficulty ?? "easy";
  if (map === "easy") return { maps, story };
  for (const topic of topicsOf(map)) if (rooms[topic]) maps[map][topic] = { ...rooms[topic], field: null };
  return { maps, story: story.map((beat) => (beat === "ending" ? `ending-${map}` : beat)) };
}

/** แปลงข้อมูลที่อ่านได้ให้เป็น SaveData รุ่นปัจจุบัน คืน null ถ้าอ่านไม่ออก */
export function migrateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Raw;
  const hasRooms = typeof data.rooms === "object" && data.rooms !== null;
  // รุ่น 7: ระดับความยากเป็นโหมดที่เลือกตอนเริ่มเกม ยังไม่มีแมพต่อเนื่อง ของตกแต่งโถง และคำถามทบทวนเป็นการเขียนตอบ (ข้อความที่เขียนไม่ถูกเก็บต่อ)
  // รุ่น 6: ยังไม่มีอุปกรณ์ของการ์เดียนและกระเป๋าของใช้ (ของในกล่องถูกจัดลงกระเป๋าให้จนเต็ม)
  // รุ่น 5: ยังไม่มี NPC ประจำห้อง คอสตูมของพี่บิต และภาพเนื้อเรื่องหลังชนะด่าน ช่องอื่นเหมือนรุ่นปัจจุบัน
  if ((data.version === SAVE_VERSION || data.version === 8 || data.version === 7 || data.version === 6 || data.version === 5) && hasRooms) {
    const battles = battlesOf(data.battles);
    const profile = profileOf(data.profile);
    const rooms = roomsOf(data.rooms);
    const seen = data.version === 5 ? withWinBeats(storyOf(data.story), battles) : storyOf(data.story);
    const worlds = data.version === SAVE_VERSION || data.version === 8 ? { maps: { normal: roomsOf(object(data.maps).normal), hard: roomsOf(object(data.maps).hard) }, story: seen } : legacyMaps(profile, rooms, seen);
    return {
      version: SAVE_VERSION,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : emptySave().updatedAt,
      profile,
      pretest: assessmentOf(data.pretest),
      posttest: assessmentOf(data.posttest),
      rooms,
      maps: worlds.maps,
      battles,
      npcs: npcsOf(data.npcs),
      story: worlds.story,
      shop: shopOf(data.shop),
    };
  }
  // รุ่น 4: ผลด่านต่อสู้เก็บไว้กับห้อง และมีสไตล์การเรียนแทนระดับความยาก
  if (data.version === 4 && hasRooms) {
    const battles: Record<string, BattleRecord> = {};
    for (const [room, value] of Object.entries(object(data.rooms))) {
      const record = battleOf(object(value).battle);
      if (record.won || record.sorties > 0) battles[legacyBattleId(Number(room))] = record;
    }
    return {
      version: SAVE_VERSION,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : emptySave().updatedAt,
      profile: profileOf(data.profile),
      pretest: assessmentOf(data.pretest),
      posttest: assessmentOf(data.posttest),
      rooms: roomsOf(data.rooms),
      maps: { normal: {}, hard: {} },
      battles,
      npcs: {},
      story: withWinBeats(storyOf(data.story), battles),
      shop: shopOf(data.shop),
    };
  }
  // รุ่น 3: ยังไม่มีเนื้อเรื่อง ด่านต่อสู้ และร้านค้า ห้องที่ได้แกน AI แล้วถือว่าผ่านด่านต่อสู้ของห้องนั้น ห้องถัดไปจึงไม่ถูกล็อกย้อนหลัง
  if (data.version === 3 && hasRooms) {
    const rooms = roomsOf(data.rooms);
    return {
      ...emptySave(),
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : emptySave().updatedAt,
      profile: profileOf(data.profile),
      pretest: assessmentOf(data.pretest),
      posttest: assessmentOf(data.posttest),
      rooms,
      battles: battlesFromCores(rooms),
      story: withWinBeats([], battlesFromCores(rooms)),
    };
  }
  // รุ่น 2: ยังไม่มีรหัสห้องเรียน แบบทดสอบหลังเรียน และรหัสข้อ ผลก่อนเรียนเดิมสุ่มโจทย์ จึงเก็บไว้เฉพาะคะแนนรายหัวข้อ
  if (data.version === 2 && hasRooms) {
    const pretest = assessmentOf(data.pretest);
    const rooms = roomsOf(data.rooms);
    return { ...emptySave(), profile: profileOf(data.profile), pretest: pretest && { ...pretest, form: "A", items: [] }, rooms, battles: battlesFromCores(rooms), story: withWinBeats([], battlesFromCores(rooms)) };
  }
  // รุ่น 1 (ต้นแบบห้อง 1): { state: { progress }, version: 1 }
  const legacy = object(data.state).progress;
  if (legacy && typeof legacy === "object") {
    const rooms = roomsOf(legacy);
    return { ...emptySave(), rooms, battles: battlesFromCores(rooms), story: withWinBeats([], battlesFromCores(rooms)) };
  }
  return null;
}

/** ส่วนของ Web Storage ที่ใช้ รับเข้ามาได้เพื่อทดสอบ */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalProgressStore implements ProgressStore {
  private readonly storage: KeyValueStorage;
  private readonly key: string;

  constructor(storage: KeyValueStorage, key = "ai-trainer-quest-save") {
    this.storage = storage;
    this.key = key;
  }

  async load(): Promise<SaveData | null> {
    const text = this.storage.getItem(this.key);
    if (!text) return null;
    try {
      return migrateSave(JSON.parse(text));
    } catch {
      // ข้อมูลเสีย ถือว่ายังไม่มีข้อมูล
      return null;
    }
  }

  async save(data: SaveData): Promise<void> {
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch {
      // พื้นที่เก็บเต็ม (มักเกิดจากภาพหลักฐาน): บันทึกส่วนที่เหลือโดยไม่มีภาพ ดีกว่าเสียความคืบหน้าทั้งหมด
      this.storage.setItem(this.key, JSON.stringify(withoutEvidenceImage(data)));
    }
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

/** สำเนาที่ไม่มีภาพหลักฐาน ภาพอาจมีใบหน้าผู้เรียนจากกล้อง จึงไม่ส่งออกจากเครื่อง (docs/TEACHER_GUIDE.md) */
export function withoutEvidenceImage(data: SaveData): SaveData {
  const rooms: Record<number, RoomProgress> = {};
  for (const [room, progress] of Object.entries(data.rooms)) {
    const field = progress.field;
    rooms[Number(room)] = field?.evidence.image ? { ...progress, field: { ...field, evidence: { ...field.evidence, image: null, onDevice: true } } } : progress;
  }
  return { ...data, rooms };
}

// ---------------------------------------------------------------- ฐานข้อมูลกลาง

export interface RemoteRecord {
  data: SaveData;
  /** รหัสสำหรับเล่นต่อจากเครื่องอื่น */
  resumeCode: string;
}

/** บัญชีที่เครื่องนี้ใช้กับฐานข้อมูลกลาง anonymous = บัญชีไม่ระบุตัวตนต่ออุปกรณ์, google = เข้าสู่ระบบด้วย Google */
export interface AccountInfo {
  provider: "anonymous" | "google";
  /** อีเมลของบัญชี Google แสดงให้เจ้าของเห็นบนเครื่องของตัวเองเท่านั้น ไม่ถูกบันทึกลงความคืบหน้า */
  email: string | null;
}

/** สิ่งที่ SyncedProgressStore ต้องการจากฐานข้อมูลกลาง ตัวจริงคือ Supabase (src/state/supabaseBackend.ts) */
export interface RemoteBackend {
  /** รหัสข้อผิดพลาดจากการล็อกอินกับ Google ครั้งล่าสุด (ถ้ามี) และคำอธิบายสั้น ๆ สำหรับผู้ดูแลระบบ */
  authError?: string | null;
  authErrorDetail?: string | null;
  account?(): Promise<AccountInfo | null>;
  /** พาไปหน้าล็อกอินของ Google link = ผูกกับบัญชีไม่ระบุตัวตนที่มีอยู่ (ความคืบหน้าตามมาด้วย) */
  signInWithGoogle?(link: boolean): Promise<void>;
  signOut?(): Promise<void>;
  load(): Promise<RemoteRecord | null>;
  /** บันทึกความคืบหน้าของผู้เล่นคนนี้ คืนรหัสเล่นต่อ */
  save(data: SaveData): Promise<string>;
  /** ผู้เรียนคนเดิมเริ่มใหม่ทั้งหมด: เก็บข้อมูลเดิมไว้ให้ครูในสถานะเก็บถาวร แล้วตัดการเชื่อมกับเครื่องนี้ */
  reset(): Promise<void>;
  /** ผู้เรียนคนใหม่มาใช้เครื่องนี้: ตัดการเชื่อมอย่างเดียว ข้อมูลของคนเดิมยังอยู่และเล่นต่อได้ด้วยรหัส */
  detach(): Promise<void>;
  /** ย้ายมาเล่นต่อที่เครื่องนี้ด้วยรหัสเล่นต่อ คืน null ถ้ารหัสไม่ถูก */
  claim(code: string): Promise<RemoteRecord | null>;
}

export type SyncStatus = "local" | "pending" | "synced" | "error";

interface SyncOptions {
  /** หน่วงการส่งขึ้นฐานข้อมูลกลาง รวมการเปลี่ยนแปลงถี่ ๆ เป็นครั้งเดียว */
  delayMs?: number;
  /** ส่งไม่สำเร็จ: ลองใหม่หลังเวลานี้ */
  retryMs?: number;
  /** รอฐานข้อมูลกลางตอนเปิดเกมไม่เกินเวลานี้ เกินแล้วเริ่มจากสำเนาในเครื่อง */
  loadTimeoutMs?: number;
  onStatus?: (status: SyncStatus, resumeCode: string | null) => void;
  onAccount?: (account: AccountInfo | null) => void;
  /** ที่เก็บธงข้ามการพาไปล็อกอิน (ค่าเริ่มต้น = localStorage ของเบราว์เซอร์) */
  flags?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

/** ธงที่ตั้งก่อนพาไปล็อกอินกับ Google: กลับมาแล้วให้ใช้ความคืบหน้าของบัญชีนั้นแทนสำเนาในเครื่อง */
const SIGNIN_FLAG = "ai-trainer-quest-google-signin";
/** ธงที่ตั้งเมื่อผูกบัญชีไม่ได้เพราะบัญชี Google นั้นมีความคืบหน้าอยู่แล้ว: ครั้งถัดไปให้เข้าสู่ระบบบัญชีนั้นตรง ๆ */
const FORCE_SIGNIN_FLAG = "ai-trainer-quest-google-force";
const ALREADY_LINKED = "identity_already_exists";

/** มีชื่อและรหัสห้องเรียนแล้วจึงส่งขึ้นฐานข้อมูลกลาง ผู้เล่นที่ไม่ใส่รหัสห้องเรียนเก็บในเครื่องอย่างเดียว เว้นแต่เข้าสู่ระบบด้วย Google */
const sharable = (data: SaveData, account: AccountInfo | null): boolean => Boolean(data.profile?.name && (data.profile.classCode || account?.provider === "google"));

/**
 * เก็บในเครื่องทันที แล้วส่งขึ้นฐานข้อมูลกลางแบบหน่วง ถ้าเครือข่ายล่มเกมยังเล่นต่อได้จากสำเนาในเครื่อง
 * และส่งใหม่เมื่อบันทึกครั้งถัดไป
 */
export class SyncedProgressStore implements ProgressStore {
  private readonly local: ProgressStore;
  private readonly remote: RemoteBackend;
  private readonly delayMs: number;
  private readonly retryMs: number;
  private readonly loadTimeoutMs: number;
  /** คิวของคำสั่งที่ส่งไปฐานข้อมูลกลาง ให้ทำทีละคำสั่งตามลำดับ (เช่น เริ่มใหม่ต้องไม่แซงการบันทึกที่ค้างอยู่) */
  private chain: Promise<void> = Promise.resolve();
  private readonly onStatus: NonNullable<SyncOptions["onStatus"]>;
  private readonly onAccount: NonNullable<SyncOptions["onAccount"]>;
  private readonly flags: NonNullable<SyncOptions["flags"]> | null;
  private account: AccountInfo | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queued: SaveData | null = null;
  private resumeCode: string | null = null;

  constructor(local: ProgressStore, remote: RemoteBackend, options: SyncOptions = {}) {
    this.local = local;
    this.remote = remote;
    this.delayMs = options.delayMs ?? 2000;
    this.retryMs = options.retryMs ?? 15000;
    this.loadTimeoutMs = options.loadTimeoutMs ?? 6000;
    this.onStatus = options.onStatus ?? (() => {});
    this.onAccount = options.onAccount ?? (() => {});
    this.flags = options.flags ?? (typeof window === "undefined" ? null : window.localStorage);
  }

  /** เข้าสู่ระบบด้วย Google ได้หรือไม่ (ฐานข้อมูลกลางรองรับ) */
  get supportsGoogle(): boolean {
    return typeof this.remote.signInWithGoogle === "function";
  }

  /** ผูกบัญชีครั้งก่อนไม่สำเร็จเพราะบัญชี Google นั้นมีความคืบหน้าอยู่แล้ว */
  get googleInUse(): boolean {
    return this.remote.authError === ALREADY_LINKED;
  }

  get googleFailed(): boolean {
    return Boolean(this.remote.authError) && !this.googleInUse;
  }

  /** รหัสและคำอธิบายของข้อผิดพลาดล่าสุด ให้ผู้ดูแลระบบใช้หาสาเหตุ */
  get googleErrorDetail(): string | null {
    return this.remote.authErrorDetail ?? this.remote.authError ?? null;
  }

  /**
   * พาไปหน้าล็อกอินของ Google (หน้าเกมจะถูกเปิดใหม่เมื่อกลับมา)
   * เครื่องที่มีบัญชีไม่ระบุตัวตนอยู่แล้วจะผูก Google เข้ากับบัญชีเดิม เครื่องอื่นเข้าสู่ระบบแล้วใช้ความคืบหน้าของบัญชีนั้น
   */
  async signInWithGoogle(): Promise<void> {
    if (!this.remote.signInWithGoogle) return;
    await this.flush();
    const force = this.flags?.getItem(FORCE_SIGNIN_FLAG) === "1";
    const link = !force && this.account?.provider === "anonymous";
    if (!link) {
      // ออกจากบัญชีไม่ระบุตัวตนของเครื่องนี้ก่อน ความคืบหน้าของบัญชีนั้นยังอยู่ในฐานข้อมูลและเล่นต่อได้ด้วยรหัสเล่นต่อ
      if (this.account) await this.remote.signOut?.();
      this.flags?.setItem(SIGNIN_FLAG, "1");
    }
    this.flags?.removeItem(FORCE_SIGNIN_FLAG);
    await this.remote.signInWithGoogle(link);
  }

  /** ออกจากระบบที่เครื่องนี้: ส่งความคืบหน้าที่ค้างอยู่ขึ้นไปก่อน แล้วลบสำเนาในเครื่อง (เครื่องที่ใช้ร่วมกัน) */
  async signOut(): Promise<void> {
    await this.flush();
    this.queued = null;
    this.resumeCode = null;
    await this.local.clear();
    await this.remote.signOut?.();
    this.account = null;
    this.onAccount(null);
    this.onStatus("local", null);
  }

  async load(): Promise<SaveData | null> {
    const local = await this.local.load();
    let record: RemoteRecord | null = null;
    // เพิ่งกลับจากการเข้าสู่ระบบด้วย Google: ถ้าบัญชีนั้นมีความคืบหน้าอยู่แล้ว ใช้ของบัญชี ไม่ให้สำเนาในเครื่อง (ที่อาจเป็นของคนอื่น) ไปทับ
    const signingIn = this.flags?.getItem(SIGNIN_FLAG) === "1";
    this.flags?.removeItem(SIGNIN_FLAG);
    if (this.googleInUse) this.flags?.setItem(FORCE_SIGNIN_FLAG, "1");
    try {
      this.account = (await withTimeout(this.remote.account?.() ?? Promise.resolve(null), this.loadTimeoutMs)) ?? null;
      this.onAccount(this.account);
      record = await withTimeout(this.remote.load(), this.loadTimeoutMs);
    } catch {
      // เครือข่ายช้าหรือล่ม: เล่นจากสำเนาในเครื่อง แล้วส่งขึ้นเมื่อบันทึกครั้งถัดไป
      this.onStatus("error", null);
      return local;
    }
    if (!record) {
      // ยังไม่มีในฐานข้อมูลกลาง: ใช้สำเนาในเครื่อง และส่งขึ้นถ้ามีรหัสห้องเรียนแล้ว
      if (local && sharable(local, this.account)) this.schedule(local);
      else this.onStatus("local", null);
      return local;
    }
    this.resumeCode = record.resumeCode;
    const remote = migrateSave(record.data);
    const takeRemote = signingIn && this.account?.provider === "google" && remote !== null;
    if (!takeRemote && local && (!remote || local.updatedAt > remote.updatedAt)) {
      this.schedule(local);
      return local;
    }
    this.onStatus("synced", this.resumeCode);
    if (!remote) return local;
    const merged = takeRemote ? remote : restoreEvidenceImage(remote, local);
    await this.local.save(merged);
    return merged;
  }

  async save(data: SaveData): Promise<void> {
    await this.local.save(data);
    if (sharable(data, this.account)) this.schedule(data);
  }

  async clear(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
    this.resumeCode = null;
    await this.local.clear();
    await this.enqueue(async () => {
      try {
        await this.remote.reset();
        this.onStatus("local", null);
      } catch {
        this.onStatus("error", null);
      }
    });
  }

  /**
   * ผู้เรียนคนใหม่มาใช้เครื่องนี้ (เครื่องที่ใช้ร่วมกัน): ส่งความคืบหน้าของคนเดิมที่ค้างอยู่ขึ้นไปก่อน
   * แล้วลบสำเนาในเครื่องและตัดการเชื่อม ข้อมูลของคนเดิมในฐานข้อมูลกลางไม่ถูกแตะ
   */
  async detach(): Promise<void> {
    await this.flush();
    this.queued = null;
    this.resumeCode = null;
    await this.local.clear();
    await this.enqueue(async () => {
      try {
        const google = this.account?.provider === "google";
        await this.remote.detach();
        if (google) {
          this.account = null;
          this.onAccount(null);
        }
        this.onStatus("local", null);
      } catch {
        this.onStatus("error", null);
      }
    });
  }

  /** ย้ายมาเล่นต่อที่เครื่องนี้ คืนข้อมูลของผู้เล่น หรือ null ถ้ารหัสไม่ถูก */
  async claim(code: string): Promise<SaveData | null> {
    // ความคืบหน้าของผู้เล่นที่อยู่ในเครื่องนี้ก่อนหน้า (ถ้ามี) ต้องขึ้นฐานข้อมูลกลางก่อนถูกแทนที่
    await this.flush();
    const record = await this.remote.claim(code);
    const data = record && migrateSave(record.data);
    if (!record || !data) return null;
    this.resumeCode = record.resumeCode;
    await this.local.save(data);
    this.onStatus("synced", this.resumeCode);
    return data;
  }

  /** ส่งรายการที่ค้างอยู่ทันที (ใช้ตอนปิดหน้าเกมและในเทสต์) */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.enqueue(async () => {
      const data = this.queued;
      this.queued = null;
      if (!data) return;
      try {
        this.resumeCode = await this.remote.save(withoutEvidenceImage(data));
        if (!this.account) {
          this.account = (await this.remote.account?.()) ?? { provider: "anonymous", email: null };
          this.onAccount(this.account);
        }
        this.onStatus(this.queued ? "pending" : "synced", this.resumeCode);
      } catch {
        // สำเนาในเครื่องยังครบ เก็บรายการไว้แล้วลองส่งใหม่ภายหลัง
        this.queued ??= data;
        this.onStatus("error", this.resumeCode);
        this.timer ??= setTimeout(() => void this.flush(), this.retryMs);
      }
    });
  }

  private schedule(data: SaveData): void {
    this.queued = data;
    this.onStatus("pending", this.resumeCode);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(task, task);
    return this.chain;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}

/** ฐานข้อมูลกลางไม่เก็บภาพหลักฐาน ถ้าเครื่องนี้มีภาพอยู่ให้ใส่คืน */
function restoreEvidenceImage(remote: SaveData, local: SaveData | null): SaveData {
  if (!local) return remote;
  const rooms = { ...remote.rooms };
  for (const [room, progress] of Object.entries(local.rooms)) {
    const image = progress.field?.evidence.image;
    const target = rooms[Number(room)];
    if (image && target?.field && !target.field.evidence.image) rooms[Number(room)] = { ...target, field: { ...target.field, evidence: { ...target.field.evidence, image } } };
  }
  return { ...remote, rooms };
}

/** รหัสห้องเรียน: ตัวอักษรอังกฤษ ตัวเลข ขีด 1–20 ตัว ตรงกับที่ supabase/schema.sql ตรวจ */
export const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{1,20}$/;
export const normalizeClassCode = (text: string): string => text.trim().toUpperCase();
