// NPC ของแต่ละแมพ (docs/GDD.md ข้อ 16): แต่ละคนประจำอยู่ในห้องของหัวข้อหนึ่ง มีเรื่องราวของตัวเอง และมีบทบาทหนึ่งอย่าง
//   quest = เควสเสริมช่วยเหลือ (เก็บของที่หายในห้อง), quiz = ถามตอบพิเศษจากเนื้อหา, shop = ร้านพิเศษ (ของที่ย่านร้านค้าไม่มี), gift = ช่วยเหลือ (ให้ของใช้ครั้งเดียว)
// เป็นกิจกรรมเสริม ไม่บังคับ ไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ หรือการวัดผล ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน
// ชื่อ เรื่องราว และบทพูดของ NPC อยู่ใน src/content/ui-strings.ts โจทย์ของ quiz สร้างจาก course.json (src/content/choices.ts)
import type { Difficulty } from "./campaign";
import type { Supply } from "./shop.config";

export const NPC_IDS = ["mechanic", "coach", "archivist", "foreman", "vendor", "director", "smith", "sage", "ranger", "medic", "engineer", "technician", "captain", "keeper"] as const;
export type NpcId = (typeof NPC_IDS)[number];
export type NpcRole = "quest" | "quiz" | "shop" | "gift";

export interface NpcSpec {
  id: NpcId;
  /** แมพที่ NPC คนนี้อยู่ */
  map: Difficulty;
  /** หัวข้อ (1–6) ของห้องที่ NPC คนนี้ประจำอยู่ */
  topic: number;
  role: NpcRole;
  /** quest: จำนวนของที่ต้องเก็บ */
  pickups: number;
  /** quiz: จำนวนข้อต่อรอบ และหัวข้อที่ใช้โจทย์ (ต้องได้แกน AI ของทุกหัวข้อนี้ในแมพนั้นก่อนจึงเล่นได้) */
  questions: number;
  quizTopics: readonly number[];
  /** gift: ของใช้ที่ให้ครั้งเดียว */
  gift: readonly Supply[];
  /** สถานที่ (ลำดับห้องของแมพ นับจาก 1) ที่ NPC คนนี้ประจำอยู่ในแมพที่ห้องไม่ผูกกับหัวข้อ (แมพ 2) แมพอื่นเป็น 0 ใช้หัวข้อ topic แทน */
  zone: number;
  /** quest: ของที่ได้เมื่อส่งของครบ (รหัสสินค้ารางวัลใน CATALOG ที่ไม่วางขาย) */
  reward: string | null;
}

type Extra = Partial<Pick<NpcSpec, "pickups" | "questions" | "quizTopics" | "gift" | "zone" | "reward">>;
const npc = (id: NpcId, map: Difficulty, topic: number, role: NpcRole, extra: Extra = {}): NpcSpec => ({
  id,
  map,
  topic,
  role,
  pickups: 0,
  questions: 0,
  gift: [],
  zone: 0,
  reward: null,
  ...extra,
  quizTopics: role === "quiz" ? (extra.quizTopics ?? [topic]) : [],
});

export const NPCS: Record<NpcId, NpcSpec> = {
  // แมพ 1: ห้องละคน
  mechanic: npc("mechanic", "easy", 1, "quest", { pickups: 3 }),
  coach: npc("coach", "easy", 2, "quiz", { questions: 4 }),
  archivist: npc("archivist", "easy", 3, "shop"),
  foreman: npc("foreman", "easy", 4, "quest", { pickups: 4 }),
  vendor: npc("vendor", "easy", 5, "shop"),
  director: npc("director", "easy", 6, "quiz", { questions: 4 }),
  // แมพ 2: สามสถานที่ (zone) เมืองริมทะเลที่ถูกทำลาย: หน่วยลาดตระเวน (เควส ได้โมดูลแบตสำรอง) และหมอสนาม (ช่วยเหลือ)
  //        ฐานทัพหน่วยพิทักษ์: ช่างตีอาวุธ (อาวุธพิเศษ) นักวิเคราะห์ (ถามตอบสองหัวข้อ) และช่างกลฐานทัพ (เควส ได้โมดูลรีไซเคิลพลังงาน)
  //        โรงไฟฟ้ากังหันลม: ช่างไฟฟ้า (เควส ได้โมดูลเกราะพลังงาน)
  smith: npc("smith", "normal", 1, "shop", { zone: 2 }),
  sage: npc("sage", "normal", 2, "quiz", { questions: 5, quizTopics: [1, 2], zone: 2 }),
  ranger: npc("ranger", "normal", 4, "quest", { pickups: 4, zone: 1, reward: "module-reserve" }),
  medic: npc("medic", "normal", 5, "gift", { gift: ["repair-kit", "shield"], zone: 1 }),
  engineer: npc("engineer", "normal", 3, "quest", { pickups: 3, zone: 2, reward: "module-recycler" }),
  technician: npc("technician", "normal", 5, "quest", { pickups: 4, zone: 3, reward: "module-barrier" }),
  // แมพ 3: กัปตันป้อม (ถามตอบรวมทุกหัวข้อ) และนายคลังแสง (เกราะพิเศษ)
  captain: npc("captain", "hard", 5, "quiz", { questions: 6, quizTopics: [1, 2, 3, 4, 5] }),
  keeper: npc("keeper", "hard", 1, "shop"),
};

/** NPC ของแมพหนึ่ง ตามลำดับในรายการ */
/** NPC ที่อยู่ในสถานที่ลำดับที่ zone ของแมพ 2 (แมพอื่นไม่มีสถานที่) */
export const npcsOfZone = (map: Difficulty, zone: number): NpcSpec[] => npcsOfMap(map).filter((spec) => spec.zone === zone);

export const npcsOfMap = (map: Difficulty): NpcSpec[] => NPC_IDS.map((id) => NPCS[id]).filter((spec) => spec.map === map);

/** เครดิตวิจัยจากกิจกรรมเสริม (ก่อนคูณตัวคูณของแมพ) */
export const NPC_REWARDS = {
  /** ทำเควสเสริมสำเร็จ */
  quest: 25,
  /** ต่อข้อที่ตอบถูกในรอบที่ดีที่สุดของถามตอบพิเศษ */
  quizPerCorrect: 5,
} as const;

/** ความคืบหน้ากับ NPC หนึ่งคน */
export interface NpcRecord {
  /** ฟังเรื่องราวของ NPC คนนี้จบแล้ว */
  met: boolean;
  /** quest: รับเควสแล้ว */
  accepted: boolean;
  /** quest: ลำดับของชิ้นที่เก็บแล้ว */
  found: number[];
  /** quest: ส่งของครบแล้ว */
  done: boolean;
  /** quiz: จำนวนข้อที่ถูกของรอบที่ดีที่สุด และจำนวนรอบที่เล่น */
  best: number;
  tries: number;
  /** gift: รับของไปแล้ว */
  gifted: boolean;
}

export const emptyNpc = (): NpcRecord => ({ met: false, accepted: false, found: [], done: false, best: 0, tries: 0, gifted: false });

export const isNpcId = (value: unknown): value is NpcId => NPC_IDS.some((id) => id === value);

/** เก็บของครบตามจำนวนของเควสแล้วหรือยัง (ยังไม่ได้ส่ง) */
export const questReady = (spec: NpcSpec, record: NpcRecord | undefined): boolean => spec.role === "quest" && (record?.found.length ?? 0) >= spec.pickups;

/** เครดิตจากกิจกรรมเสริมของแมพหนึ่ง (ไม่ระบุแมพ = ทุกแมพ): เควสที่ส่งแล้ว และรอบที่ดีที่สุดของถามตอบพิเศษ */
export function npcCredits(records: Record<string, NpcRecord>, map?: Difficulty): number {
  let total = 0;
  for (const spec of Object.values(NPCS)) {
    const record = records[spec.id];
    if (!record || (map !== undefined && spec.map !== map)) continue;
    if (spec.role === "quest" && record.done) total += NPC_REWARDS.quest;
    if (spec.role === "quiz") total += Math.min(spec.questions, record.best) * NPC_REWARDS.quizPerCorrect;
  }
  return total;
}

/** กิจกรรมเสริมที่นับความคืบหน้าได้ (เควส ถามตอบพิเศษ และการรับของช่วยเหลือ ร้านพิเศษไม่นับ) ของแมพหนึ่ง (ไม่ระบุ = ทุกแมพ) */
const activities = (map?: Difficulty): NpcSpec[] => Object.values(NPCS).filter((spec) => spec.role !== "shop" && (map === undefined || spec.map === map));

/** จำนวนกิจกรรมเสริมที่ทำแล้ว (เควสที่ส่งแล้ว ถามตอบพิเศษที่เล่นแล้วอย่างน้อยหนึ่งรอบ และของช่วยเหลือที่รับแล้ว) */
export const npcActivitiesDone = (records: Record<string, NpcRecord>, map?: Difficulty): number =>
  activities(map).filter((spec) => (spec.role === "quest" && records[spec.id]?.done) || (spec.role === "quiz" && (records[spec.id]?.tries ?? 0) > 0) || (spec.role === "gift" && records[spec.id]?.gifted)).length;

export const npcActivityTotal = (map?: Difficulty): number => activities(map).length;
/** จำนวนกิจกรรมเสริมของแมพ 1 (คงชื่อเดิมไว้ให้ส่วนที่สรุปเฉพาะแมพเรียน) */
export const NPC_ACTIVITY_TOTAL = npcActivityTotal("easy");
