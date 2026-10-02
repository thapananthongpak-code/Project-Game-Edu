// แมพของเกม (docs/GDD.md ข้อ 15): แมพ 1 → 2 → 3 เล่นต่อกันตามลำดับ ยิ่งไปไกลยิ่งยาก
//   easy   = แมพ 1 Pixel AI Lab: 6 ห้องเรียน เรียนครบทุกสถานี ภารกิจภาคสนาม แบบทดสอบหลังเรียน และใบประกาศอยู่ที่นี่
//   normal = แมพ 2 ศูนย์วิจัยภาคสนาม: 3 ห้อง ทบทวนหัวข้อ 1–5 ที่ระดับปกติขึ้นไป ไคจูชุดใหม่
//   hard   = แมพ 3 ป้อมปราการ: ห้องเดียว เครื่องทดสอบรวมที่ระดับท้าทาย แล้วสู้บอสใหญ่ 3 ร่าง
// แมพถัดไปเปิดเมื่อชนะด่านต่อสู้ครบทุกด่านของแมพก่อนหน้า (mapUnlocked ใน gameStore.ts) รหัส easy / normal / hard
// คงไว้ตามรุ่นที่ผู้เล่นเลือก "ระดับความยาก" ตอนเริ่มเกม เพราะเป็นค่าที่บันทึกใน SaveData
// แต่ละแมพกำหนดจำนวนห้อง สิ่งที่ต้องทำก่อนได้แกน AI ด่านต่อสู้ ตัวช่วยที่ใช้ได้ และรางวัล
// ความคืบหน้าเก็บรายหัวข้อแยกตามแมพ แมพต่างกันที่ "ห้อง" ซึ่งรวมหลายหัวข้อได้
// ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน ไม่ import เนื้อหา
import type { Tier } from "./adaptive.config";
import type { Trait } from "./battle.config";
import type { WeaponClass } from "./gear";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** ลำดับของแมพ นับจาก 0 */
export const mapIndex = (map: Difficulty | undefined): number => Math.max(0, DIFFICULTIES.indexOf(map ?? "easy"));

/** ภาพของคู่ต่อสู้: ไคจูของแมพ 1 (1–6) ไคจูของแมพ 2 (7–9) และร่างที่ 2–4 ของบอส (docs/ART_GUIDE.md ข้อ 5.6) */
export type FoeArt = "kaiju_1" | "kaiju_2" | "kaiju_3" | "kaiju_4" | "kaiju_5" | "kaiju_6" | "kaiju_7" | "kaiju_8" | "kaiju_9" | "boss_2" | "boss_3" | "boss_4";

/** ร่างหนึ่งของคู่ต่อสู้ บอสของแมพ 2 และ 3 มีหลายร่าง ต้องชนะทีละร่าง */
export interface FormSpec {
  art: FoeArt;
  hp: number;
  trait: Trait;
  /** ประเภทของอาวุธที่ร่างนี้แพ้ทาง: อาวุธประเภทนี้โจมตีแรงขึ้น GEAR.advantage ทุกครั้ง */
  weak: WeaponClass;
}

export interface BattleSpec {
  /** รหัสด่าน ใช้เป็นคีย์ของผลด่านใน SaveData.battles ห้ามเปลี่ยน */
  id: string;
  forms: readonly FormSpec[];
  /** ฉากหลังของด่าน (bg_battle_<n>) */
  backdrop: number;
  /** หัวข้อที่ใช้โจทย์ (ด่านลักษณะ boss ไล่ตามเฟส ด่านอื่นวนตามตา) */
  sources: readonly number[];
  /** แกน AI ของหัวข้อที่ต้องมีก่อนจึงออกปฏิบัติการได้ */
  requires: readonly number[];
  /** ชนะแล้วเปิดห้องลำดับนี้ (นับจาก 1) ไม่มี = ไม่เปิดห้อง */
  unlocks?: number;
  /** ด่านสุดท้ายของระดับ */
  boss: boolean;
  /**
   * ค่าพลังรวมของการ์เดียนที่แนะนำสำหรับด่านนี้ (เทียบกับ guardianPower ใน gear.ts) เป็นคำแนะนำเท่านั้น ไม่ใช่เงื่อนไข
   * ตั้งจากชุดอุปกรณ์ที่ผู้เล่นทั่วไปซื้อได้ก่อนถึงด่าน (PAR ใน balance.ts) และตรวจด้วยแบบจำลองใน balance.test.ts
   */
  power: number;
}

export interface DifficultySpec {
  /** ห้องของระดับนี้ แต่ละห้องสอนหัวข้อตามลำดับที่ระบุ */
  zones: readonly { topics: readonly number[] }[];
  /** ด่านต่อสู้ตามลำดับที่ต้องชนะ */
  battles: readonly BattleSpec[];
  /** บทสอนที่สถานี: required = ต้องฟังครบก่อนทำเควส, optional = เปิดอ่านจากคลังความรู้ได้แต่ไม่บังคับ, none = ไม่มี */
  stations: "required" | "optional" | "none";
  /** ต้องตอบคำถามทบทวนก่อนรับแกน AI หรือไม่ */
  review: boolean;
  /** ระดับความช่วยเหลือต่ำสุดของเควส (ระดับไม่ลดต่ำกว่านี้แม้ตอบผิด) */
  minTier: Tier;
  /** ตัวคูณเครดิตวิจัย */
  creditMultiplier: number;
  /** จำนวนครั้งที่ขอข้อมูลจากพี่บิตได้ต่อการออกปฏิบัติการ */
  battleHints: number;
  /** จำนวนคำถามที่ถามติวเตอร์ AI ได้ต่อการเปิดเกมหนึ่งรอบ (ไม่เกินขีดจำกัดของเซิร์ฟเวอร์) */
  tutorQuestions: number;
  /** พลังเริ่มต้นของการ์เดียน */
  robotHp: number;
  /** ชุดโจทย์ของด่านต่อสู้: base = ชุดพื้นฐาน, mixed = พื้นฐานรวมชุดยาก, hard = ชุดยากอย่างเดียว */
  pools: "base" | "mixed" | "hard";
  /** แพ้แล้วออกปฏิบัติการใหม่: false = ไคจูเหลือพลังเท่าที่ตีไว้, true = ร่างปัจจุบันกลับมาพลังเต็ม (ร่างที่ชนะแล้วไม่ต้องสู้ซ้ำ) */
  formResetsOnRetry: boolean;
}

const roomKaiju = (n: number, hp: number, trait: Trait, weak: WeaponClass, power: number): BattleSpec => ({ id: `k${n}`, forms: [{ art: `kaiju_${n}` as FoeArt, hp, trait, weak }], backdrop: n, sources: [n], requires: [n], unlocks: n + 1, boss: false, power });

export const CAMPAIGN: Record<Difficulty, DifficultySpec> = {
  // แมพ 1: 6 ห้อง ห้องละหัวข้อ เรียนครบทุกสถานี ไคจูประจำห้อง 5 ตัว และบอสโอเมก้า 6 เฟส
  easy: {
    zones: [1, 2, 3, 4, 5, 6].map((topic) => ({ topics: [topic] })),
    battles: [
      // กลิตช์แพ้ทางหมัด: ด่านแรกจึงได้เห็นคำว่า "ได้เปรียบ" ตั้งแต่ยังไม่ซื้ออะไร
      roomKaiju(1, 8, "basic", "strike", 80),
      roomKaiju(2, 14, "charge", "blade", 100),
      roomKaiju(3, 10, "regen", "beam", 110),
      roomKaiju(4, 18, "combo", "strike", 110),
      roomKaiju(5, 12, "swarm", "beam", 140),
      { id: "omega", forms: [{ art: "kaiju_6", hp: 18, trait: "boss", weak: "blade" }], backdrop: 6, sources: [1, 2, 3, 4, 5, 6], requires: [6], boss: true, power: 160 },
    ],
    stations: "required",
    review: true,
    minTier: "assist",
    creditMultiplier: 1,
    battleHints: 2,
    tutorQuestions: 8,
    robotHp: 6,
    pools: "base",
    formResetsOnRetry: false,
  },
  // แมพ 2: 3 ห้อง ทบทวนหัวข้อ 1–5 (บทสอนอ่านได้จากคลังความรู้แต่ไม่บังคับ) ไคจูชุดใหม่ 3 ตัว และโอเมก้าที่กลับมา 2 ร่าง
  normal: {
    zones: [{ topics: [1, 2] }, { topics: [3, 4] }, { topics: [5] }],
    battles: [
      { id: "n1", forms: [{ art: "kaiju_7", hp: 16, trait: "charge", weak: "blade" }], backdrop: 7, sources: [1, 2], requires: [1, 2], unlocks: 2, boss: false, power: 160 },
      { id: "n2", forms: [{ art: "kaiju_8", hp: 16, trait: "armor", weak: "strike" }], backdrop: 8, sources: [3, 4], requires: [3, 4], unlocks: 3, boss: false, power: 170 },
      { id: "n3", forms: [{ art: "kaiju_9", hp: 13, trait: "swarm", weak: "beam" }], backdrop: 9, sources: [5], requires: [5], boss: false, power: 170 },
      {
        id: "omega-n",
        forms: [
          { art: "kaiju_6", hp: 13, trait: "charge", weak: "blade" },
          { art: "boss_2", hp: 13, trait: "regen", weak: "beam" },
        ],
        backdrop: 6,
        sources: [1, 2, 3, 4, 5, 6],
        requires: [5],
        boss: true,
        power: 190,
      },
    ],
    stations: "optional",
    review: true,
    minTier: "standard",
    creditMultiplier: 1.5,
    battleHints: 1,
    tutorQuestions: 4,
    robotHp: 6,
    pools: "mixed",
    formResetsOnRetry: false,
  },
  // แมพ 3: ห้องเดียว ไม่มีบทสอน ทำเควสหัวข้อ 1–5 ที่ระดับท้าทาย แล้วสู้บอสใหญ่ที่กลายร่างได้ 3 ร่าง
  hard: {
    zones: [{ topics: [1, 2, 3, 4, 5] }],
    battles: [
      {
        id: "end",
        forms: [
          { art: "boss_2", hp: 13, trait: "charge", weak: "beam" },
          { art: "boss_3", hp: 12, trait: "armor", weak: "strike" },
          { art: "boss_4", hp: 15, trait: "enrage", weak: "blade" },
        ],
        backdrop: 10,
        sources: [1, 2, 3, 4, 5, 6],
        requires: [1, 2, 3, 4, 5],
        boss: true,
        power: 170,
      },
    ],
    stations: "none",
    review: false,
    minTier: "challenge",
    creditMultiplier: 2,
    battleHints: 0,
    tutorQuestions: 2,
    robotHp: 5,
    pools: "hard",
    formResetsOnRetry: true,
  },
};

export const campaignOf = (difficulty: Difficulty | undefined): DifficultySpec => CAMPAIGN[difficulty ?? "easy"];

export const battleOf = (difficulty: Difficulty | undefined, id: string): BattleSpec | undefined => campaignOf(difficulty).battles.find((battle) => battle.id === id);

/** ห้อง (นับจาก 1) ที่สอนหัวข้อนี้ */
export const zoneOfTopic = (difficulty: Difficulty | undefined, topic: number): number => campaignOf(difficulty).zones.findIndex((zone) => zone.topics.includes(topic)) + 1;

/** ด่านที่ต้องชนะก่อนเข้าห้องนี้ (ไม่มี = เข้าได้เลย) */
export const gateOf = (difficulty: Difficulty | undefined, zone: number): BattleSpec | undefined => campaignOf(difficulty).battles.find((battle) => battle.unlocks === zone);

/** หัวข้อทั้งหมดที่แมพนี้มีห้องให้ทำ (แมพ 2 และ 3 ไม่มีหัวข้อ 6: ภารกิจภาคสนามและแบบทดสอบหลังเรียนอยู่ที่แมพ 1 เท่านั้น) */
export const topicsOf = (difficulty: Difficulty | undefined): number[] => campaignOf(difficulty).zones.flatMap((zone) => zone.topics);

/** แมพที่ด่านต่อสู้นี้อยู่ */
export const mapOfBattle = (id: string): Difficulty | undefined => DIFFICULTIES.find((map) => CAMPAIGN[map].battles.some((battle) => battle.id === id));
