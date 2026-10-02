// เครื่องยนต์ของด่านต่อสู้ไคจู (ฟังก์ชันล้วน, docs/GDD.md ข้อ 12)
// ผู้เล่นตอบโจทย์เลือกตอบจากเนื้อหาของห้อง ตอบถูกหุ่นการ์เดียนโจมตี ตอบผิดไคจูโจมตี ไม่มีการจับเวลา
import { BATTLE, type KaijuSpec } from "./battle.config";
import type { Supply } from "./shop.config";

export interface BattleState {
  robotHp: number;
  kaijuHp: number;
  /** จำนวนข้อที่ตอบถูกติดต่อกัน */
  streak: number;
  /** จำนวนข้อที่ตอบไปแล้วในการออกปฏิบัติการครั้งนี้ */
  turn: number;
  correct: number;
  /** โล่พลังงานที่เปิดไว้ กันการโจมตีครั้งถัดไป */
  shield: boolean;
  status: "fighting" | "won" | "lost";
}

export type BattleEvent =
  | { type: "robot-hit"; damage: number; counter: boolean }
  | { type: "bit-assist"; damage: number }
  | { type: "kaiju-hit"; damage: number; blocked: boolean; heavy: boolean }
  | { type: "kaiju-regen"; amount: number }
  | { type: "phase"; phase: number; heal: number }
  | { type: "repair"; amount: number }
  | { type: "shield" };

export const kaijuOf = (room: number): KaijuSpec => BATTLE.kaiju.find((kaiju) => kaiju.room === room) ?? BATTLE.kaiju[0];

/** เริ่มออกปฏิบัติการ kaijuHp = พลังที่เหลือจากครั้งก่อน (ถอยกลับมาซ่อมแล้วออกใหม่ ไคจูไม่ฟื้น) */
export function startBattle(spec: KaijuSpec, kaijuHp: number = spec.hp): BattleState {
  return { robotHp: BATTLE.robotHp, kaijuHp: Math.min(spec.hp, Math.max(1, kaijuHp)), streak: 0, turn: 0, correct: 0, shield: false, status: "fighting" };
}

/** ไคจูกำลังชาร์จพลังสำหรับโจทย์ข้อถัดไปหรือไม่ */
export const isCharging = (spec: KaijuSpec, state: BattleState): boolean => spec.trait === "charge" && (state.turn + 1) % BATTLE.charge.every === 0;

/** จำนวนเฟสของด่าน (ด่านปกติมีเฟสเดียว) */
export const phaseCount = (spec: KaijuSpec): number => (spec.trait === "boss" ? Math.ceil(spec.hp / BATTLE.boss.phaseHp) : 1);

/** เฟสปัจจุบัน เริ่มที่ 0 */
export const phaseOf = (spec: KaijuSpec, state: Pick<BattleState, "kaijuHp">): number =>
  spec.trait === "boss" ? Math.min(phaseCount(spec) - 1, Math.floor((spec.hp - state.kaijuHp) / BATTLE.boss.phaseHp)) : 0;

/** ห้องที่ใช้โจทย์ในตานี้: ด่านปกติใช้ห้องของตัวเอง ด่านสุดท้ายไล่ห้อง 1, 2, 3, ... ตามเฟส */
export const questionRoom = (spec: KaijuSpec, state: Pick<BattleState, "kaijuHp">): number => (spec.trait === "boss" ? phaseOf(spec, state) + 1 : spec.room);

/** ผลของการตอบหนึ่งข้อ */
export function resolveAnswer(spec: KaijuSpec, state: BattleState, correct: boolean): { state: BattleState; events: BattleEvent[] } {
  if (state.status !== "fighting") return { state, events: [] };
  const events: BattleEvent[] = [];
  const charging = isCharging(spec, state);
  let { robotHp, kaijuHp, shield } = state;
  let streak = state.streak;

  if (correct) {
    streak += 1;
    const phaseBefore = phaseOf(spec, state);
    const damage = charging ? BATTLE.charge.counterDamage : spec.trait === "combo" ? Math.min(BATTLE.comboMax, streak) : BATTLE.hit;
    kaijuHp -= damage;
    events.push({ type: "robot-hit", damage, counter: charging });
    if (kaijuHp > 0 && streak % BATTLE.assistStreak === 0) {
      kaijuHp -= BATTLE.assistDamage;
      events.push({ type: "bit-assist", damage: BATTLE.assistDamage });
    }
    kaijuHp = Math.max(0, kaijuHp);
    const phase = phaseOf(spec, { kaijuHp });
    if (kaijuHp > 0 && phase > phaseBefore) {
      const heal = Math.min(BATTLE.boss.phaseHeal, BATTLE.robotHp - robotHp);
      robotHp += heal;
      events.push({ type: "phase", phase, heal });
    }
  } else {
    streak = 0;
    const heavy = charging || (spec.trait === "swarm" && kaijuHp >= BATTLE.swarm.heavyFrom);
    const damage = charging ? BATTLE.charge.damage : heavy ? BATTLE.swarm.heavyDamage : BATTLE.wrongDamage;
    if (shield) {
      shield = false;
      events.push({ type: "kaiju-hit", damage: 0, blocked: true, heavy });
    } else {
      robotHp = Math.max(0, robotHp - damage);
      events.push({ type: "kaiju-hit", damage, blocked: false, heavy });
    }
    if (spec.trait === "regen" && kaijuHp < spec.hp) {
      const amount = Math.min(BATTLE.regen, spec.hp - kaijuHp);
      kaijuHp += amount;
      events.push({ type: "kaiju-regen", amount });
    }
  }

  const status = kaijuHp <= 0 ? "won" : robotHp <= 0 ? "lost" : "fighting";
  return { state: { robotHp, kaijuHp, streak, turn: state.turn + 1, correct: state.correct + (correct ? 1 : 0), shield, status }, events };
}

/** ใช้ของจากร้านระหว่างสู้ คืน null ถ้าใช้ตอนนี้ไม่ได้ (พลังเต็มอยู่แล้ว หรือเปิดโล่อยู่แล้ว) */
export function applySupply(state: BattleState, supply: Supply): { state: BattleState; events: BattleEvent[] } | null {
  if (state.status !== "fighting") return null;
  if (supply === "repair-kit") {
    const amount = Math.min(BATTLE.repairKitHeal, BATTLE.robotHp - state.robotHp);
    return amount > 0 ? { state: { ...state, robotHp: state.robotHp + amount }, events: [{ type: "repair", amount }] } : null;
  }
  return state.shield ? null : { state: { ...state, shield: true }, events: [{ type: "shield" }] };
}
