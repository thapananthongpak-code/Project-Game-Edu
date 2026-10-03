// แบบจำลองความสมดุลของด่านต่อสู้ (docs/GDD.md ข้อ 18): ให้ผู้เล่นจำลองที่ตอบถูกด้วยความน่าจะเป็นคงที่เล่นด่านหลายพันรอบ
// ใช้เครื่องยนต์จริงใน battle.ts ทุกอย่างเป็นฟังก์ชันล้วน สุ่มด้วยเมล็ดคงที่ ผลจึงเหมือนเดิมทุกครั้งที่รัน
// balance.test.ts ใช้ไฟล์นี้ยืนยันว่าเกมไม่ยากหรือง่ายเกินไป และ npm run balance พิมพ์ตารางเต็ม
import { type ActiveSupply, applySupply, type BattleSetup, type BattleState, battleSetup, resolveAnswer, retryCarry, startBattle, strikeOf, threatOf } from "./battle";
import type { BattleSpec, Difficulty } from "./campaign";
import { DEFAULT_GEAR, type Gear, guardianPower } from "./gear";
import { idealBag } from "./loadout";
import { advantageShare } from "./shop";
import type { BitModule, Outfit, Supply } from "./shop.config";

/** ตัวสุ่มแบบมีเมล็ด (mulberry32) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SIM = {
  /** ชิปวิเคราะห์ตัดตัวเลือกผิดออก 1 จาก 3 ข้อ: ส่วนที่เดาจึงถูกมากขึ้น */
  analyzerLift: 1 / 3,
  /** ได้ตอบใหม่หลังรู้ว่าข้อที่เลือกผิด */
  retryLift: 0.4,
  /** ขอข้อมูลจากพี่บิต (เปิดเนื้อหาของหัวข้ออ่าน): ผู้เล่นส่วนใหญ่ตอบถูกหลังอ่าน */
  hintLift: 0.6,
  /** จำนวนการออกปฏิบัติการสูงสุดที่จำลอง */
  maxSorties: 12,
} as const;

export interface Build {
  outfit: Outfit;
  modules: readonly BitModule[];
  gear: Gear;
  /** ของใช้ที่พกในการออกปฏิบัติการแต่ละครั้ง (จำลองว่าผู้เล่นเติมกระเป๋าเหมือนเดิมทุกครั้ง ถ้า refill) */
  bag: readonly Supply[];
}

export const BARE: Build = { outfit: "lab", modules: [], gear: DEFAULT_GEAR, bag: [] };

const gear = (weapon: Gear["weapon"], armor: Gear["armor"], chip: Gear["chip"]): Gear => ({ weapon, armor, chip });

/**
 * ชุดอุปกรณ์ที่ผู้เล่นทั่วไปซื้อได้ก่อนถึงแต่ละด่าน (ใช้เครดิตราวสองในสามกับอุปกรณ์และของใช้ ที่เหลือไว้ซื้อของตกแต่ง)
 * พลังที่แนะนำของด่าน (BattleSpec.power) ตั้งจากค่าพลังรวมของชุดนี้ items = จำนวนของใช้ที่พกตามคำแนะนำของพี่บิต
 */
export const PAR: Record<string, { gear: Gear; items: number }> = {
  // แมพ 1: หมัดได้เปรียบด่านแรกอยู่แล้ว จากนั้นซื้อดาบ เกราะหนัก ปืน และชิปเร่งพลังตามลำดับ สลับอาวุธตามจุดอ่อนของไคจู
  k1: { gear: DEFAULT_GEAR, items: 0 },
  k2: { gear: gear("sword", "plate", "none"), items: 0 },
  k3: { gear: gear("sword", "heavy", "none"), items: 2 },
  k4: { gear: gear("fist", "heavy", "none"), items: 3 },
  k5: { gear: gear("blaster", "heavy", "none"), items: 2 },
  omega: { gear: gear("sword", "heavy", "charger"), items: 3 },
  // แมพ 2: ของจากแมพ 1 ติดตัวมา แล้วซื้อค้อน เกราะสะท้อน หอกของลุงบียอร์น และชิปคิดทบทวน
  n1: { gear: gear("sword", "heavy", "charger"), items: 3 },
  n2: { gear: gear("hammer", "heavy", "charger"), items: 3 },
  n3: { gear: gear("blaster", "guard", "charger"), items: 3 },
  "omega-n": { gear: gear("lance", "guard", "retry"), items: 3 },
  // แมพ 3: ด่านต่อสู้ล้วน ปืนใหญ่พลาสม่ากับของที่มีมาจากแมพ 2 สลับอาวุธตามจุดอ่อนของแต่ละด่าน
  h1: { gear: gear("cannon", "heavy", "charger"), items: 3 },
  h2: { gear: gear("hammer", "guard", "charger"), items: 3 },
  // บอสใหญ่แต่ละร่างแพ้ทางคนละแบบ: หอกชนะทางร่างสุดท้ายที่คลั่ง (ร่างที่อันตรายที่สุด) แม้จะแพ้ทางร่างที่ 2 ที่หุ้มเกราะ
  end: { gear: gear("lance", "titan", "retry"), items: 3 },
};

export const parBuild = (spec: BattleSpec): Build => ({ ...BARE, gear: PAR[spec.id].gear, bag: idealBag(spec).slice(0, PAR[spec.id].items) });

/** ค่าพลังรวมของชุดอุปกรณ์หนึ่งในด่านหนึ่ง */
export const buildPower = (difficulty: Difficulty, spec: BattleSpec, build: Build): number =>
  guardianPower({
    robotMax: battleSetup(difficulty, spec, build.outfit, build.modules, build.gear).robotMax,
    gear: build.gear,
    outfit: build.outfit,
    modules: build.modules,
    bag: build.bag.length,
    advantage: advantageShare(spec, build.gear),
  });

const lift = (p: number, by: number) => p + (1 - p) * by;

/** เล่นการออกปฏิบัติการหนึ่งครั้งด้วยนโยบายใช้ของแบบที่ผู้เล่นทั่วไปทำ คืนสถานะสุดท้าย */
export function simulateSortie(setup: BattleSetup, accuracy: number, bag: readonly Supply[], random: () => number, carry?: { form: number; kaijuHp: number }): BattleState {
  const left = [...bag];
  const take = (supply: Supply): boolean => {
    const i = left.indexOf(supply);
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  };
  const use = (state: BattleState, supply: ActiveSupply): BattleState => {
    if (!left.includes(supply)) return state;
    const result = applySupply(setup, state, supply);
    if (!result) return state;
    take(supply);
    return result.state;
  };
  let state = startBattle(setup, { carry, reboot: take("reboot") });
  let hints = setup.hints;
  for (let guard = 0; guard < 400 && state.status === "fighting"; guard++) {
    const threat = threatOf(setup, state);
    const strike = strikeOf(setup, state);
    // ใช้ของได้ตาละ 1 ชิ้น ตามลำดับความจำเป็น: ซ่อมเมื่อพลังเหลือน้อยและไม่เสียของ เปิดโล่เมื่อการโจมตีถัดไปหนักหรือถึงตาย
    // ใช้แบตเตอรี่เสริมกับการโจมตีที่แรงที่สุดที่เห็น ชิปวิเคราะห์ตอนคับขันและไม่มีสิทธิ์ขอข้อมูลแล้ว
    const before = state;
    const tense = state.robotHp <= 2 || threat.heavy;
    let p = accuracy;
    if (state.robotHp <= 3 && setup.robotMax - state.robotHp >= Math.min(setup.repairHeal, 3)) state = use(state, "repair-kit");
    if (state === before && threat.saved === null && (threat.heavy || state.robotHp <= threat.damage)) state = use(state, "shield");
    if (state === before && !strike.armorBreak && !strike.crit && !strike.opening && (strike.counter || state.kaijuHp >= 2)) state = use(state, "overcharge");
    if (tense && hints > 0) {
      hints -= 1;
      p = lift(p, SIM.hintLift);
    } else if (state === before && tense && take("analyzer")) p = lift(p, SIM.analyzerLift);
    let correct = random() < p;
    let result = resolveAnswer(setup, state, correct);
    if (result.events.some((event) => event.type === "second-chance")) {
      correct = random() < lift(p, SIM.retryLift);
      result = resolveAnswer(setup, result.state, correct);
    }
    state = result.state;
  }
  return state;
}

export interface SimResult {
  /** สัดส่วนที่ชนะในการออกปฏิบัติการครั้งแรก */
  firstTry: number;
  /** จำนวนการออกปฏิบัติการเฉลี่ยจนชนะ */
  sorties: number;
  /** สัดส่วนที่ยังไม่ชนะหลัง SIM.maxSorties ครั้ง */
  stuck: number;
  /** จำนวนข้อที่ตอบเฉลี่ยจนชนะ */
  turns: number;
}

/** refill = ผู้เล่นซื้อของเติมกระเป๋าทุกครั้งที่ออกใหม่ (false = ของหมดหลังครั้งแรก) */
export function simulateBattle(difficulty: Difficulty, spec: BattleSpec, build: Build, accuracy: number, options: { runs?: number; seed?: number; refill?: boolean } = {}): SimResult {
  const { runs = 2000, seed = 7, refill = false } = options;
  const random = seeded(seed);
  const setup = battleSetup(difficulty, spec, build.outfit, build.modules, build.gear);
  let first = 0;
  let sorties = 0;
  let stuck = 0;
  let turns = 0;
  for (let run = 0; run < runs; run++) {
    let carry: { form: number; kaijuHp: number } | undefined;
    let won = false;
    for (let sortie = 1; sortie <= SIM.maxSorties; sortie++) {
      const end = simulateSortie(setup, accuracy, sortie === 1 || refill ? build.bag : [], random, carry);
      turns += end.turn;
      if (end.status === "won") {
        if (sortie === 1) first += 1;
        sorties += sortie;
        won = true;
        break;
      }
      carry = retryCarry(setup, end);
    }
    if (!won) {
      stuck += 1;
      sorties += SIM.maxSorties;
    }
  }
  return { firstTry: first / runs, sorties: sorties / runs, stuck: stuck / runs, turns: turns / runs };
}
