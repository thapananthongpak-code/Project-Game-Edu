// อุปกรณ์ของการ์เดียน ค่าพลังรวม และกระเป๋าของใช้ (docs/GDD.md ข้อ 13 และ 17)
// แกน AI คือแหล่งพลังงานที่ทำให้การ์เดียนออกรบได้ ส่วนความเก่งมาจากอุปกรณ์ 3 ช่อง: อาวุธ เกราะ และชิป
// ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน ผลของอุปกรณ์ในการต่อสู้คำนวณใน battle.ts

export const WEAPONS = ["fist", "sword", "blaster"] as const;
export type Weapon = (typeof WEAPONS)[number];
export const ARMORS = ["plate", "heavy", "guard"] as const;
export type Armor = (typeof ARMORS)[number];
export const CHIPS = ["none", "retry", "charger"] as const;
export type Chip = (typeof CHIPS)[number];

export interface Gear {
  weapon: Weapon;
  armor: Armor;
  chip: Chip;
}

/** อุปกรณ์เริ่มต้นที่ทุกคนมี: หมัดเปล่า เกราะมาตรฐาน ไม่มีชิป */
export const DEFAULT_GEAR: Gear = { weapon: "fist", armor: "plate", chip: "none" };

export const GEAR = {
  /** ดาบพลังงาน: ตอบถูกติดต่อกันครบจำนวนนี้ทุกครั้ง การโจมตีครั้งนั้นเป็นคริติคอล (แรงคูณ critMultiplier) */
  sword: { critEvery: 3, critMultiplier: 2 },
  /** ปืนเลเซอร์: ตอบถูกติดต่อกันครบจำนวนนี้ทุกครั้ง คู่ต่อสู้ติดสตัน (ตอบผิดครั้งถัดไป คู่ต่อสู้ไม่ได้โจมตี) */
  blaster: { stunEvery: 3 },
  /** เกราะหนัก: พลังสูงสุดเพิ่ม */
  heavy: { hp: 2 },
  /** เกราะสะท้อน: กันการโจมตีครั้งแรกของคู่ต่อสู้แต่ละร่าง (ไม่ต้องกดใช้) */
  guard: { blocksPerForm: 1 },
  /** ชิปคิดทบทวน: ตอบผิดแล้วได้ตอบข้อเดิมอีกครั้ง จำนวนครั้งต่อการออกปฏิบัติการ */
  retry: { chances: 1 },
  /** ชิปเร่งพลัง: การโจมตีครั้งแรกใส่คู่ต่อสู้แต่ละร่างแรง 2 เท่า (เหมือนแบตเตอรี่เสริมที่ไม่ต้องพก) */
  charger: { openingBoost: true },
} as const;

/** จำนวนของใช้ที่พกเข้าด่านต่อสู้ได้ต่อการออกปฏิบัติการ ที่เหลืออยู่ในกล่องเก็บไอเทม */
export const BAG_SIZE = 3;

/**
 * ค่าพลังรวมของการ์เดียน: ตัวเลขประมาณความพร้อม ใช้เทียบกับพลังที่แนะนำของด่าน (BattleSpec.power)
 * เป็นคำแนะนำเท่านั้น พลังไม่ถึงก็ออกปฏิบัติการได้ถ้ามีแกน AI ที่ด่านต้องใช้
 */
export const POWER = {
  perHp: 10,
  weapon: { fist: 0, sword: 30, blaster: 30 } as Record<Weapon, number>,
  /** เกราะหนักนับจากพลังสูงสุดที่เพิ่มแล้ว */
  armor: { plate: 0, heavy: 0, guard: 30 } as Record<Armor, number>,
  chip: { none: 0, retry: 30, charger: 20 } as Record<Chip, number>,
  /** สิทธิพิเศษของเครื่องแบบ (ชุดเกราะผู้พิทักษ์นับจากพลังสูงสุดที่เพิ่มแล้ว) */
  outfit: { lab: 0, engineer: 5, pilot: 10, researcher: 10, guardian: 0, commander: 15 } as Record<string, number>,
  module: { scanner: 10, laser: 15, medic: 20 } as Record<string, number>,
  /** ต่อของใช้หนึ่งชิ้นในกระเป๋า */
  perItem: 5,
} as const;

/** ค่าพลังที่ของชิ้นหนึ่งเพิ่มให้ (ใช้แสดงในร้าน) kind = ชนิดของในร้าน */
export function itemPower(kind: string, value: string): number {
  if (kind === "weapon") return POWER.weapon[value as Weapon] ?? 0;
  if (kind === "armor") return (POWER.armor[value as Armor] ?? 0) + (value === "heavy" ? GEAR.heavy.hp * POWER.perHp : 0);
  if (kind === "chip") return POWER.chip[value as Chip] ?? 0;
  // ชุดเกราะผู้พิทักษ์เพิ่มพลังสูงสุด 1 (BATTLE.perks.guardianHp)
  if (kind === "outfit") return (POWER.outfit[value] ?? 0) + (value === "guardian" ? POWER.perHp : 0);
  if (kind === "module") return POWER.module[value] ?? 0;
  if (kind === "supply") return POWER.perItem;
  return 0;
}

export interface PowerInput {
  /** พลังสูงสุดของการ์เดียนในด่าน (รวมระดับความยาก ชิ้นส่วน เกราะ และเครื่องแบบแล้ว) */
  robotMax: number;
  gear: Gear;
  outfit: string;
  modules: readonly string[];
  /** จำนวนของใช้ในกระเป๋า */
  bag: number;
}

export function guardianPower({ robotMax, gear, outfit, modules, bag }: PowerInput): number {
  return (
    robotMax * POWER.perHp +
    POWER.weapon[gear.weapon] +
    POWER.armor[gear.armor] +
    POWER.chip[gear.chip] +
    (POWER.outfit[outfit] ?? 0) +
    modules.reduce((sum, module) => sum + (POWER.module[module] ?? 0), 0) +
    Math.min(BAG_SIZE, Math.max(0, bag)) * POWER.perItem
  );
}
