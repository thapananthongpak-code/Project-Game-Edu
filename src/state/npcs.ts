// NPC ประจำห้อง (docs/GDD.md ข้อ 16): แต่ละคนผูกกับหัวข้อหนึ่ง และมีบทบาทหนึ่งอย่าง
//   quest = เควสเสริมช่วยเหลือ (เก็บของที่หายในห้อง), quiz = ถามตอบพิเศษจากเนื้อหาของหัวข้อ, shop = ร้านพิเศษ
// เป็นกิจกรรมเสริม ไม่บังคับ ไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ หรือการวัดผล ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน ไม่ import อะไร
// ชื่อและบทพูดของ NPC อยู่ใน src/content/ui-strings.ts โจทย์ของ quiz สร้างจาก course.json (src/content/choices.ts)

export const NPC_IDS = ["mechanic", "coach", "archivist", "foreman", "vendor", "director"] as const;
export type NpcId = (typeof NPC_IDS)[number];
export type NpcRole = "quest" | "quiz" | "shop";

export interface NpcSpec {
  id: NpcId;
  /** หัวข้อ (1–6) ที่ NPC คนนี้ประจำอยู่ */
  topic: number;
  role: NpcRole;
  /** quest: จำนวนของที่ต้องเก็บ */
  pickups: number;
  /** quiz: จำนวนข้อต่อรอบ */
  questions: number;
}

const npc = (id: NpcId, topic: number, role: NpcRole, amount = 0): NpcSpec => ({ id, topic, role, pickups: role === "quest" ? amount : 0, questions: role === "quiz" ? amount : 0 });

export const NPCS: Record<NpcId, NpcSpec> = {
  mechanic: npc("mechanic", 1, "quest", 3),
  coach: npc("coach", 2, "quiz", 4),
  archivist: npc("archivist", 3, "shop"),
  foreman: npc("foreman", 4, "quest", 4),
  vendor: npc("vendor", 5, "shop"),
  director: npc("director", 6, "quiz", 4),
};

/** เครดิตวิจัยจากกิจกรรมเสริม (ก่อนคูณตัวคูณของระดับความยาก) */
export const NPC_REWARDS = {
  /** ทำเควสเสริมสำเร็จ */
  quest: 25,
  /** ต่อข้อที่ตอบถูกในรอบที่ดีที่สุดของถามตอบพิเศษ */
  quizPerCorrect: 5,
} as const;

/** ความคืบหน้ากับ NPC หนึ่งคน */
export interface NpcRecord {
  /** quest: รับเควสแล้ว */
  accepted: boolean;
  /** quest: ลำดับของชิ้นที่เก็บแล้ว */
  found: number[];
  /** quest: ส่งของครบแล้ว */
  done: boolean;
  /** quiz: จำนวนข้อที่ถูกของรอบที่ดีที่สุด และจำนวนรอบที่เล่น */
  best: number;
  tries: number;
}

export const emptyNpc = (): NpcRecord => ({ accepted: false, found: [], done: false, best: 0, tries: 0 });

export const isNpcId = (value: unknown): value is NpcId => NPC_IDS.some((id) => id === value);

/** เก็บของครบตามจำนวนของเควสแล้วหรือยัง (ยังไม่ได้ส่ง) */
export const questReady = (spec: NpcSpec, record: NpcRecord | undefined): boolean => spec.role === "quest" && (record?.found.length ?? 0) >= spec.pickups;

/** เครดิตจากกิจกรรมเสริมทั้งหมด: เควสที่ส่งแล้ว และรอบที่ดีที่สุดของถามตอบพิเศษ */
export function npcCredits(records: Record<string, NpcRecord>): number {
  let total = 0;
  for (const spec of Object.values(NPCS)) {
    const record = records[spec.id];
    if (!record) continue;
    if (spec.role === "quest" && record.done) total += NPC_REWARDS.quest;
    if (spec.role === "quiz") total += Math.min(spec.questions, record.best) * NPC_REWARDS.quizPerCorrect;
  }
  return total;
}

/** จำนวนกิจกรรมเสริมที่ทำแล้ว (เควสที่ส่งแล้ว และถามตอบพิเศษที่เล่นแล้วอย่างน้อยหนึ่งรอบ) */
export const npcActivitiesDone = (records: Record<string, NpcRecord>): number =>
  Object.values(NPCS).filter((spec) => (spec.role === "quest" && records[spec.id]?.done) || (spec.role === "quiz" && (records[spec.id]?.tries ?? 0) > 0)).length;

export const NPC_ACTIVITY_TOTAL = Object.values(NPCS).filter((spec) => spec.role !== "shop").length;
