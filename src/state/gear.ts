// อุปกรณ์ของการ์เดียน ค่าพลังรวม และกระเป๋าของใช้ (docs/GDD.md ข้อ 13 และ 17)
// แกน AI คือแหล่งพลังงานที่ทำให้การ์เดียนออกรบได้ ส่วนความเก่งมาจากอุปกรณ์ 3 ช่อง: อาวุธ เกราะ และชิป
// ไฟล์นี้เป็นข้อมูลและฟังก์ชันล้วน ไม่ import อะไร ผลของอุปกรณ์ในการต่อสู้คำนวณใน battle.ts

export const WEAPONS = ["fist", "sword", "blaster", "hammer", "lance", "cannon"] as const;
export type Weapon = (typeof WEAPONS)[number];
export const ARMORS = ["plate", "heavy", "spike", "guard", "titan"] as const;
export type Armor = (typeof ARMORS)[number];
export const CHIPS = ["none", "charger", "focus", "retry", "regen"] as const;
export type Chip = (typeof CHIPS)[number];

/**
 * ประเภทของอาวุธ: คู่ต่อสู้แต่ละร่างแพ้ทางอาวุธประเภทหนึ่ง (FormSpec.weak) และทนทานต่ออีกประเภทหนึ่ง (resistOf)
 * ชนะทางกันเป็นวง: ร่างที่แพ้ทางแรงกระแทกทนคมอาวุธ แพ้ทางคมอาวุธทนลำแสง แพ้ทางลำแสงทนแรงกระแทก
 */
export const WEAPON_CLASSES = ["strike", "blade", "beam"] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];

/** ประเภทของอาวุธที่คู่ต่อสู้ร่างนี้ทนทาน (อาวุธประเภทนี้เสียเปรียบ) */
export const resistOf = (weak: WeaponClass): WeaponClass => WEAPON_CLASSES[(WEAPON_CLASSES.indexOf(weak) + 1) % WEAPON_CLASSES.length];

/** ความเข้ากันของอาวุธกับคู่ต่อสู้ร่างหนึ่ง: strong = ชนะทาง, even = พอใช้ได้, weak = แพ้ทาง */
export type Matchup = "strong" | "even" | "weak";
export const matchupOf = (weapon: Weapon, weak: WeaponClass): Matchup => (WEAPON[weapon].class === weak ? "strong" : WEAPON[weapon].class === resistOf(weak) ? "weak" : "even");

export interface Gear {
  weapon: Weapon;
  armor: Armor;
  chip: Chip;
}

/** อุปกรณ์เริ่มต้นที่ทุกคนมี: หมัดเปล่า เกราะมาตรฐาน ไม่มีชิป */
export const DEFAULT_GEAR: Gear = { weapon: "fist", armor: "plate", chip: "none" };

export interface WeaponSpec {
  class: WeaponClass;
  /** ตอบถูกติดต่อกันครบจำนวนนี้ทุกครั้ง การโจมตีครั้งนั้นเป็นคริติคอล (แรงคูณ GEAR.critMultiplier) */
  critEvery?: number;
  /** ตอบถูกติดต่อกันครบจำนวนนี้ทุกครั้ง คู่ต่อสู้ติดสตัน (ตอบผิดครั้งถัดไป คู่ต่อสู้ไม่ได้ทำอะไร) */
  stunEvery?: number;
  /** ตอบถูกติดต่อกันครบจำนวนนี้ทุกครั้ง การโจมตีครั้งนั้นแรงขึ้น GEAR.quakeDamage (ค้อนทุบสะเทือน) */
  quakeEvery?: number;
  /** ทุบทะลุเกราะ: เกราะของคู่ต่อสู้แตกและโจมตีเข้าในการตอบถูกครั้งเดียว */
  pierce?: boolean;
}

/**
 * อาวุธ 6 แบบ ประเภทละ 2 แบบ: แบบพื้นฐานของแมพ 1 และแบบที่เก่งกว่าของแมพถัดไป (ความสามารถเดิมแต่ทำงานถี่ขึ้น)
 * ผลทุกอย่างตายตัว เกิดจากการตอบถูกติดต่อกัน ไม่มีการสุ่ม
 */
export const WEAPON: Record<Weapon, WeaponSpec> = {
  fist: { class: "strike" },
  hammer: { class: "strike", quakeEvery: 3, pierce: true },
  sword: { class: "blade", critEvery: 3 },
  lance: { class: "blade", critEvery: 2 },
  blaster: { class: "beam", stunEvery: 3 },
  cannon: { class: "beam", stunEvery: 2 },
};

export const GEAR = {
  /**
   * อาวุธที่ได้เปรียบ (ประเภทตรงกับจุดอ่อนของคู่ต่อสู้ร่างนั้น): การโจมตีแรงขึ้นเท่านี้ เมื่อตอบถูกติดต่อกันตั้งแต่ advantageFromStreak ข้อ
   * (ได้เปรียบแล้วต้องตอบให้ต่อเนื่องจึงได้ผล ความรู้ยังเป็นตัวตัดสิน)
   */
  advantage: 1,
  advantageFromStreak: 2,
  /** ชนะทาง: การโจมตีหนักของคู่ต่อสู้เบาลงเท่านี้ (อึดขึ้น) แพ้ทาง: แรงขึ้นเท่านี้ (อ่อนแอลง) และความสามารถพิเศษของอาวุธไม่ทำงาน */
  strongGuard: 1,
  weakExposure: 1,
  critMultiplier: 2,
  quakeDamage: 2,
  /** เกราะหนักและเกราะไททัน: พลังสูงสุดเพิ่ม */
  heavy: { hp: 2 },
  titan: { hp: 4 },
  /** เกราะหนาม: พลังสูงสุดเพิ่ม และเมื่อโดนโจมตีหนัก คู่ต่อสู้เสียพลังเท่านี้ (ไม่ทำให้คู่ต่อสู้หมดพลัง: ปิดฉากต้องมาจากการตอบถูก) */
  spike: { hp: 1, reflect: 1 },
  /** เกราะสะท้อน: กันการโจมตีครั้งแรกของคู่ต่อสู้แต่ละร่าง (ไม่ต้องกดใช้) */
  guard: { blocksPerForm: 1 },
  /** ชิปคิดทบทวน: ตอบผิดแล้วได้ตอบข้อเดิมอีกครั้ง จำนวนครั้งต่อการออกปฏิบัติการ */
  retry: { chances: 1 },
  /** ชิปล็อกเป้า: อาวุธที่ชนะทางตีแรงขึ้นตั้งแต่ข้อที่ตอบถูกข้อแรก (ปกติต้องถูกติดกัน advantageFromStreak ข้อ) */
  focus: { advantageFromStreak: 1 },
  /** ชิปซ่อมตัวเอง: ตอบถูกติดกันครบจำนวนนี้ทุกครั้ง การ์เดียนฟื้นพลัง */
  regen: { every: 3, heal: 1 },
  /** ชิปเร่งพลัง: การโจมตีครั้งแรกใส่คู่ต่อสู้แต่ละร่างแรง 2 เท่า (เหมือนแบตเตอรี่เสริมที่ไม่ต้องพก) */
  charger: { openingBoost: true },
} as const;

/** พลังสูงสุดที่เกราะเพิ่มให้ */
export const armorHp = (armor: Armor): number => (armor === "heavy" ? GEAR.heavy.hp : armor === "titan" ? GEAR.titan.hp : armor === "spike" ? GEAR.spike.hp : 0);

/** จำนวนของใช้ที่พกเข้าด่านต่อสู้ได้ต่อการออกปฏิบัติการ ที่เหลืออยู่ในกล่องเก็บไอเทม (ชุดนักบินอวกาศพกได้เพิ่ม 1 ชิ้น: bagSizeOf) */
export const BAG_SIZE = 3;
export const ASTRONAUT_BAG_BONUS = 1;
export const bagSizeOf = (outfit: string): number => BAG_SIZE + (outfit === "astronaut" ? ASTRONAUT_BAG_BONUS : 0);

/**
 * ค่าพลังรวมของการ์เดียน: ตัวเลขประมาณความพร้อม ใช้เทียบกับพลังที่แนะนำของด่าน (BattleSpec.power)
 * เป็นคำแนะนำเท่านั้น พลังไม่ถึงก็ออกปฏิบัติการได้ถ้ามีแกน AI ที่ด่านต้องใช้
 */
export const POWER = {
  perHp: 10,
  weapon: { fist: 0, sword: 30, blaster: 30, hammer: 40, lance: 45, cannon: 45 } as Record<Weapon, number>,
  /** เกราะหนักและเกราะไททันนับจากพลังสูงสุดที่เพิ่มแล้ว */
  armor: { plate: 0, heavy: 0, spike: 15, guard: 30, titan: 0 } as Record<Armor, number>,
  chip: { none: 0, charger: 20, focus: 20, retry: 30, regen: 30 } as Record<Chip, number>,
  /** สิทธิพิเศษของเครื่องแบบ (ชุดที่เพิ่มพลังสูงสุดนับจากพลังสูงสุดที่เพิ่มแล้ว) */
  outfit: { lab: 0, engineer: 5, pilot: 10, researcher: 10, guardian: 0, commander: 15, astronaut: 5, ninja: 15, hero: 0 } as Record<string, number>,
  module: { scanner: 10, toolkit: 10, laser: 15, decoy: 15, medic: 20 } as Record<string, number>,
  /** ต่อของใช้หนึ่งชิ้นในกระเป๋า */
  perItem: 5,
  /** อาวุธที่ใส่อยู่ชนะทางคู่ต่อสู้ของด่าน (นับตามสัดส่วนของร่างที่ชนะทาง) แพ้ทางหักเท่ากัน */
  advantage: 20,
} as const;

/** พลังสูงสุดที่เครื่องแบบเพิ่มให้ (ตรงกับ BATTLE.perks) */
const OUTFIT_HP: Record<string, number> = { guardian: 1, hero: 2 };

/** ค่าพลังที่ของชิ้นหนึ่งเพิ่มให้ (ใช้แสดงในร้าน) kind = ชนิดของในร้าน */
export function itemPower(kind: string, value: string): number {
  if (kind === "weapon") return POWER.weapon[value as Weapon] ?? 0;
  if (kind === "armor") return (POWER.armor[value as Armor] ?? 0) + armorHp(value as Armor) * POWER.perHp;
  if (kind === "chip") return POWER.chip[value as Chip] ?? 0;
  if (kind === "outfit") return (POWER.outfit[value] ?? 0) + (OUTFIT_HP[value] ?? 0) * POWER.perHp;
  if (kind === "module") return POWER.module[value] ?? 0;
  if (kind === "supply") return POWER.perItem;
  return 0;
}

export interface PowerInput {
  /** พลังสูงสุดของการ์เดียนในด่าน (รวมแมพ เกราะ และเครื่องแบบแล้ว) */
  robotMax: number;
  gear: Gear;
  outfit: string;
  modules: readonly string[];
  /** จำนวนของใช้ในกระเป๋า */
  bag: number;
  /** สัดส่วนของร่างที่อาวุธนี้ชนะทาง ลบสัดส่วนของร่างที่แพ้ทาง (−1 ถึง 1) ไม่ระบุ = ไม่นับ */
  advantage?: number;
}

export function guardianPower({ robotMax, gear, outfit, modules, bag, advantage = 0 }: PowerInput): number {
  return Math.round(
    robotMax * POWER.perHp +
      POWER.weapon[gear.weapon] +
      POWER.armor[gear.armor] +
      POWER.chip[gear.chip] +
      (POWER.outfit[outfit] ?? 0) +
      modules.reduce((sum, module) => sum + (POWER.module[module] ?? 0), 0) +
      Math.min(bagSizeOf(outfit), Math.max(0, bag)) * POWER.perItem +
      Math.max(-1, Math.min(1, advantage)) * POWER.advantage,
  );
}
