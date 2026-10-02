// คำแนะนำของพี่บิตก่อนออกปฏิบัติการ (docs/GDD.md ข้อ 17) ฟังก์ชันล้วน: ของใช้ที่ควรพก และอาวุธที่ได้เปรียบคู่ต่อสู้ของด่าน
// กระเป๋าพกได้ BAG_SIZE ชิ้นต่อการออกปฏิบัติการ (ชุดนักบินอวกาศ +1) ของที่เหลืออยู่ในกล่องเก็บไอเทม
import type { Trait } from "./battle.config";
import type { BattleSpec } from "./campaign";
import { BAG_SIZE, POWER, type Weapon, WEAPON, type WeaponClass, WEAPONS } from "./gear";
import { SUPPLIES, type Supply } from "./shop.config";

/** ของที่เหมาะกับลักษณะของคู่ต่อสู้ เรียงจากสำคัญที่สุด (เหตุผลของแต่ละลักษณะอยู่ใน ui.storage.reason) */
export const ADVICE: Record<Trait, readonly Supply[]> = {
  basic: ["repair-kit", "shield", "analyzer"],
  // โล่กันตาที่ชาร์จพลัง แบตเตอรี่เสริมคูณกับการสวนกลับ
  charge: ["shield", "overcharge", "repair-kit"],
  // ต้องปิดให้เร็วก่อนคู่ต่อสู้ฟื้นพลัง
  regen: ["overcharge", "analyzer", "repair-kit"],
  // ต้องรักษาการตอบถูกติดต่อกัน
  combo: ["analyzer", "overcharge", "repair-kit"],
  swarm: ["shield", "repair-kit", "analyzer"],
  // ด่านยาว ต้องอยู่ให้รอด
  boss: ["repair-kit", "reboot", "shield"],
  armor: ["analyzer", "overcharge", "shield"],
  enrage: ["reboot", "shield", "repair-kit"],
};

/** ลำดับของที่ควรพกสำหรับด่านนี้: สลับกันทีละร่าง ของที่สำคัญกับร่างใดร่างหนึ่งมาก่อน แล้วตามด้วยของที่เหลือ */
export function wishList(spec: BattleSpec): Supply[] {
  const wish: Supply[] = [];
  for (let rank = 0; rank < 3; rank++) for (const form of spec.forms) if (!wish.includes(ADVICE[form.trait][rank])) wish.push(ADVICE[form.trait][rank]);
  for (const supply of SUPPLIES) if (!wish.includes(supply)) wish.push(supply);
  return wish;
}

/** กระเป๋าที่พี่บิตแนะนำถ้ามีของทุกอย่าง (size = ขนาดกระเป๋า) */
export const idealBag = (spec: BattleSpec, size: number = BAG_SIZE): Supply[] => wishList(spec).slice(0, size);

/**
 * กระเป๋าที่พี่บิตแนะนำจากของที่มีในกล่อง: หยิบตามลำดับที่ควรพกอย่างละชิ้นก่อน
 * ถ้ายังไม่เต็มจึงหยิบของชนิดเดิมซ้ำ (ไม่เกินจำนวนที่มี แกนสำรองใช้ได้ครั้งเดียวต่อการออกปฏิบัติการจึงไม่หยิบซ้ำ)
 */
export function adviseBag(spec: BattleSpec, stock: Readonly<Record<Supply, number>>, size: number = BAG_SIZE): Supply[] {
  const wish = wishList(spec);
  const bag: Supply[] = wish.filter((supply) => stock[supply] > 0).slice(0, size);
  for (const supply of wish) {
    if (supply === "reboot") continue;
    while (bag.length < size && bag.filter((s) => s === supply).length < stock[supply]) bag.push(supply);
  }
  return bag;
}

/** ของที่พี่บิตอยากให้พกแต่ในกล่องยังไม่มี (ชวนไปซื้อที่ร้าน) */
export const missingAdvice = (spec: BattleSpec, stock: Readonly<Record<Supply, number>>): Supply[] => idealBag(spec).filter((supply) => stock[supply] <= 0);

// ---------------------------------------------------------------- อาวุธที่ได้เปรียบ

/** น้ำหนักของความได้เปรียบของอาวุธประเภทหนึ่งกับด่านนี้: ผลรวมพลังของร่างที่แพ้ทางอาวุธประเภทนั้น */
const advantageWeight = (spec: BattleSpec, kind: WeaponClass): number => spec.forms.filter((form) => form.weak === kind).reduce((sum, form) => sum + form.hp, 0);

export interface WeaponAdvice {
  /** จุดอ่อนของแต่ละร่าง ตามลำดับ */
  weak: WeaponClass[];
  /** อาวุธที่ใส่อยู่ได้เปรียบอย่างน้อยหนึ่งร่าง */
  advantaged: boolean;
  /**
   * อาวุธที่มีอยู่และควรเปลี่ยนไปใช้ (ไม่มี = null): ได้เปรียบมากกว่าอาวุธที่ใส่อยู่
   * หรือได้เปรียบเท่ากันแต่เป็นอาวุธที่แรงกว่า (ค่าพลังของอาวุธสูงกว่า เช่น ค้อนแทนหมัด) ซึ่ง stronger เป็นจริง
   */
  better: Weapon | null;
  stronger: boolean;
  /** อาวุธที่ได้เปรียบแต่ยังไม่มี (แนะนำให้ซื้อ) */
  wanted: Weapon[];
}

/** คำแนะนำเรื่องอาวุธสำหรับด่านนี้ จากอาวุธที่ใส่อยู่และอาวุธที่มี (หมัดมีเสมอ) */
export function adviseWeapon(spec: BattleSpec, current: Weapon, owned: readonly Weapon[]): WeaponAdvice {
  const have = WEAPONS.filter((weapon) => weapon === "fist" || owned.includes(weapon));
  const weight = (weapon: Weapon) => advantageWeight(spec, WEAPON[weapon].class);
  const mine = weight(current);
  const strength = (weapon: Weapon) => POWER.weapon[weapon];
  // ชิ้นที่ได้เปรียบที่สุด ถ้าเท่ากันเลือกชิ้นที่แรงกว่า อาวุธที่ไม่ได้เปรียบเลยไม่ถูกแนะนำ (ได้เปรียบเท่ากับศูนย์ทั้งคู่ = ไม่ต้องเปลี่ยน)
  const best = have.reduce<Weapon>((top, weapon) => (weight(weapon) > weight(top) || (weight(weapon) === weight(top) && strength(weapon) > strength(top)) ? weapon : top), current);
  const more = weight(best) > mine;
  const stronger = !more && mine > 0 && best !== current && strength(best) > strength(current);
  return {
    weak: spec.forms.map((form) => form.weak),
    advantaged: mine > 0,
    better: more || stronger ? best : null,
    stronger,
    wanted: WEAPONS.filter((weapon) => !have.includes(weapon) && weight(weapon) > mine),
  };
}
