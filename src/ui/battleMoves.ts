// ท่าโจมตีของการ์เดียนและสกิลของไคจู: ชื่อท่า ท่าทางของตัวละคร เอฟเฟกต์ และเสียง (docs/GDD.md ข้อ 12.4)
// เป็นข้อมูลของการแสดงผลล้วน ผลของการต่อสู้คำนวณใน src/state/battle.ts ชื่อท่าอยู่ใน ui.battle.moves / ui.battle.skills
import type { SfxName } from "../audio/sfx";
import type { ui } from "../content/ui-strings";
import type { FoeArt } from "../state/campaign";
import type { Weapon } from "../state/gear";
import type { FxArt } from "./art";

export type GuardianMove = keyof typeof ui.battle.moves;
export type FoeSkill = keyof typeof ui.battle.skills;
/** dash = พุ่งเข้าประชิด, fire = ยิงจากที่ยืน (ถอยตามแรงสะท้อน), charge = รวมพลังก่อนปล่อย, spin = หมุนตัวฟาด, hop = กระโดดเข้าใส่ */
export type Pose = "dash" | "fire" | "charge" | "spin" | "hop";

export interface SparkSpec {
  art: FxArt;
  /** pop = ปรากฏที่ตัวเป้า, shot = พุ่งข้ามฉากไปหาเป้า, beam = ลำแสงยืดจากผู้โจมตีถึงเป้า, drop = ตกจากด้านบนใส่เป้า */
  motion: "pop" | "shot" | "beam" | "drop";
  /** เวลาเริ่ม (มิลลิวินาทีหลังเริ่มท่า) */
  at: number;
  big?: boolean;
  /** แนวของเอฟเฟกต์: -1 ต่ำ, 0 กลาง, 1 สูง */
  row?: -1 | 0 | 1;
  /** กลับภาพซ้ายขวา */
  flip?: boolean;
  tint?: "purple";
  /** เอฟเฟกต์ตอนโดนเป้า: ถ้าการโจมตีถูกกันไว้จะเปลี่ยนเป็นโล่ */
  impact?: boolean;
}

export interface MoveSpec {
  pose: Pose;
  sparks: readonly SparkSpec[];
  sounds: readonly (readonly [SfxName, number])[];
  /** เวลาที่การโจมตีถึงเป้า: ตัวเลขความเสียหายขึ้น เป้ากระตุก */
  hitAt: number;
  /** ความยาวของท่าทั้งหมด เหตุการณ์ถัดไปของตาเริ่มหลังจากนี้ */
  end: number;
  shake?: boolean;
}

/** เวลาที่กระสุนพุ่งถึงเป้า (ตรงกับ battle-fx-shot ใน index.css) */
export const SHOT_MS = 260;
const hit = (at: number, big = false, row: -1 | 0 | 1 = 0): SparkSpec => ({ art: "impact", motion: "pop", at, big, row, impact: true });

export const GUARDIAN_MOVES: Record<GuardianMove, MoveSpec> = {
  punch: { pose: "dash", sparks: [hit(200)], sounds: [["punch", 200]], hitAt: 200, end: 520 },
  "rocket-punch": { pose: "fire", sparks: [{ art: "fist", motion: "shot", at: 0, big: true }, hit(SHOT_MS, true)], sounds: [["fire", 0], ["boom", SHOT_MS]], hitAt: SHOT_MS, end: 640 },
  slash: { pose: "dash", sparks: [{ art: "sword", motion: "pop", at: 180, impact: true }], sounds: [["slash", 180]], hitAt: 200, end: 520 },
  "cross-slash": {
    pose: "dash",
    sparks: [{ art: "sword", motion: "pop", at: 180, big: true }, { art: "sword", motion: "pop", at: 320, big: true, flip: true }, hit(440, true)],
    sounds: [["slash", 180], ["slash", 320], ["boom", 440]],
    hitAt: 440,
    end: 800,
  },
  shot: { pose: "fire", sparks: [{ art: "bolt", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["laser", 0], ["boom", SHOT_MS]], hitAt: SHOT_MS, end: 600 },
  beam: { pose: "fire", sparks: [{ art: "beam", motion: "beam", at: 0 }, hit(220, true)], sounds: [["beam", 0], ["boom", 240]], hitAt: 220, end: 720 },
  smash: { pose: "dash", sparks: [{ art: "hammer", motion: "pop", at: 180, impact: true }], sounds: [["punch", 200]], hitAt: 200, end: 520 },
  quake: {
    pose: "dash",
    sparks: [{ art: "hammer", motion: "pop", at: 180, big: true }, hit(320, true), hit(440, true, -1)],
    sounds: [["punch", 200], ["boom", 320], ["crack", 440]],
    hitAt: 320,
    end: 780,
    shake: true,
  },
  thrust: { pose: "dash", sparks: [{ art: "lance", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["slash", 120], ["punch", SHOT_MS]], hitAt: SHOT_MS, end: 600 },
  "thunder-thrust": {
    pose: "dash",
    sparks: [{ art: "lance", motion: "shot", at: 0, big: true }, { art: "zap", motion: "pop", at: SHOT_MS, big: true, flip: true }, hit(SHOT_MS + 140, true)],
    sounds: [["slash", 120], ["crit", SHOT_MS], ["boom", SHOT_MS + 140]],
    hitAt: SHOT_MS,
    end: 820,
  },
  "plasma-shot": { pose: "fire", sparks: [{ art: "bolt", motion: "shot", at: 0, big: true, tint: "purple" }, hit(SHOT_MS, true)], sounds: [["laser", 0], ["boom", SHOT_MS]], hitAt: SHOT_MS, end: 620 },
  "plasma-beam": {
    pose: "fire",
    sparks: [{ art: "beam", motion: "beam", at: 0, big: true, tint: "purple" }, hit(220, true), hit(380, true, 1)],
    sounds: [["beam", 0], ["boom", 240], ["boom", 380]],
    hitAt: 220,
    end: 820,
  },
  // ท่าปิดฉากร่างสุดท้าย: รวมพลังของแกน AI แล้วปล่อยลำแสงใหญ่ ใช้ได้กับทุกอาวุธ
  finisher: {
    pose: "charge",
    sparks: [{ art: "spark", motion: "pop", at: 0, row: 1 }, { art: "beam", motion: "beam", at: 420, big: true }, hit(600, true), hit(780, true, 1), hit(960, true, -1)],
    sounds: [["charge", 0], ["beam", 420], ["boom", 600], ["boom", 780], ["boom", 960]],
    hitAt: 600,
    end: 1300,
    shake: true,
  },
};

export const FOE_SKILLS: Record<FoeSkill, MoveSpec> = {
  claw: { pose: "dash", sparks: [{ art: "slash", motion: "pop", at: 200, impact: true }], sounds: [["slash", 200], ["hurt", 240]], hitAt: 200, end: 560, shake: true },
  tail: { pose: "spin", sparks: [hit(260, true)], sounds: [["punch", 260], ["hurt", 300]], hitAt: 260, end: 640, shake: true },
  bite: {
    pose: "dash",
    sparks: [{ art: "bite", motion: "pop", at: 160, row: 1 }, { art: "bite", motion: "pop", at: 280, impact: true }, { art: "bite", motion: "pop", at: 400, row: -1 }],
    sounds: [["bite", 160], ["bite", 280], ["bite", 400], ["hurt", 420]],
    hitAt: 280,
    end: 760,
    shake: true,
  },
  "tri-beam": {
    pose: "charge",
    sparks: [{ art: "beam", motion: "beam", at: 380, tint: "purple", row: 1 }, { art: "beam", motion: "beam", at: 470, tint: "purple" }, { art: "beam", motion: "beam", at: 560, tint: "purple", row: -1 }, hit(640, true)],
    sounds: [["charge", 0], ["beam", 380], ["boom", 640]],
    hitAt: 640,
    end: 1100,
    shake: true,
  },
  "scrap-throw": { pose: "fire", sparks: [{ art: "scrap", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["punch", 0], ["crack", SHOT_MS], ["hurt", SHOT_MS + 40]], hitAt: SHOT_MS, end: 640, shake: true },
  "scrap-rain": {
    pose: "fire",
    sparks: [{ art: "scrap", motion: "drop", at: 0 }, { art: "scrap", motion: "drop", at: 150, flip: true, row: 1 }, { art: "scrap", motion: "drop", at: 300, row: -1 }, hit(480, true)],
    sounds: [["crack", 240], ["crack", 390], ["boom", 520]],
    hitAt: 480,
    end: 900,
    shake: true,
  },
  pincer: { pose: "dash", sparks: [{ art: "pincer", motion: "pop", at: 200, impact: true }], sounds: [["bite", 200], ["hurt", 240]], hitAt: 200, end: 560, shake: true },
  crusher: { pose: "dash", sparks: [{ art: "pincer", motion: "pop", at: 200, big: true }, hit(380, true)], sounds: [["bite", 200], ["crack", 300], ["boom", 380]], hitAt: 380, end: 760, shake: true },
  nibble: { pose: "hop", sparks: [{ art: "swarm", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["bite", SHOT_MS], ["hurt", SHOT_MS + 40]], hitAt: SHOT_MS, end: 620, shake: true },
  stampede: {
    pose: "hop",
    sparks: [{ art: "swarm", motion: "shot", at: 0, big: true }, { art: "swarm", motion: "shot", at: 140, row: 1 }, { art: "swarm", motion: "shot", at: 280, row: -1 }, hit(SHOT_MS, true), hit(SHOT_MS + 280, true, -1)],
    sounds: [["bite", SHOT_MS], ["bite", SHOT_MS + 140], ["boom", SHOT_MS + 280]],
    hitAt: SHOT_MS,
    end: 940,
    shake: true,
  },
  "dragon-claw": { pose: "dash", sparks: [{ art: "slash", motion: "pop", at: 200, big: true, impact: true }], sounds: [["slash", 200], ["hurt", 240]], hitAt: 200, end: 560, shake: true },
  flame: { pose: "fire", sparks: [{ art: "fireball", motion: "shot", at: 0, big: true }, hit(SHOT_MS, true)], sounds: [["fire", 0], ["boom", SHOT_MS]], hitAt: SHOT_MS, end: 700, shake: true },
  "energy-wave": { pose: "fire", sparks: [{ art: "wave", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["laser", 0], ["hurt", SHOT_MS]], hitAt: SHOT_MS, end: 640, shake: true },
  "rage-wave": {
    pose: "fire",
    sparks: [{ art: "wave", motion: "shot", at: 0, big: true }, { art: "wave", motion: "shot", at: 200, big: true, row: 1 }, hit(SHOT_MS, true), hit(SHOT_MS + 200, true, 1)],
    sounds: [["laser", 0], ["laser", 200], ["boom", SHOT_MS + 200]],
    hitAt: SHOT_MS,
    end: 900,
    shake: true,
  },
  "flame-wing": {
    pose: "spin",
    sparks: [{ art: "fireball", motion: "shot", at: 100, row: 1 }, { art: "fireball", motion: "shot", at: 240, row: -1 }, hit(100 + SHOT_MS)],
    sounds: [["fire", 100], ["fire", 240], ["hurt", 100 + SHOT_MS]],
    hitAt: 100 + SHOT_MS,
    end: 800,
    shake: true,
  },
  "ruin-beam": {
    pose: "charge",
    sparks: [{ art: "ruin", motion: "beam", at: 420, big: true, flip: true }, hit(620, true), hit(800, true, 1)],
    sounds: [["charge", 0], ["beam", 420], ["boom", 620], ["boom", 800]],
    hitAt: 620,
    end: 1200,
    shake: true,
  },
  zap: { pose: "fire", sparks: [{ art: "zap", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["laser", 0], ["hurt", SHOT_MS]], hitAt: SHOT_MS, end: 620, shake: true },
  storm: {
    pose: "charge",
    sparks: [{ art: "zap", motion: "drop", at: 380 }, { art: "zap", motion: "drop", at: 500, row: 1, flip: true }, { art: "zap", motion: "drop", at: 620, row: -1 }, hit(700, true)],
    sounds: [["charge", 0], ["crack", 480], ["crack", 600], ["boom", 700]],
    hitAt: 700,
    end: 1100,
    shake: true,
  },
  ram: { pose: "dash", sparks: [hit(220, true)], sounds: [["punch", 220], ["hurt", 260]], hitAt: 220, end: 580, shake: true },
  "shell-cannon": {
    pose: "fire",
    sparks: [{ art: "shell", motion: "shot", at: 0, big: true }, hit(SHOT_MS, true), hit(SHOT_MS + 160, true, 1)],
    sounds: [["fire", 0], ["boom", SHOT_MS], ["boom", SHOT_MS + 160]],
    hitAt: SHOT_MS,
    end: 820,
    shake: true,
  },
  sting: { pose: "hop", sparks: [{ art: "sting", motion: "shot", at: 0 }, hit(SHOT_MS)], sounds: [["slash", 0], ["hurt", SHOT_MS]], hitAt: SHOT_MS, end: 620, shake: true },
  "sting-rain": {
    pose: "hop",
    sparks: [{ art: "sting", motion: "shot", at: 0, row: 1 }, { art: "sting", motion: "shot", at: 130 }, { art: "sting", motion: "shot", at: 260, row: -1 }, hit(SHOT_MS, false, 1), hit(SHOT_MS + 260, true, -1)],
    sounds: [["slash", 0], ["slash", 130], ["slash", 260], ["boom", SHOT_MS + 260]],
    hitAt: SHOT_MS,
    end: 920,
    shake: true,
  },
  // แมกมาโกเลม: ทุบด้วยหมัดหินลาวา / ปะทุลาวาจากพื้น
  "magma-fist": { pose: "dash", sparks: [{ art: "fireball", motion: "pop", at: 200, impact: true }], sounds: [["punch", 200], ["fire", 220], ["hurt", 260]], hitAt: 200, end: 600, shake: true },
  "lava-burst": {
    pose: "charge",
    sparks: [{ art: "fireball", motion: "drop", at: 360, big: true }, { art: "fireball", motion: "drop", at: 500, row: 1, flip: true }, hit(620, true), hit(760, true, -1)],
    sounds: [["charge", 0], ["fire", 380], ["boom", 620], ["boom", 760]],
    hitAt: 620,
    end: 1100,
    shake: true,
  },
  // ฟีนิกซ์เหล็ก: ยิงขนเหล็ก / พุ่งดิ่งลงมาพร้อมเปลวไฟ
  "steel-feather": { pose: "fire", sparks: [{ art: "sting", motion: "shot", at: 0 }, { art: "sting", motion: "shot", at: 120, row: 1 }, hit(SHOT_MS)], sounds: [["slash", 0], ["slash", 120], ["hurt", SHOT_MS]], hitAt: SHOT_MS, end: 640, shake: true },
  "phoenix-dive": {
    pose: "dash",
    sparks: [{ art: "fireball", motion: "shot", at: 0, big: true }, hit(SHOT_MS, true), hit(SHOT_MS + 180, true, 1)],
    sounds: [["fire", 0], ["boom", SHOT_MS], ["boom", SHOT_MS + 180]],
    hitAt: SHOT_MS,
    end: 860,
    shake: true,
  },
  halo: { pose: "charge", sparks: [{ art: "halo", motion: "pop", at: 380, big: true, impact: true }], sounds: [["charge", 0], ["boom", 400]], hitAt: 400, end: 900, shake: true },
  judgement: {
    pose: "charge",
    sparks: [{ art: "halo", motion: "pop", at: 300, big: true, row: 1 }, { art: "ruin", motion: "beam", at: 480, big: true, flip: true }, hit(680, true), hit(860, true, 1)],
    sounds: [["charge", 0], ["beam", 480], ["boom", 680], ["boom", 860]],
    hitAt: 680,
    end: 1280,
    shake: true,
  },
};

/** สิ่งที่บอกว่าการโจมตีครั้งนี้เป็นท่าแรง: ผลพิเศษของอาวุธ การสวนกลับ ตัวคูณ หรือความเสียหายตั้งแต่ 3 ขึ้นไป (คอมโบ) */
export interface StrikeShape {
  damage: number;
  final: boolean;
  crit?: boolean;
  quake?: boolean;
  counter?: boolean;
  boosted?: boolean;
  opening?: boolean;
}

const MOVES: Record<Weapon, [normal: GuardianMove, strong: GuardianMove]> = {
  fist: ["punch", "rocket-punch"],
  hammer: ["smash", "quake"],
  sword: ["slash", "cross-slash"],
  lance: ["thrust", "thunder-thrust"],
  blaster: ["shot", "beam"],
  cannon: ["plasma-shot", "plasma-beam"],
};

/** ท่าของการ์เดียน: อาวุธกำหนดแบบของท่า การโจมตีที่มีผลพิเศษหรือแรงตั้งแต่ 3 ขึ้นไปเป็นท่าแรง และการโจมตีที่ปิดฉากร่างสุดท้ายเป็นลำแสงแกน AI */
export function guardianMove(weapon: Weapon, strike: StrikeShape): GuardianMove {
  if (strike.final) return "finisher";
  const strong = strike.crit || strike.quake || strike.counter || strike.boosted || strike.opening || strike.damage >= 3;
  return MOVES[weapon][strong ? 1 : 0];
}

/** สกิลของคู่ต่อสู้แต่ละตัว: ท่าปกติ และท่าหนัก (ตอนชาร์จพลัง คลั่ง ฝูงยังเหลือเยอะ หรือเฟสท้ายของบอส) */
const SKILL_OF: Record<FoeArt, { normal: FoeSkill; heavy: FoeSkill }> = {
  kaiju_1: { normal: "claw", heavy: "tail" },
  kaiju_2: { normal: "bite", heavy: "tri-beam" },
  kaiju_3: { normal: "scrap-throw", heavy: "scrap-rain" },
  kaiju_4: { normal: "pincer", heavy: "crusher" },
  kaiju_5: { normal: "nibble", heavy: "stampede" },
  kaiju_6: { normal: "dragon-claw", heavy: "flame" },
  boss_2: { normal: "energy-wave", heavy: "rage-wave" },
  boss_3: { normal: "flame-wing", heavy: "ruin-beam" },
  kaiju_7: { normal: "zap", heavy: "storm" },
  kaiju_8: { normal: "ram", heavy: "shell-cannon" },
  kaiju_9: { normal: "sting", heavy: "sting-rain" },
  boss_4: { normal: "halo", heavy: "judgement" },
  kaiju_10: { normal: "magma-fist", heavy: "lava-burst" },
  kaiju_11: { normal: "steel-feather", heavy: "phoenix-dive" },
};

export const foeSkill = (art: FoeArt, heavy: boolean): FoeSkill => SKILL_OF[art][heavy ? "heavy" : "normal"];
