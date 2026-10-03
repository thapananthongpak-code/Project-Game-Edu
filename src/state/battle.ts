// เครื่องยนต์ของด่านต่อสู้ไคจู (ฟังก์ชันล้วน, docs/GDD.md ข้อ 12)
// ผู้เล่นตอบโจทย์เลือกตอบจากเนื้อหาของหัวข้อ ตอบถูกหุ่นการ์เดียนโจมตี ตอบผิดคู่ต่อสู้โจมตี ไม่มีการจับเวลา
// ด่านหนึ่งมีได้หลายร่าง (บอสของระดับกลางและยาก) ต้องชนะทีละร่าง
import { BATTLE } from "./battle.config";
import { type BattleSpec, campaignOf, type Difficulty, type FormSpec } from "./campaign";
import { armorHp, DEFAULT_GEAR, type Gear, GEAR, type Matchup, matchupOf, WEAPON } from "./gear";
import type { BitModule, Outfit, Supply } from "./shop.config";

/** ค่าที่ใช้ตลอดการออกปฏิบัติการหนึ่งครั้ง: ด่าน ระดับความยาก อุปกรณ์ของการ์เดียน และสิทธิพิเศษของเครื่องแบบ */
export interface BattleSetup {
  spec: BattleSpec;
  robotMax: number;
  /** จำนวนครั้งที่ขอข้อมูลจากพี่บิตได้ */
  hints: number;
  assistDamage: number;
  /** พลังที่การ์เดียนฟื้นทุกครั้งที่พี่บิตยิงเสริม (โมดูลพยาบาล) */
  assistHeal: number;
  repairHeal: number;
  /** เริ่มพร้อมโล่ 1 ชั้น */
  startShield: boolean;
  formResetsOnRetry: boolean;
  /** อุปกรณ์ที่ใส่อยู่: อาวุธกำหนดท่าโจมตี เกราะและชิปกำหนดค่าด้านล่าง */
  gear: Gear;
  /** เกราะสะท้อน: จำนวนการโจมตีที่กันให้เองต่อคู่ต่อสู้หนึ่งร่าง */
  guards: number;
  /** ชิปคิดทบทวน: จำนวนครั้งที่ตอบผิดแล้วได้ตอบข้อเดิมใหม่ ต่อการออกปฏิบัติการ */
  retries: number;
  /** ชุดไซเบอร์นินจา: จำนวนการโจมตีที่หลบได้เองต่อการออกปฏิบัติการ */
  dodges: number;
}

/** พลังสูงสุดของการ์เดียน: ค่าเริ่มต้นของแมพ บวกเกราะ (หนัก ไททัน) และเครื่องแบบ (ชุดเกราะผู้พิทักษ์ ชุดฮีโร่การ์เดียน) */
export const robotMaxOf = (difficulty: Difficulty | undefined, outfit: Outfit, gear: Gear, coreBonus = 0): number =>
  campaignOf(difficulty).robotHp + armorHp(gear.armor) + (outfit === "guardian" ? BATTLE.perks.guardianHp : outfit === "hero" ? BATTLE.perks.heroHp : 0) + coreBonus;

/**
 * modules = โมดูลอัปเกรดของพี่บิตที่ซื้อแล้ว gear = อุปกรณ์ของการ์เดียนที่ใส่อยู่
 * coreBonus = พลังสูงสุดที่เพิ่มจากแกน AI ที่ชาร์จแล้วในแมพนี้ (แมพ 2: coreBoostOf ใน gameStore.ts)
 */
export function battleSetup(difficulty: Difficulty | undefined, spec: BattleSpec, outfit: Outfit, modules: readonly BitModule[] = [], gear: Gear = DEFAULT_GEAR, coreBonus = 0): BattleSetup {
  const level = campaignOf(difficulty);
  const has = (module: BitModule) => modules.includes(module);
  return {
    spec,
    robotMax: robotMaxOf(difficulty, outfit, gear, coreBonus),
    hints: level.battleHints + (outfit === "researcher" ? BATTLE.perks.researcherHints : 0) + (has("scanner") ? BATTLE.modules.scannerHints : 0),
    assistDamage: (outfit === "commander" ? BATTLE.perks.commanderAssist : BATTLE.assistDamage) + (has("laser") ? BATTLE.modules.laserAssist : 0),
    assistHeal: has("medic") ? BATTLE.modules.medicHeal : 0,
    repairHeal: BATTLE.repairKitHeal + (outfit === "engineer" ? BATTLE.perks.engineerHeal : 0),
    startShield: outfit === "pilot",
    formResetsOnRetry: level.formResetsOnRetry,
    gear,
    guards: gear.armor === "guard" ? GEAR.guard.blocksPerForm : 0,
    retries: gear.chip === "retry" ? GEAR.retry.chances : 0,
    dodges: outfit === "ninja" ? BATTLE.perks.ninjaDodges : 0,
  };
}

export interface BattleState {
  robotHp: number;
  /** ร่างปัจจุบันของคู่ต่อสู้ (เริ่มที่ 0) และพลังของร่างนั้น */
  form: number;
  kaijuHp: number;
  /** จำนวนข้อที่ตอบถูกติดต่อกัน */
  streak: number;
  /** จำนวนข้อที่ตอบไปแล้วในการออกปฏิบัติการครั้งนี้ (ตาที่ได้ตอบใหม่ไม่นับซ้ำ) */
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
  /** คู่ต่อสู้ติดสตัน (ปืนเลเซอร์): ตอบผิดครั้งถัดไป คู่ต่อสู้ไม่ได้ทำอะไร */
  stunned: boolean;
  /** เกราะสะท้อนที่ยังกันได้กับร่างปัจจุบัน */
  guard: number;
  /** สิทธิ์ตอบใหม่ที่เหลือ (ชิปคิดทบทวน) */
  retries: number;
  /** การหลบที่เหลือ (ชุดไซเบอร์นินจา) */
  dodge: number;
  /** ชิปเร่งพลังพร้อมใช้: การโจมตีครั้งแรกใส่ร่างปัจจุบันแรง 2 เท่า */
  opening: boolean;
  status: "fighting" | "won" | "lost";
}

export type BattleEvent =
  /** crit = คริติคอลของดาบและหอก, quake = ค้อนทุบสะเทือน, advantage = อาวุธได้เปรียบร่างนี้, opening = ชิปเร่งพลัง, final = การโจมตีที่ปิดฉากร่างสุดท้าย */
  | { type: "robot-hit"; damage: number; counter: boolean; boosted: boolean; crit: boolean; quake: boolean; advantage: boolean; opening: boolean; final: boolean; wasted?: number }
  /** pierced = ค้อนทุบทะลุเกราะ: เกราะแตกและโจมตีเข้าในการตอบถูกครั้งเดียวกัน */
  | { type: "armor-break"; pierced?: true }
  | { type: "stun" }
  | { type: "bit-assist"; damage: number; wasted?: number }
  | { type: "bit-heal"; amount: number }
  /** by = สิ่งที่กันการโจมตีไว้ (เมื่อ blocked) */
  | { type: "kaiju-hit"; damage: number; blocked: boolean; heavy: boolean; by?: "guard" | "shield" | "dodge" }
  | { type: "kaiju-stunned" }
  | { type: "second-chance"; left: number }
  | { type: "kaiju-regen"; amount: number }
  | { type: "kaiju-rearm" }
  | { type: "phase"; phase: number; heal: number }
  | { type: "transform"; form: number; heal: number }
  | { type: "repair"; amount: number }
  | { type: "shield" }
  | { type: "boost" }
  | { type: "reboot"; amount: number };

export const formOf = (setup: BattleSetup, state: Pick<BattleState, "form">): FormSpec => setup.spec.forms[Math.min(state.form, setup.spec.forms.length - 1)];

/**
 * เริ่มออกปฏิบัติการ carry = ร่างและพลังของคู่ต่อสู้ที่เหลือจากครั้งก่อน (ถอยกลับมาซ่อมแล้วออกใหม่)
 * reboot = ผู้เล่นพกแกนสำรองมาในกระเป๋า
 */
export function startBattle(setup: BattleSetup, options: { carry?: { form: number; kaijuHp: number }; reboot?: boolean } = {}): BattleState {
  const form = Math.min(setup.spec.forms.length - 1, Math.max(0, options.carry?.form ?? 0));
  const full = setup.spec.forms[form].hp;
  const kaijuHp = options.carry ? Math.min(full, Math.max(1, options.carry.kaijuHp)) : full;
  return {
    robotHp: setup.robotMax,
    form,
    kaijuHp,
    streak: 0,
    turn: 0,
    correct: 0,
    shield: setup.startShield,
    armored: setup.spec.forms[form].trait === "armor",
    boost: false,
    reboot: options.reboot ?? false,
    stunned: false,
    guard: setup.guards,
    retries: setup.retries,
    dodge: setup.dodges,
    opening: setup.gear.chip === "charger",
    status: "fighting",
  };
}

/** สิ่งที่ต้องส่งให้ startBattle เมื่อออกปฏิบัติการใหม่หลังแพ้ */
export const retryCarry = (setup: BattleSetup, state: BattleState): { form: number; kaijuHp: number } => ({ form: state.form, kaijuHp: setup.formResetsOnRetry ? formOf(setup, state).hp : state.kaijuHp });

/** คู่ต่อสู้กำลังชาร์จพลังสำหรับโจทย์ข้อถัดไปหรือไม่ */
export const isCharging = (setup: BattleSetup, state: BattleState): boolean => formOf(setup, state).trait === "charge" && (state.turn + 1) % BATTLE.charge.every === 0;

/** คู่ต่อสู้ลักษณะ enrage กำลังคลั่งหรือไม่ */
export const isEnraged = (setup: BattleSetup, state: BattleState): boolean => formOf(setup, state).trait === "enrage" && state.kaijuHp <= Math.ceil(formOf(setup, state).hp / 2);

/** คู่ต่อสู้ลักษณะ boss เข้าเฟสครึ่งหลังแล้ว: โจมตีหนักทุกครั้ง */
export const isFurious = (setup: BattleSetup, state: Pick<BattleState, "form" | "kaijuHp">): boolean => formOf(setup, state).trait === "boss" && phaseOf(setup, state) >= BATTLE.boss.heavyFromPhase;

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

/** สิ่งที่การ์เดียนจะทำถ้าตอบข้อถัดไปถูก (ใช้ทั้งคำนวณผลและแสดงล่วงหน้าบนแผงคำสั่ง) */
export interface Strike {
  /** ทำได้แค่ทุบเกราะของคู่ต่อสู้ (ไม่มีความเสียหาย) */
  armorBreak: boolean;
  /** ค้อนทุบทะลุเกราะ: เกราะแตกและโจมตีเข้าในครั้งเดียว */
  pierced: boolean;
  /** อาวุธได้เปรียบคู่ต่อสู้ร่างนี้ (ประเภทตรงกับจุดอ่อน): แรงขึ้น GEAR.advantage */
  advantage: boolean;
  /** ความเข้ากันของอาวุธกับร่างนี้ (ชนะทาง พอใช้ได้ แพ้ทาง) */
  matchup: Matchup;
  /** ค้อนทุบสะเทือน: แรงขึ้น GEAR.quakeDamage */
  quake: boolean;
  damage: number;
  /** สวนกลับตอนคู่ต่อสู้ชาร์จพลัง */
  counter: boolean;
  /** ตัวคูณ 2 เท่ามาจากอย่างใดอย่างหนึ่ง: คริติคอลของดาบและหอก ชิปเร่งพลัง หรือแบตเตอรี่เสริม (ไม่ซ้อนกัน อันที่ไม่ได้ใช้เก็บไว้ครั้งถัดไป) */
  crit: boolean;
  opening: boolean;
  boosted: boolean;
  /** ปืนเลเซอร์และปืนใหญ่ทำให้คู่ต่อสู้ติดสตัน */
  stuns: boolean;
  /** พี่บิตยิงเสริมหลังการโจมตีนี้ (0 = ไม่ยิง) */
  assist: number;
}

export function strikeOf(setup: BattleSetup, state: BattleState): Strike {
  const form = formOf(setup, state);
  const streak = state.streak + 1;
  const weapon = WEAPON[setup.gear.weapon];
  const every = (n: number | undefined) => n !== undefined && streak % n === 0;
  const counter = isCharging(setup, state);
  const armored = form.trait === "armor" && state.armored;
  // แพ้ทาง: ความสามารถพิเศษของอาวุธ (คริติคอล สตัน ค้อนสะเทือน ทุบทะลุเกราะ) ไม่ทำงานกับร่างนี้
  const matchup = matchupOf(setup.gear.weapon, form.weak);
  const special = matchup !== "weak";
  const armorBreak = armored && !(weapon.pierce && special);
  const advantage = !armorBreak && matchup === "strong" && streak >= GEAR.advantageFromStreak;
  const quake = !armorBreak && special && every(weapon.quakeEvery);
  const base = (counter ? BATTLE.charge.counterDamage : form.trait === "combo" ? Math.min(BATTLE.comboMax, streak) : BATTLE.hit) + (advantage ? GEAR.advantage : 0) + (quake ? GEAR.quakeDamage : 0);
  const crit = !armorBreak && special && every(weapon.critEvery);
  const opening = !armorBreak && !crit && state.opening;
  const boosted = !armorBreak && !crit && !opening && state.boost;
  const damage = armorBreak ? 0 : base * (crit ? GEAR.critMultiplier : opening || boosted ? 2 : 1);
  return {
    armorBreak,
    pierced: armored && !armorBreak,
    advantage,
    matchup,
    quake,
    damage,
    counter: counter && !armorBreak,
    crit,
    opening,
    boosted,
    stuns: special && every(weapon.stunEvery) && !state.stunned,
    assist: state.kaijuHp - damage > 0 && streak % BATTLE.assistStreak === 0 ? setup.assistDamage : 0,
  };
}

/** สิ่งที่คู่ต่อสู้จะทำถ้าตอบข้อถัดไปผิด */
export interface Threat {
  damage: number;
  heavy: boolean;
  /** สิ่งที่ช่วยไว้ ตามลำดับที่ใช้: ชิปคิดทบทวน (ได้ตอบใหม่) สตัน การหลบของชุดนินจา เกราะสะท้อน โล่พลังงาน */
  saved: "retry" | "stun" | "dodge" | "guard" | "shield" | null;
  /** พลังที่คู่ต่อสู้ลักษณะ regen ฟื้น */
  regen: number;
  /** เกราะของคู่ต่อสู้ลักษณะ armor กลับมา */
  rearm: boolean;
}

export function threatOf(setup: BattleSetup, state: BattleState): Threat {
  const form = formOf(setup, state);
  const heavy = isCharging(setup, state) || (form.trait === "swarm" && state.kaijuHp >= BATTLE.swarmHeavyFrom) || isEnraged(setup, state) || isFurious(setup, state);
  const saved = state.retries > 0 ? "retry" : state.stunned ? "stun" : state.dodge > 0 ? "dodge" : state.guard > 0 ? "guard" : state.shield ? "shield" : null;
  // ได้ตอบใหม่หรือคู่ต่อสู้ติดสตัน: คู่ต่อสู้ไม่ได้ทำอะไรเลยในตานี้
  const acts = saved !== "retry" && saved !== "stun";
  // ชนะทาง: การโจมตีหนักเบาลง (อึดขึ้น) แพ้ทาง: แรงขึ้น (อ่อนแอลง) การโจมตีปกติเท่าเดิม
  const matchup = matchupOf(setup.gear.weapon, form.weak);
  const heavyDamage = BATTLE.heavyDamage + (matchup === "strong" ? -GEAR.strongGuard : matchup === "weak" ? GEAR.weakExposure : 0);
  return {
    damage: heavy ? heavyDamage : BATTLE.wrongDamage,
    heavy,
    saved,
    regen: acts && form.trait === "regen" ? Math.min(BATTLE.regen, form.hp - state.kaijuHp) : 0,
    rearm: acts && form.trait === "armor" && !state.armored,
  };
}

/** ผลของการตอบหนึ่งข้อ */
export function resolveAnswer(setup: BattleSetup, state: BattleState, correct: boolean): { state: BattleState; events: BattleEvent[] } {
  if (state.status !== "fighting") return { state, events: [] };
  const events: BattleEvent[] = [];
  let { robotHp, kaijuHp, shield, armored, boost, reboot, streak, stunned, guard, opening, dodge } = state;
  let formIndex = state.form;

  if (correct) {
    const strike = strikeOf(setup, state);
    const lastForm = formIndex === setup.spec.forms.length - 1;
    streak += 1;
    const phaseBefore = phaseOf(setup, state);
    if (strike.armorBreak) {
      armored = false;
      events.push({ type: "armor-break" });
    } else {
      if (strike.pierced) {
        armored = false;
        events.push({ type: "armor-break", pierced: true });
      }
      // พลังที่เกินพลังที่คู่ต่อสู้เหลือไม่ทบไปร่างถัดไป (wasted) บันทึกเหตุการณ์จึงบอกได้ว่าทำไมแถบพลังลดน้อยกว่าตัวเลข
      const wasted = Math.max(0, strike.damage - Math.max(0, kaijuHp));
      kaijuHp -= strike.damage;
      events.push({ type: "robot-hit", damage: strike.damage, counter: strike.counter, boosted: strike.boosted, crit: strike.crit, quake: strike.quake, advantage: strike.advantage, opening: strike.opening, final: lastForm && kaijuHp <= 0, ...(wasted > 0 ? { wasted } : {}) });
      if (strike.opening) opening = false;
      if (strike.boosted) boost = false;
    }
    if (strike.stuns && kaijuHp > 0) {
      stunned = true;
      events.push({ type: "stun" });
    }
    if (strike.assist > 0) {
      const wasted = Math.max(0, strike.assist - Math.max(0, kaijuHp));
      kaijuHp -= strike.assist;
      events.push({ type: "bit-assist", damage: strike.assist, ...(wasted > 0 ? { wasted } : {}) });
      const heal = Math.min(setup.assistHeal, setup.robotMax - robotHp);
      if (heal > 0) {
        robotHp += heal;
        events.push({ type: "bit-heal", amount: heal });
      }
    }
    kaijuHp = Math.max(0, kaijuHp);
    const phase = phaseOf(setup, { form: formIndex, kaijuHp });
    if (kaijuHp > 0 && phase > phaseBefore) {
      const heal = Math.min(BATTLE.boss.phaseHeal, setup.robotMax - robotHp);
      robotHp += heal;
      events.push({ type: "phase", phase, heal });
    }
    if (kaijuHp <= 0 && !lastForm) {
      // ชนะร่างนี้แล้ว คู่ต่อสู้กลายร่าง หุ่นได้พักฟื้นเล็กน้อย เกราะสะท้อนและชิปเร่งพลังพร้อมใช้กับร่างใหม่
      formIndex += 1;
      const next = setup.spec.forms[formIndex];
      kaijuHp = next.hp;
      armored = next.trait === "armor";
      stunned = false;
      guard = setup.guards;
      opening = setup.gear.chip === "charger";
      const heal = Math.min(BATTLE.transformHeal, setup.robotMax - robotHp);
      robotHp += heal;
      events.push({ type: "transform", form: formIndex, heal });
    }
  } else {
    const threat = threatOf(setup, state);
    if (threat.saved === "retry") {
      // ชิปคิดทบทวน: ตานี้ยังไม่จบ ผู้เล่นได้ตอบข้อเดิมอีกครั้ง
      const left = state.retries - 1;
      return { state: { ...state, retries: left }, events: [{ type: "second-chance", left }] };
    }
    streak = 0;
    if (threat.saved === "stun") {
      stunned = false;
      events.push({ type: "kaiju-stunned" });
    } else {
      if (threat.saved === "dodge" || threat.saved === "guard" || threat.saved === "shield") {
        if (threat.saved === "dodge") dodge -= 1;
        else if (threat.saved === "guard") guard -= 1;
        else shield = false;
        events.push({ type: "kaiju-hit", damage: 0, blocked: true, heavy: threat.heavy, by: threat.saved });
      } else {
        robotHp = Math.max(0, robotHp - threat.damage);
        events.push({ type: "kaiju-hit", damage: threat.damage, blocked: false, heavy: threat.heavy });
      }
      if (threat.regen > 0) {
        kaijuHp += threat.regen;
        events.push({ type: "kaiju-regen", amount: threat.regen });
      }
      if (threat.rearm) {
        armored = true;
        events.push({ type: "kaiju-rearm" });
      }
      if (robotHp <= 0 && reboot) {
        reboot = false;
        robotHp = Math.min(setup.robotMax, BATTLE.rebootHeal);
        events.push({ type: "reboot", amount: robotHp });
      }
    }
  }

  const status = kaijuHp <= 0 ? "won" : robotHp <= 0 ? "lost" : "fighting";
  return {
    state: { robotHp, form: formIndex, kaijuHp, streak, turn: state.turn + 1, correct: state.correct + (correct ? 1 : 0), shield, armored, boost, reboot, stunned, guard, retries: state.retries, dodge, opening, status },
    events,
  };
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
