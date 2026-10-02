// คำแนะนำของพี่บิตเรื่องของใช้ที่ควรพกเข้าด่าน (docs/GDD.md ข้อ 17) ฟังก์ชันล้วน
// กระเป๋าพกได้ BAG_SIZE ชิ้นต่อการออกปฏิบัติการ ของที่เหลืออยู่ในกล่องเก็บไอเทม
import type { Trait } from "./battle.config";
import type { BattleSpec } from "./campaign";
import { BAG_SIZE } from "./gear";
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

/** กระเป๋าที่พี่บิตแนะนำถ้ามีของทุกอย่าง */
export const idealBag = (spec: BattleSpec): Supply[] => wishList(spec).slice(0, BAG_SIZE);

/**
 * กระเป๋าที่พี่บิตแนะนำจากของที่มีในกล่อง: หยิบตามลำดับที่ควรพกอย่างละชิ้นก่อน
 * ถ้ายังไม่เต็มจึงหยิบของชนิดเดิมซ้ำ (ไม่เกินจำนวนที่มี แกนสำรองใช้ได้ครั้งเดียวต่อการออกปฏิบัติการจึงไม่หยิบซ้ำ)
 */
export function adviseBag(spec: BattleSpec, stock: Readonly<Record<Supply, number>>): Supply[] {
  const wish = wishList(spec);
  const bag: Supply[] = wish.filter((supply) => stock[supply] > 0).slice(0, BAG_SIZE);
  for (const supply of wish) {
    if (supply === "reboot") continue;
    while (bag.length < BAG_SIZE && bag.filter((s) => s === supply).length < stock[supply]) bag.push(supply);
  }
  return bag;
}

/** ของที่พี่บิตอยากให้พกแต่ในกล่องยังไม่มี (ชวนไปซื้อที่ร้าน) */
export const missingAdvice = (spec: BattleSpec, stock: Readonly<Record<Supply, number>>): Supply[] => idealBag(spec).filter((supply) => stock[supply] <= 0);
