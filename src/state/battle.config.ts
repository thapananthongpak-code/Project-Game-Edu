// ตัวเลขของด่านต่อสู้ไคจู (docs/GDD.md ข้อ 12) แก้กติกาแล้วต้องแก้ battle.test.ts ด้วย
// ไฟล์นี้ไม่ import อะไร

/** ลักษณะเฉพาะของไคจูแต่ละตัว ทำให้แต่ละด่านเล่นไม่เหมือนกัน */
export type Trait =
  /** ตอบถูกโจมตี ตอบผิดโดนโจมตี */
  | "basic"
  /** ทุก ๆ สามตา ไคจูชาร์จพลัง: ตอบถูกสวนกลับแรงขึ้น ตอบผิดโดนหนักขึ้น */
  | "charge"
  /** ตอบผิดแล้วไคจูฟื้นพลัง */
  | "regen"
  /** ตอบถูกติดต่อกันยิ่งโจมตีแรง */
  | "combo"
  /** ฝูงตัวเล็ก: ตอบถูกปราบได้ทีละตัว ยิ่งเหลือเยอะยิ่งโจมตีแรง */
  | "swarm"
  /** ด่านสุดท้าย: หลายเฟส แต่ละเฟสใช้โจทย์ของห้องหนึ่ง */
  | "boss";

export interface KaijuSpec {
  /** ห้องที่ต้องได้แกน AI ก่อนจึงสู้ด่านนี้ได้ (ด่าน = เลขห้อง) */
  room: number;
  hp: number;
  trait: Trait;
}

export const BATTLE = {
  robotHp: 6,
  /** ความเสียหายพื้นฐานของหุ่น และของไคจู */
  hit: 1,
  wrongDamage: 1,
  /** ตอบถูกติดต่อกันครบจำนวนนี้ทุกครั้ง พี่บิตยิงเสริมให้ */
  assistStreak: 2,
  assistDamage: 1,
  /** จำนวนครั้งที่ขอเปิดแผงอ้างอิงจากพี่บิตได้ต่อการออกปฏิบัติการหนึ่งครั้ง */
  hints: 2,
  repairKitHeal: 3,
  charge: { every: 3, counterDamage: 2, damage: 2 },
  regen: 1,
  comboMax: 3,
  /** ฝูงเหลือตั้งแต่ heavyFrom ตัวขึ้นไป โจมตีแรง heavyDamage */
  swarm: { heavyFrom: 3, heavyDamage: 2 },
  /** ด่านสุดท้าย: พลังต่อเฟส และพลังที่หุ่นฟื้นเมื่อผ่านเฟส */
  boss: { phaseHp: 2, phaseHeal: 1 },
  kaiju: [
    { room: 1, hp: 6, trait: "basic" },
    { room: 2, hp: 8, trait: "charge" },
    { room: 3, hp: 8, trait: "regen" },
    { room: 4, hp: 10, trait: "combo" },
    { room: 5, hp: 5, trait: "swarm" },
    { room: 6, hp: 12, trait: "boss" },
  ] as readonly KaijuSpec[],
} as const;
