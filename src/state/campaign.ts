// ระดับความยากของเกม (docs/GDD.md ข้อ 15): ง่าย กลาง ยาก ผู้เล่นเลือกตอนเริ่มเกม ค่าเริ่มต้นคือง่าย
// ระดับกำหนดจำนวนห้อง สิ่งที่ต้องทำก่อนได้แกน AI ด่านต่อสู้ ตัวช่วยที่ใช้ได้ และรางวัล
// ความคืบหน้ายังเก็บรายหัวข้อ (1–6) เหมือนกันทุกระดับ ระดับต่างกันที่ "ห้อง" ซึ่งรวมหลายหัวข้อได้
// ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน ไม่ import เนื้อหา
import type { Tier } from "./adaptive.config";
import type { Trait } from "./battle.config";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** ภาพของคู่ต่อสู้: ไคจูของด่าน 1–6 หรือร่างที่ 2 และ 3 ของบอส (docs/ART_GUIDE.md ข้อ 5.6) */
export type FoeArt = "kaiju_1" | "kaiju_2" | "kaiju_3" | "kaiju_4" | "kaiju_5" | "kaiju_6" | "boss_2" | "boss_3";

/** ร่างหนึ่งของคู่ต่อสู้ บอสของระดับกลางและยากมีหลายร่าง ต้องชนะทีละร่าง */
export interface FormSpec {
  art: FoeArt;
  hp: number;
  trait: Trait;
}

export interface BattleSpec {
  /** รหัสด่าน ใช้เป็นคีย์ของผลด่านใน SaveData.battles ห้ามเปลี่ยน */
  id: string;
  forms: readonly FormSpec[];
  /** ฉากหลังของด่าน (1–6) */
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

const roomKaiju = (n: number, hp: number, trait: Trait, power: number): BattleSpec => ({ id: `k${n}`, forms: [{ art: `kaiju_${n}` as FoeArt, hp, trait }], backdrop: n, sources: [n], requires: [n], unlocks: n + 1, boss: false, power });

export const CAMPAIGN: Record<Difficulty, DifficultySpec> = {
  // ง่าย: 6 ห้อง ห้องละหัวข้อ เรียนครบทุกสถานี ไคจูประจำห้อง 5 ตัว และบอสโอเมก้า 6 เฟส
  easy: {
    zones: [1, 2, 3, 4, 5, 6].map((topic) => ({ topics: [topic] })),
    battles: [
      roomKaiju(1, 6, "basic", 60),
      roomKaiju(2, 10, "charge", 80),
      roomKaiju(3, 9, "regen", 90),
      roomKaiju(4, 14, "combo", 110),
      roomKaiju(5, 8, "swarm", 120),
      { id: "omega", forms: [{ art: "kaiju_6", hp: 12, trait: "boss" }], backdrop: 6, sources: [1, 2, 3, 4, 5, 6], requires: [6], boss: true, power: 140 },
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
  // กลาง: 3 ห้อง ห้องละ 2 หัวข้อ บทสอนอ่านได้จากคลังความรู้แต่ไม่บังคับ ไคจูประจำห้อง 3 ตัว และบอส 2 ร่าง
  normal: {
    zones: [{ topics: [1, 2] }, { topics: [3, 4] }, { topics: [5, 6] }],
    battles: [
      { id: "n1", forms: [{ art: "kaiju_2", hp: 11, trait: "charge" }], backdrop: 2, sources: [1, 2], requires: [1, 2], unlocks: 2, boss: false, power: 80 },
      { id: "n2", forms: [{ art: "kaiju_4", hp: 10, trait: "armor" }], backdrop: 4, sources: [3, 4], requires: [3, 4], unlocks: 3, boss: false, power: 120 },
      { id: "n3", forms: [{ art: "kaiju_5", hp: 10, trait: "swarm" }], backdrop: 5, sources: [5], requires: [5], boss: false, power: 140 },
      {
        id: "omega-n",
        forms: [
          { art: "kaiju_6", hp: 10, trait: "charge" },
          { art: "boss_2", hp: 10, trait: "regen" },
        ],
        backdrop: 6,
        sources: [1, 2, 3, 4, 5, 6],
        requires: [6],
        boss: true,
        power: 140,
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
  // ยาก: ห้องเดียว ไม่มีบทสอน ทำเควสทุกหัวข้อที่ระดับท้าทาย แล้วสู้บอสที่กลายร่างได้ 3 ร่าง
  hard: {
    zones: [{ topics: [1, 2, 3, 4, 5, 6] }],
    battles: [
      {
        id: "end",
        forms: [
          { art: "kaiju_6", hp: 10, trait: "charge" },
          { art: "boss_2", hp: 9, trait: "armor" },
          { art: "boss_3", hp: 12, trait: "enrage" },
        ],
        backdrop: 6,
        sources: [1, 2, 3, 4, 5, 6],
        requires: [1, 2, 3, 4, 5, 6],
        boss: true,
        power: 120,
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
