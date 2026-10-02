// เครื่องยนต์ของด่านต่อสู้ไคจู (ฟังก์ชันล้วน, docs/GDD.md ข้อ 12)
// ผู้เล่นตอบโจทย์เลือกตอบจากเนื้อหาของหัวข้อ ตอบถูกหุ่นการ์เดียนโจมตี ตอบผิดคู่ต่อสู้โจมตี ไม่มีการจับเวลา
// ด่านหนึ่งมีได้หลายร่าง (บอสของระดับกลางและยาก) ต้องชนะทีละร่าง
import { BATTLE } from "./battle.config";
import { type BattleSpec, campaignOf, type Difficulty, type FormSpec } from "./campaign";
import type { Outfit, Supply } from "./shop.config";

/** ค่าที่ใช้ตลอดการออกปฏิบัติการหนึ่งครั้ง: ด่าน ระดับความยาก ชิ้นส่วนอัปเกรด และสิทธิพิเศษของเครื่องแบบ */
export interface BattleSetup {
  spec: BattleSpec;
  robotMax: number;
  /** จำนวนครั้งที่ขอข้อมูลจากพี่บิตได้ */
  hints: number;
  assistDamage: number;
  repairHeal: number;
  /** เริ่มพร้อมโล่ 1 ชั้น */
  startShield: boolean;
  formResetsOnRetry: boolean;
}

/** armorParts = จำนวนไคจูประจำห้องที่ชนะแล้ว (ชิ้นส่วนอัปเกรดการ์เดียน) */
export function battleSetup(difficulty: Difficulty | undefined, spec: BattleSpec, outfit: Outfit, armorParts: number): BattleSetup {
  const level = campaignOf(difficulty);
  return {
    spec,
    robotMax: level.robotHp + Math.min(BATTLE.armorMax, Math.max(0, armorParts)) * BATTLE.armorPerWin + (outfit === "guardian" ? BATTLE.perks.guardianHp : 0),
    hints: level.battleHints + (outfit === "researcher" ? BATTLE.perks.researcherHints : 0),
    assistDamage: outfit === "commander" ? BATTLE.perks.commanderAssist : BATTLE.assistDamage,
    repairHeal: BATTLE.repairKitHeal + (outfit === "engineer" ? BATTLE.perks.engineerHeal : 0),
    startShield: outfit === "pilot",
    formResetsOnRetry: level.formResetsOnRetry,
  };
}

export interface BattleState {
  robotHp: number;
  /** ร่างปัจจุบันของคู่ต่อสู้ (เริ่มที่ 0) และพลังของร่างนั้น */
  form: number;
  kaijuHp: number;
  /** จำนวนข้อที่ตอบถูกติดต่อกัน */
  streak: number;
  /** จำนวนข้อที่ตอบไปแล้วในการออกปฏิบัติการครั้งนี้ */
  turn: number;
  correct: number;
  /** โล่พลังงานที่เปิดไว้ กันการโจมตีครั้งถัดไป */
  shield: boolean;
  /** เกราะของคู่ต่อสู้ลักษณะ armor ยังอยู่ */
  armored: boolean;
  /** แบตเตอรี่เสริม: การโจมตีครั้งถัดไปแรง 2 เท่า */
  boost: boolean;
  /** แกนสำรองพร้อมใช้: พลังหมดแล้วฟื้นหนึ่งครั้ง */
  reboot: boolean;
  status: "fighting" | "won" | "lost";
}

export type BattleEvent =
  | { type: "robot-hit"; damage: number; counter: boolean; boosted: boolean }
  | { type: "armor-break" }
  | { type: "bit-assist"; damage: number }
  | { type: "kaiju-hit"; damage: number; blocked: boolean; heavy: boolean }
  | { type: "kaiju-regen"; amount: number }
  | { type: "phase"; phase: number; heal: number }
  | { type: "transform"; form: number; heal: number }
  | { type: "repair"; amount: number }
  | { type: "shield" }
  | { type: "boost" }
  | { type: "reboot"; amount: number };

export const formOf = (setup: BattleSetup, state: Pick<BattleState, "form">): FormSpec => setup.spec.forms[Math.min(state.form, setup.spec.forms.length - 1)];

/**
 * เริ่มออกปฏิบัติการ carry = ร่างและพลังของคู่ต่อสู้ที่เหลือจากครั้งก่อน (ถอยกลับมาซ่อมแล้วออกใหม่)
 * reboot = ผู้เล่นมีแกนสำรองติดตัว
 */
export function startBattle(setup: BattleSetup, options: { carry?: { form: number; kaijuHp: number }; reboot?: boolean } = {}): BattleState {
  const form = Math.min(setup.spec.forms.length - 1, Math.max(0, options.carry?.form ?? 0));
  const full = setup.spec.forms[form].hp;
  const kaijuHp = options.carry ? Math.min(full, Math.max(1, options.carry.kaijuHp)) : full;
  return { robotHp: setup.robotMax, form, kaijuHp, streak: 0, turn: 0, correct: 0, shield: setup.startShield, armored: setup.spec.forms[form].trait === "armor", boost: false, reboot: options.reboot ?? false, status: "fighting" };
}

/** สิ่งที่ต้องส่งให้ startBattle เมื่อออกปฏิบัติการใหม่หลังแพ้ */
export const retryCarry = (setup: BattleSetup, state: BattleState): { form: number; kaijuHp: number } => ({ form: state.form, kaijuHp: setup.formResetsOnRetry ? formOf(setup, state).hp : state.kaijuHp });

/** คู่ต่อสู้กำลังชาร์จพลังสำหรับโจทย์ข้อถัดไปหรือไม่ */
export const isCharging = (setup: BattleSetup, state: BattleState): boolean => formOf(setup, state).trait === "charge" && (state.turn + 1) % BATTLE.charge.every === 0;

/** คู่ต่อสู้ลักษณะ enrage กำลังคลั่งหรือไม่ */
export const isEnraged = (setup: BattleSetup, state: BattleState): boolean => formOf(setup, state).trait === "enrage" && state.kaijuHp <= Math.ceil(formOf(setup, state).hp / 2);

/** จำนวนเฟสของร่างปัจจุบัน (เฉพาะลักษณะ boss ลักษณะอื่นมีเฟสเดียว) */
export const phaseCount = (setup: BattleSetup, state: Pick<BattleState, "form">): number => (formOf(setup, state).trait === "boss" ? Math.ceil(formOf(setup, state).hp / BATTLE.boss.phaseHp) : 1);

/** เฟสปัจจุบัน เริ่มที่ 0 */
export function phaseOf(setup: BattleSetup, state: Pick<BattleState, "form" | "kaijuHp">): number {
  const form = formOf(setup, state);
  return form.trait === "boss" ? Math.min(phaseCount(setup, state) - 1, Math.floor((form.hp - state.kaijuHp) / BATTLE.boss.phaseHp)) : 0;
}

/** หัวข้อที่ใช้โจทย์ในตานี้: ลักษณะ boss ไล่หัวข้อตามเฟส ด่านอื่นวนหัวข้อของด่านตามตา */
export function questionSource(setup: BattleSetup, state: Pick<BattleState, "form" | "kaijuHp" | "turn">): number {
  const { sources } = setup.spec;
  if (formOf(setup, state).trait === "boss") return sources[Math.min(sources.length - 1, phaseOf(setup, state))];
  return sources[(state.turn + state.form) % sources.length];
}

/** ผลของการตอบหนึ่งข้อ */
export function resolveAnswer(setup: BattleSetup, state: BattleState, correct: boolean): { state: BattleState; events: BattleEvent[] } {
  if (state.status !== "fighting") return { state, events: [] };
  const events: BattleEvent[] = [];
  const form = formOf(setup, state);
  const charging = isCharging(setup, state);
  let { robotHp, kaijuHp, shield, armored, boost, reboot, streak } = state;
  let formIndex = state.form;

  if (correct) {
    streak += 1;
    const phaseBefore = phaseOf(setup, state);
    if (form.trait === "armor" && armored) {
      armored = false;
      events.push({ type: "armor-break" });
    } else {
      const base = charging ? BATTLE.charge.counterDamage : form.trait === "combo" ? Math.min(BATTLE.comboMax, streak) : BATTLE.hit;
      const damage = boost ? base * 2 : base;
      kaijuHp -= damage;
      events.push({ type: "robot-hit", damage, counter: charging, boosted: boost });
      boost = false;
    }
    if (kaijuHp > 0 && streak % BATTLE.assistStreak === 0) {
      kaijuHp -= setup.assistDamage;
      events.push({ type: "bit-assist", damage: setup.assistDamage });
    }
    kaijuHp = Math.max(0, kaijuHp);
    const phase = phaseOf(setup, { form: formIndex, kaijuHp });
    if (kaijuHp > 0 && phase > phaseBefore) {
      const heal = Math.min(BATTLE.boss.phaseHeal, setup.robotMax - robotHp);
      robotHp += heal;
      events.push({ type: "phase", phase, heal });
    }
    if (kaijuHp <= 0 && formIndex < setup.spec.forms.length - 1) {
      // ชนะร่างนี้แล้ว คู่ต่อสู้กลายร่าง หุ่นได้พักฟื้นเล็กน้อย
      formIndex += 1;
      const next = setup.spec.forms[formIndex];
      kaijuHp = next.hp;
      armored = next.trait === "armor";
      const heal = Math.min(BATTLE.transformHeal, setup.robotMax - robotHp);
      robotHp += heal;
      events.push({ type: "transform", form: formIndex, heal });
    }
  } else {
    streak = 0;
    const heavy = charging || (form.trait === "swarm" && kaijuHp >= BATTLE.swarmHeavyFrom) || isEnraged(setup, state);
    const damage = heavy ? BATTLE.heavyDamage : BATTLE.wrongDamage;
    if (shield) {
      shield = false;
      events.push({ type: "kaiju-hit", damage: 0, blocked: true, heavy });
    } else {
      robotHp = Math.max(0, robotHp - damage);
      events.push({ type: "kaiju-hit", damage, blocked: false, heavy });
    }
    if (form.trait === "regen" && kaijuHp < form.hp) {
      const amount = Math.min(BATTLE.regen, form.hp - kaijuHp);
      kaijuHp += amount;
      events.push({ type: "kaiju-regen", amount });
    }
    if (form.trait === "armor") armored = true;
    if (robotHp <= 0 && reboot) {
      reboot = false;
      robotHp = Math.min(setup.robotMax, BATTLE.rebootHeal);
      events.push({ type: "reboot", amount: robotHp });
    }
  }

  const status = kaijuHp <= 0 ? "won" : robotHp <= 0 ? "lost" : "fighting";
  return { state: { robotHp, form: formIndex, kaijuHp, streak, turn: state.turn + 1, correct: state.correct + (correct ? 1 : 0), shield, armored, boost, reboot, status }, events };
}

/** ของที่ผู้เล่นกดใช้เองระหว่างสู้ (แกนสำรองทำงานเอง และชิปวิเคราะห์ทำงานกับโจทย์ จึงไม่ผ่านฟังก์ชันนี้) */
export type ActiveSupply = Extract<Supply, "repair-kit" | "shield" | "overcharge">;

/** ใช้ของจากร้านระหว่างสู้ คืน null ถ้าใช้ตอนนี้ไม่ได้ (พลังเต็มอยู่แล้ว หรือเปิดใช้อยู่แล้ว) */
export function applySupply(setup: BattleSetup, state: BattleState, supply: ActiveSupply): { state: BattleState; events: BattleEvent[] } | null {
  if (state.status !== "fighting") return null;
  if (supply === "repair-kit") {
    const amount = Math.min(setup.repairHeal, setup.robotMax - state.robotHp);
    return amount > 0 ? { state: { ...state, robotHp: state.robotHp + amount }, events: [{ type: "repair", amount }] } : null;
  }
  if (supply === "shield") return state.shield ? null : { state: { ...state, shield: true }, events: [{ type: "shield" }] };
  return state.boost ? null : { state: { ...state, boost: true }, events: [{ type: "boost" }] };
}
