import { describe, expect, it } from "vitest";
import { applySupply, type BattleEvent, type BattleSetup, type BattleState, battleSetup, formOf, isCharging, isEnraged, isFurious, phaseCount, phaseOf, questionSource, resolveAnswer, retryCarry, robotMaxOf, startBattle, strikeOf, threatOf } from "./battle";
import { BATTLE } from "./battle.config";
import { type BattleSpec, battleOf, CAMPAIGN, type Difficulty, DIFFICULTIES, topicsOf } from "./campaign";
import { seeded } from "./balance";
import { BAG_SIZE, bagSizeOf, DEFAULT_GEAR, type Gear, GEAR, matchupOf, resistOf, WEAPON, WEAPON_CLASSES, type WeaponClass, WEAPONS } from "./gear";
import { OUTFITS } from "./shop.config";

const setupOf = (difficulty: Difficulty, id: string, outfit: (typeof OUTFITS)[number] = "lab", gear: Partial<Gear> = {}): BattleSetup =>
  battleSetup(difficulty, battleOf(difficulty, id) as BattleSpec, outfit, [], { ...DEFAULT_GEAR, ...gear });
/** เหตุการณ์การโจมตีธรรมดาของการ์เดียน */
const hit = (damage: number, extra: Partial<Extract<BattleEvent, { type: "robot-hit" }>> = {}): BattleEvent => ({ type: "robot-hit", damage, counter: false, boosted: false, crit: false, quake: false, advantage: false, opening: false, final: false, ...extra });

const play = (setup: BattleSetup, answers: boolean[], from?: BattleState) => {
  let state = from ?? startBattle(setup);
  const events = [];
  for (const correct of answers) {
    const result = resolveAnswer(setup, state, correct);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
};

/** ตอบถูกทุกข้อจนจบด่าน */
const sweep = (setup: BattleSetup) => {
  let state = startBattle(setup);
  const events = [];
  for (let i = 0; i < 80 && state.status === "fighting"; i++) {
    const result = resolveAnswer(setup, state, true);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
};

/** ด่านพื้นฐานสำหรับทดสอบกติกากลาง: คู่ต่อสู้ลักษณะพื้นฐาน พลัง 6 ที่ไม่แพ้ทางหมัด (ไม่มีผลของความได้เปรียบมาปน) */
const PLAIN: BattleSpec = { ...(battleOf("easy", "k1") as BattleSpec), forms: [{ art: "kaiju_1", hp: 6, trait: "basic", weak: "blade" }] };
const plain = (outfit: (typeof OUTFITS)[number] = "lab", gear: Partial<Gear> = {}): BattleSetup => battleSetup("easy", PLAIN, outfit, [], { ...DEFAULT_GEAR, ...gear });
/** ด่านจริงที่เปลี่ยนเฉพาะประเภทอาวุธที่คู่ต่อสู้แพ้ทาง (ทดสอบความสามารถของอาวุธโดยไม่ให้ผลของการแพ้ทางมาปน) */
const withWeak = (id: string, weak: WeaponClass, gear: Partial<Gear>): BattleSetup => {
  const spec = battleOf("easy", id) as BattleSpec;
  return battleSetup("easy", { ...spec, forms: spec.forms.map((form) => ({ ...form, weak })) }, "lab", [], { ...DEFAULT_GEAR, ...gear });
};
const easy = (room: number) => (room === 1 ? plain() : setupOf("easy", room === 6 ? "omega" : `k${room}`));
const ROBOT = CAMPAIGN.easy.robotHp;

describe("โครงของระดับความยาก (GDD 15)", () => {
  it("แมพ 1: 6 ห้อง ไคจูประจำห้อง 5 ตัวและบอส 1 ตัว, แมพ 2: 3 ห้อง ไคจู 3 ตัวและบอส 2 ร่าง, แมพ 3: ไม่มีห้องเรียน ไคจู 2 ตัวและบอส 3 ร่าง", () => {
    const shape = (difficulty: Difficulty) => {
      const level = CAMPAIGN[difficulty];
      return [level.zones.length, level.battles.filter((b) => !b.boss).length, level.battles.filter((b) => b.boss).map((b) => b.forms.length)];
    };
    expect(shape("easy")).toEqual([6, 5, [1]]);
    expect(shape("normal")).toEqual([3, 3, [2]]);
    expect(shape("hard")).toEqual([0, 2, [3]]);
  });

  it("แมพ 1 สอนครบ 6 หัวข้อ แมพ 2 ทบทวนหัวข้อ 1–5 ตามลำดับ แมพ 3 ลุยด่านอย่างเดียว บอสอยู่ท้ายสุด และรหัสด่านไม่ซ้ำกันข้ามแมพ", () => {
    const ids = DIFFICULTIES.flatMap((difficulty) => CAMPAIGN[difficulty].battles.map((battle) => battle.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const difficulty of DIFFICULTIES) {
      const level = CAMPAIGN[difficulty];
      expect(level.zones.flatMap((zone) => zone.topics)).toEqual({ easy: [1, 2, 3, 4, 5, 6], normal: [1, 2, 3, 4, 5], hard: [] }[difficulty]);
      // แมพ 1 ต้องมีแกน AI ก่อนออกรบ แมพ 2 และ 3 ออกรบได้เลย (ข้ามการเรียนได้)
      expect(level.roomsNeedCores, difficulty).toBe(difficulty === "easy");
      if (!level.roomsNeedCores) for (const battle of level.battles) expect(battle.requires, battle.id).toEqual([]);
      expect(topicsOf(difficulty)).toEqual(level.zones.flatMap((zone) => zone.topics));
      // แกน AI ที่ด่านต้องใช้เป็นหัวข้อที่แมพนั้นมีห้องให้ทำ
      for (const battle of level.battles) expect(battle.requires.every((topic) => topicsOf(difficulty).includes(topic)), battle.id).toBe(true);
      expect(level.battles.map((battle) => battle.boss)).toEqual([...level.battles.slice(1).map(() => false), true]);
      for (const battle of level.battles) {
        expect(battle.forms.length).toBeGreaterThan(0);
        expect(battle.sources.every((topic) => topic >= 1 && topic <= 6)).toBe(true);
        // ชนะแล้วเปิดห้องถัดไปที่มีอยู่จริง
        if (battle.unlocks !== undefined) expect(battle.unlocks).toBeLessThanOrEqual(level.zones.length);
      }
    }
  });

  it("ยิ่งยาก ตัวช่วยยิ่งน้อย รางวัลยิ่งมาก", () => {
    const levels = DIFFICULTIES.map((difficulty) => CAMPAIGN[difficulty]);
    expect(levels.map((l) => l.battleHints)).toEqual([2, 1, 0]);
    expect(levels.map((l) => l.tutorQuestions)).toEqual([8, 4, 2]);
    expect(levels.map((l) => l.creditMultiplier)).toEqual([1, 1.5, 2]);
    expect(levels.map((l) => l.minTier)).toEqual(["assist", "standard", "challenge"]);
    expect(levels.map((l) => l.stations)).toEqual(["required", "optional", "none"]);
    expect(levels.map((l) => l.review)).toEqual([true, true, false]);
  });
});

describe("ด่านต่อสู้ไคจู (ระดับง่าย)", () => {
  it("ตอบถูกหุ่นโจมตี ตอบผิดไคจูโจมตี และตัวนับถูกติดต่อกันเริ่มใหม่", () => {
    const { state, events } = play(easy(1), [true, false]);
    expect(state).toMatchObject({ kaijuHp: 5, robotHp: ROBOT - 1, streak: 0, turn: 2, correct: 1, status: "fighting" });
    expect(events.map((e) => e.type)).toEqual(["robot-hit", "kaiju-hit"]);
  });

  it("ตอบถูกสองข้อติดกัน พี่บิตยิงเสริม", () => {
    const { state, events } = play(easy(1), [true, true]);
    expect(events.map((e) => e.type)).toEqual(["robot-hit", "robot-hit", "bit-assist"]);
    expect(state.kaijuHp).toBe(6 - 3);
  });

  it("ตอบถูกทุกข้อชนะได้ทุกด่านของทุกระดับโดยหุ่นไม่เสียพลัง", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const battle of CAMPAIGN[difficulty].battles) {
        const setup = setupOf(difficulty, battle.id);
        const { state } = sweep(setup);
        expect(state.status, battle.id).toBe("won");
        expect(state.robotHp, battle.id).toBe(setup.robotMax);
        expect(state.form, battle.id).toBe(battle.forms.length - 1);
      }
    }
  });

  it("ตอบผิดทุกข้อแพ้ แล้วเกมไม่รับคำตอบต่อ", () => {
    const setup = easy(1);
    const { state } = play(setup, Array(ROBOT).fill(false));
    expect(state.status).toBe("lost");
    expect(resolveAnswer(setup, state, true)).toEqual({ state, events: [] });
  });

  it("ออกปฏิบัติการใหม่หลังถอยกลับมาซ่อม: หุ่นพลังเต็ม ไคจูเหลือพลังเท่าเดิม", () => {
    const setup = easy(1);
    expect(startBattle(setup, { carry: { form: 0, kaijuHp: 2 } })).toMatchObject({ robotHp: ROBOT, kaijuHp: 2, status: "fighting" });
    expect(startBattle(setup, { carry: { form: 0, kaijuHp: 0 } }).kaijuHp).toBe(1);
    expect(startBattle(setup, { carry: { form: 0, kaijuHp: 99 } }).kaijuHp).toBe(setup.spec.forms[0].hp);
    const lost = play(setup, [true, ...Array(ROBOT).fill(false)]).state;
    expect(retryCarry(setup, lost)).toEqual({ form: 0, kaijuHp: 5 });
  });

  it("ไคจูชาร์จพลัง (ห้อง 2): ตาที่สามตอบถูกสวนกลับแรง ตอบผิดโดนหนัก", () => {
    const setup = easy(2);
    const before = play(setup, [true, false]).state;
    expect(isCharging(setup, startBattle(setup))).toBe(false);
    expect(isCharging(setup, before)).toBe(true);
    expect(resolveAnswer(setup, before, true).events[0]).toEqual(hit(BATTLE.charge.counterDamage, { counter: true }));
    expect(resolveAnswer(setup, before, false).events[0]).toMatchObject({ type: "kaiju-hit", damage: BATTLE.heavyDamage, heavy: true });
  });

  it("ไคจูฟื้นพลัง (ห้อง 3): ตอบผิดแล้วฟื้น แต่ไม่เกินพลังเต็ม", () => {
    const setup = easy(3);
    const full = setup.spec.forms[0].hp;
    expect(play(setup, [false]).state.kaijuHp).toBe(full);
    const { state, events } = play(setup, [true, false]);
    expect(state.kaijuHp).toBe(full);
    expect(events.at(-1)).toEqual({ type: "kaiju-regen", amount: 1 });
  });

  it("คอมโบ (ห้อง 4): ถูกติดต่อกันยิ่งแรง ไม่เกินค่าสูงสุด", () => {
    // ใช้ดาบ (ไม่ได้เปรียบเกียร์แครบ และยังไม่ถึงข้อที่ติดคริติคอล) ดูผลของคอมโบล้วน ๆ สองข้อแรก แล้วใช้ปืนดูค่าสูงสุด
    const { events } = play(setupOf("easy", "k4", "lab", { weapon: "blaster" }), [true, true, true, true]);
    expect(events.filter((e) => e.type === "robot-hit").map((e) => (e as { damage: number }).damage)).toEqual([1, 2, 3, 3]);
  });

  it("ฝูง (ห้อง 5): เหลือเยอะโจมตีแรง เหลือน้อยโจมตีเบา", () => {
    // ฝูงแพ้ทางลำแสง ทนแรงกระแทก: หมัด (แรงกระแทก) แพ้ทาง การโจมตีแรงจึงแรงขึ้นอีก 1
    expect(play(easy(5), [false]).events[0]).toMatchObject({ damage: BATTLE.heavyDamage + GEAR.weakExposure, heavy: true });
    // ฝูง 12 ตัว: ตอบถูก 7 ข้อติดกัน พี่บิตยิงเสริม 3 ครั้ง เหลือ 2 ตัว
    const few = play(easy(5), [true, true, true, true, true, true, true, false]);
    expect(few.state.kaijuHp).toBe(2);
    expect(few.events.at(-1)).toMatchObject({ damage: BATTLE.wrongDamage, heavy: false });
  });

  it("บอสของระดับง่าย: ไล่โจทย์หัวข้อ 1 ถึง 6 ตามเฟส และหุ่นฟื้นพลังเมื่อผ่านเฟส", () => {
    const setup = easy(6);
    expect(phaseCount(setup, { form: 0 })).toBe(6);
    let state = startBattle(setup);
    const topics = [questionSource(setup, state)];
    state = resolveAnswer(setup, state, false).state;
    for (let i = 0; i < 20 && state.status === "fighting"; i++) {
      state = resolveAnswer(setup, state, true).state;
      if (state.status === "fighting" && questionSource(setup, state) !== topics.at(-1)) topics.push(questionSource(setup, state));
    }
    expect(state.status).toBe("won");
    expect(topics[0]).toBe(1);
    expect(topics).toEqual([...topics].sort((a, b) => a - b));
    expect(state.robotHp).toBe(ROBOT);
    expect(phaseOf(setup, { form: 0, kaijuHp: 1 })).toBe(5);
  });

  it("บอสของระดับง่าย: เฟสครึ่งแรกโจมตีปกติ ตั้งแต่เฟสที่กำหนดโจมตีหนักทุกครั้ง", () => {
    const setup = easy(6);
    const full = setup.spec.forms[0].hp;
    const at = (phase: number) => startBattle(setup, { carry: { form: 0, kaijuHp: full - phase * BATTLE.boss.phaseHp } });
    expect(isFurious(setup, at(0))).toBe(false);
    expect(resolveAnswer(setup, at(BATTLE.boss.heavyFromPhase - 1), false).events[0]).toMatchObject({ damage: BATTLE.wrongDamage, heavy: false });
    expect(isFurious(setup, at(BATTLE.boss.heavyFromPhase))).toBe(true);
    expect(resolveAnswer(setup, at(BATTLE.boss.heavyFromPhase), false).events[0]).toMatchObject({ damage: BATTLE.heavyDamage, heavy: true });
    expect(threatOf(setup, at(5))).toMatchObject({ damage: BATTLE.heavyDamage, heavy: true, saved: null });
  });
});

describe("บอสหลายร่างและลักษณะใหม่ (ระดับกลางและยาก)", () => {
  it("ชนะร่างหนึ่งแล้วกลายร่างต่อ ร่างใหม่พลังเต็ม หุ่นได้ฟื้นพลัง และชนะด่านเมื่อชนะร่างสุดท้าย", () => {
    const setup = setupOf("hard", "end");
    const hurt = play(setup, [false, false]).state;
    let state = hurt;
    const seen: number[] = [];
    for (let i = 0; i < 80 && state.status === "fighting"; i++) {
      const result = resolveAnswer(setup, state, true);
      for (const event of result.events) {
        if (event.type !== "transform") continue;
        seen.push(event.form);
        expect(result.state.kaijuHp).toBe(setup.spec.forms[event.form].hp);
        expect(result.state.status).toBe("fighting");
      }
      state = result.state;
    }
    expect(seen).toEqual([1, 2]);
    expect(state).toMatchObject({ status: "won", form: 2 });
    expect(state.robotHp).toBeGreaterThan(hurt.robotHp);
  });

  it("โจทย์ของบอสหลายร่างวนครบทุกหัวข้อ", () => {
    const setup = setupOf("hard", "end");
    let state = startBattle(setup);
    const topics = new Set<number>();
    for (let i = 0; i < 80 && state.status === "fighting"; i++) {
      topics.add(questionSource(setup, state));
      state = resolveAnswer(setup, state, true).state;
    }
    expect([...topics].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("เกราะ: ตอบถูกข้อแรกทำให้เกราะแตกโดยไม่เสียพลัง ข้อถัดไปจึงโจมตีเข้า ตอบผิดแล้วเกราะกลับมา", () => {
    const setup = setupOf("normal", "n2");
    const full = setup.spec.forms[0].hp;
    expect(startBattle(setup).armored).toBe(true);
    const first = play(setup, [true]);
    expect(first.events.map((e) => e.type)).toEqual(["armor-break"]);
    expect(first.state).toMatchObject({ kaijuHp: full, armored: false });
    const second = play(setup, [true, true]);
    expect(second.state.kaijuHp).toBeLessThan(full);
    expect(play(setup, [true, false]).state.armored).toBe(true);
  });

  it("คลั่ง: พลังเหลือไม่เกินครึ่ง ตอบผิดโดนหนักทุกครั้ง", () => {
    const setup = setupOf("hard", "end");
    const full = setup.spec.forms[2].hp;
    const fresh = startBattle(setup, { carry: { form: 2, kaijuHp: full } });
    expect(isEnraged(setup, fresh)).toBe(false);
    expect(resolveAnswer(setup, fresh, false).events[0]).toMatchObject({ damage: BATTLE.wrongDamage, heavy: false });
    const low = startBattle(setup, { carry: { form: 2, kaijuHp: Math.ceil(full / 2) } });
    expect(isEnraged(setup, low)).toBe(true);
    expect(resolveAnswer(setup, low, false).events[0]).toMatchObject({ damage: BATTLE.heavyDamage, heavy: true });
  });

  it("แพ้แล้วออกปฏิบัติการใหม่: ระดับกลางพลังของร่างปัจจุบันเหลือเท่าเดิม ระดับยากร่างปัจจุบันกลับมาพลังเต็ม ร่างที่ชนะแล้วไม่ต้องสู้ซ้ำ", () => {
    const normal = setupOf("normal", "omega-n");
    const hard = setupOf("hard", "end");
    const state = (setup: BattleSetup): BattleState => ({ ...startBattle(setup, { carry: { form: 1, kaijuHp: 3 } }), robotHp: 0, status: "lost" });
    expect(retryCarry(normal, state(normal))).toEqual({ form: 1, kaijuHp: 3 });
    expect(retryCarry(hard, state(hard))).toEqual({ form: 1, kaijuHp: hard.spec.forms[1].hp });
    expect(startBattle(hard, { carry: retryCarry(hard, state(hard)) })).toMatchObject({ form: 1, robotHp: hard.robotMax, armored: formOf(hard, { form: 1 }).trait === "armor" });
  });
});

describe("ของจากร้านและเครื่องแบบ (GDD 13)", () => {
  it("ชุดซ่อมฟื้นพลังไม่เกินพลังเต็ม โล่กันการโจมตีหนึ่งครั้ง", () => {
    const setup = easy(1);
    const fresh = startBattle(setup);
    expect(applySupply(setup, fresh, "repair-kit")).toBeNull();
    const hurt = play(setup, [false, false]).state;
    expect(applySupply(setup, hurt, "repair-kit")?.state.robotHp).toBe(ROBOT);
    const shielded = applySupply(setup, hurt, "shield");
    expect(shielded?.state.shield).toBe(true);
    expect(applySupply(setup, shielded!.state, "shield")).toBeNull();
    const blocked = resolveAnswer(setup, shielded!.state, false);
    expect(blocked.events[0]).toMatchObject({ type: "kaiju-hit", damage: 0, blocked: true });
    expect(blocked.state).toMatchObject({ robotHp: hurt.robotHp, shield: false });
  });

  it("แบตเตอรี่เสริม: การโจมตีครั้งถัดไปแรง 2 เท่า ใช้ได้ครั้งเดียว และไม่เสียไปกับการทุบเกราะ", () => {
    const setup = easy(1);
    const boosted = applySupply(setup, startBattle(setup), "overcharge");
    expect(boosted?.events).toEqual([{ type: "boost" }]);
    expect(applySupply(setup, boosted!.state, "overcharge")).toBeNull();
    const struck = resolveAnswer(setup, boosted!.state, true);
    expect(struck.events[0]).toEqual(hit(BATTLE.hit * 2, { boosted: true }));
    expect(struck.state.boost).toBe(false);
    const armored = setupOf("normal", "n2");
    const kept = resolveAnswer(armored, applySupply(armored, startBattle(armored), "overcharge")!.state, true);
    expect(kept.state).toMatchObject({ boost: true, armored: false });
  });

  it("แกนสำรอง: พลังหมดแล้วฟื้นขึ้นมาหนึ่งครั้ง ครั้งที่สองแพ้", () => {
    const setup = easy(1);
    const first = play(setup, Array(ROBOT).fill(false), startBattle(setup, { reboot: true }));
    expect(first.events.at(-1)).toEqual({ type: "reboot", amount: BATTLE.rebootHeal });
    expect(first.state).toMatchObject({ status: "fighting", robotHp: BATTLE.rebootHeal, reboot: false });
    expect(play(setup, Array(BATTLE.rebootHeal).fill(false), first.state).state.status).toBe("lost");
  });

  it("เครื่องแบบให้สิทธิพิเศษคนละอย่าง ชุดเริ่มต้นไม่มี", () => {
    const base = setupOf("normal", "n1", "lab");
    expect(base).toMatchObject({ robotMax: CAMPAIGN.normal.robotHp, hints: CAMPAIGN.normal.battleHints, assistDamage: BATTLE.assistDamage, repairHeal: BATTLE.repairKitHeal, startShield: false });
    expect(setupOf("normal", "n1", "engineer").repairHeal).toBe(BATTLE.repairKitHeal + BATTLE.perks.engineerHeal);
    expect(setupOf("normal", "n1", "pilot").startShield).toBe(true);
    expect(startBattle(setupOf("normal", "n1", "pilot")).shield).toBe(true);
    expect(setupOf("hard", "end", "researcher").hints).toBe(BATTLE.perks.researcherHints);
    expect(setupOf("normal", "n1", "guardian").robotMax).toBe(CAMPAIGN.normal.robotHp + BATTLE.perks.guardianHp);
    expect(setupOf("normal", "n1", "commander").assistDamage).toBe(BATTLE.perks.commanderAssist);
    expect(setupOf("normal", "n1", "hero").robotMax).toBe(CAMPAIGN.normal.robotHp + BATTLE.perks.heroHp);
    expect(setupOf("normal", "n1", "ninja").dodges).toBe(BATTLE.perks.ninjaDodges);
    // ทุกชุดในร้านให้อะไรบางอย่างที่ต่างจากชุดเริ่มต้น (ชุดนักบินอวกาศให้ที่กระเป๋า ไม่ใช่ในการต่อสู้โดยตรง: bagSizeOf)
    for (const outfit of OUTFITS.filter((o) => o !== "lab" && o !== "astronaut")) expect(setupOf("normal", "n1", outfit), outfit).not.toEqual(base);
    expect(bagSizeOf("astronaut")).toBe(BAG_SIZE + 1);
    expect(bagSizeOf("lab")).toBe(BAG_SIZE);
  });

  it("โมดูลอัปเกรดของพี่บิต: เลเซอร์ยิงเสริมแรงขึ้น สแกนเนอร์ขอข้อมูลได้เพิ่ม พยาบาลฟื้นพลังเมื่อยิงเสริม และใช้ร่วมกับเครื่องแบบได้", () => {
    const spec = battleOf("easy", "k1") as BattleSpec;
    const base = battleSetup("easy", spec, "lab");
    expect(base.assistHeal).toBe(0);
    expect(battleSetup("easy", spec, "lab", ["laser"]).assistDamage).toBe(BATTLE.assistDamage + BATTLE.modules.laserAssist);
    expect(battleSetup("easy", spec, "commander", ["laser"]).assistDamage).toBe(BATTLE.perks.commanderAssist + BATTLE.modules.laserAssist);
    expect(battleSetup("hard", battleOf("hard", "end") as BattleSpec, "lab", ["scanner"]).hints).toBe(BATTLE.modules.scannerHints);
    expect(battleSetup("easy", spec, "researcher", ["scanner"]).hints).toBe(base.hints + BATTLE.perks.researcherHints + BATTLE.modules.scannerHints);

    const medic = battleSetup("easy", battleOf("easy", "k2") as BattleSpec, "lab", ["medic"]);
    // เสียพลัง 1 แล้วตอบถูกสองข้อติดกัน: พี่บิตยิงเสริมและซ่อมการ์เดียน 1
    const healed = play(medic, [false, true, true]);
    expect(healed.events.map((e) => e.type)).toEqual(["kaiju-hit", "robot-hit", "robot-hit", "bit-assist", "bit-heal"]);
    expect(healed.state.robotHp).toBe(medic.robotMax);
    // พลังเต็มอยู่แล้ว: ไม่มีอะไรให้ซ่อม
    expect(play(medic, [true, true]).events.map((e) => e.type)).toEqual(["robot-hit", "robot-hit", "bit-assist"]);
  });
});

describe("อุปกรณ์ของการ์เดียน: อาวุธ เกราะ ชิป (GDD 13 และ 17)", () => {
  it("อุปกรณ์เริ่มต้นไม่มีผลพิเศษ การโจมตีเป็นไปตามกติกาพื้นฐาน", () => {
    const setup = easy(1);
    expect(setup).toMatchObject({ gear: DEFAULT_GEAR, guards: 0, retries: 0, robotMax: ROBOT });
    expect(startBattle(setup)).toMatchObject({ stunned: false, guard: 0, retries: 0, opening: false });
    expect(play(setup, [true, true, true]).events.filter((e) => e.type === "robot-hit")).toEqual([hit(1), hit(1), hit(1)]);
  });

  it("ดาบพลังงาน: ตอบถูกติดกันครบ 3 ข้อทุกครั้ง การโจมตีครั้งนั้นเป็นคริติคอลแรง 2 เท่า ตอบผิดแล้วต้องนับใหม่", () => {
    // ด่านคอมโบที่ดาบพอใช้ได้ (ไคจูแพ้ทางลำแสง): แรง 1, 2 แล้วข้อที่สามแรง 3 × 2
    const setup = withWeak("k4", "beam", { weapon: "sword" });
    const hits = play(setup, [true, true, true, true]).events.filter((e) => e.type === "robot-hit");
    expect(hits).toEqual([hit(1), hit(2), hit(3 * GEAR.critMultiplier, { crit: true }), hit(3)]);
    const broken = play(setupOf("easy", "k1", "lab", { weapon: "sword" }), [true, true, false, true, true]).events.filter((e) => e.type === "robot-hit");
    expect(broken.every((e) => !(e as { crit: boolean }).crit)).toBe(true);
  });

  it("คริติคอลไม่ซ้อนกับแบตเตอรี่เสริม: ตาที่ติดคริติคอลเก็บแบตเตอรี่ไว้ใช้ครั้งถัดไป", () => {
    const setup = setupOf("easy", "k2", "lab", { weapon: "sword" });
    const two = play(setup, [true, true]).state;
    const boosted = applySupply(setup, two, "overcharge")!.state;
    const crit = resolveAnswer(setup, boosted, true);
    // ตาที่สามของด่านชาร์จ: (สวนกลับ 2 + ดาบได้เปรียบไตรฮอร์น 1) × คริติคอล 2
    expect(crit.events[0]).toEqual(hit((BATTLE.charge.counterDamage + GEAR.advantage) * 2, { counter: true, crit: true, advantage: true }));
    expect(crit.state.boost).toBe(true);
    // การโจมตีนี้ปิดฉากไตรฮอร์นพอดี (พลัง 14: 1 + 2 + พี่บิต 1 + 6 + 4)
    expect(resolveAnswer(setup, crit.state, true).events[0]).toEqual(hit((BATTLE.hit + GEAR.advantage) * 2, { boosted: true, advantage: true, final: true }));
  });

  it("ปืนเลเซอร์: ตอบถูกติดกันครบ 3 ข้อ ไคจูติดสตัน ตอบผิดครั้งถัดไปไคจูไม่ได้โจมตี ไม่ฟื้นพลัง แล้วสตันหมด", () => {
    const setup = setupOf("easy", "k3", "lab", { weapon: "blaster" });
    const stunned = play(setup, [true, true, true]);
    expect(stunned.events.map((e) => e.type)).toEqual(["robot-hit", "robot-hit", "bit-assist", "robot-hit", "stun"]);
    expect(stunned.state.stunned).toBe(true);
    expect(threatOf(setup, stunned.state)).toMatchObject({ saved: "stun", regen: 0 });
    const missed = resolveAnswer(setup, stunned.state, false);
    expect(missed.events).toEqual([{ type: "kaiju-stunned" }]);
    expect(missed.state).toMatchObject({ robotHp: setup.robotMax, kaijuHp: stunned.state.kaijuHp, stunned: false, streak: 0, turn: 4 });
    // สตันหมดแล้ว: ตอบผิดอีกครั้งโดนตามปกติและไคจูฟื้นพลัง
    expect(resolveAnswer(setup, missed.state, false).events.map((e) => e.type)).toEqual(["kaiju-hit", "kaiju-regen"]);
  });

  it("สตันกันไม่ให้เกราะของไคจูกลับมา", () => {
    const setup = setupOf("normal", "n2", "lab", { weapon: "blaster" });
    const stunned = play(setup, [true, true, true]).state;
    expect(stunned).toMatchObject({ armored: false, stunned: true });
    expect(resolveAnswer(setup, stunned, false).state.armored).toBe(false);
    expect(resolveAnswer(setup, { ...stunned, stunned: false }, false).events.map((e) => e.type)).toEqual(["kaiju-hit", "kaiju-rearm"]);
  });

  it("เกราะหนักเพิ่มพลังสูงสุด ใช้ร่วมกับชุดเกราะผู้พิทักษ์ได้", () => {
    expect(setupOf("easy", "k1", "lab", { armor: "heavy" }).robotMax).toBe(ROBOT + GEAR.heavy.hp);
    expect(setupOf("easy", "k1", "guardian", { armor: "heavy" }).robotMax).toBe(ROBOT + GEAR.heavy.hp + BATTLE.perks.guardianHp);
    expect(robotMaxOf("hard", "lab", { ...DEFAULT_GEAR, armor: "heavy" })).toBe(CAMPAIGN.hard.robotHp + GEAR.heavy.hp);
  });

  it("เกราะสะท้อน: กันการโจมตีครั้งแรกของไคจูแต่ละร่างให้เอง ครั้งที่สองโดนตามปกติ", () => {
    const setup = setupOf("hard", "end", "lab", { armor: "guard" });
    const first = resolveAnswer(setup, startBattle(setup), false);
    expect(first.events).toEqual([{ type: "kaiju-hit", damage: 0, blocked: true, heavy: false, by: "guard" }]);
    expect(first.state).toMatchObject({ robotHp: setup.robotMax, guard: 0 });
    expect(resolveAnswer(setup, first.state, false).events[0]).toMatchObject({ blocked: false, damage: BATTLE.wrongDamage });
    // ชนะร่างแรกแล้ว: เกราะสะท้อนพร้อมกันร่างที่สองอีกครั้ง
    let state = first.state;
    for (let i = 0; i < 40 && state.form === 0; i++) state = resolveAnswer(setup, state, true).state;
    expect(state).toMatchObject({ form: 1, guard: GEAR.guard.blocksPerForm });
  });

  it("ชิปคิดทบทวน: ตอบผิดแล้วได้ตอบข้อเดิมอีกครั้ง ตานั้นยังไม่จบ ใช้ได้ครั้งเดียวต่อการออกปฏิบัติการ", () => {
    const setup = setupOf("easy", "k1", "lab", { chip: "retry" });
    const two = play(setup, [true]).state;
    const again = resolveAnswer(setup, two, false);
    expect(again.events).toEqual([{ type: "second-chance", left: 0 }]);
    expect(again.state).toEqual({ ...two, retries: 0 });
    // ตอบใหม่ถูก: โจมตีต่อและนับถูกติดต่อกันต่อจากเดิม
    expect(resolveAnswer(setup, again.state, true).state).toMatchObject({ streak: 2, turn: 2, correct: 2 });
    // ตอบใหม่ผิดอีก: โดนตามปกติ ไม่มีสิทธิ์ตอบใหม่แล้ว
    expect(resolveAnswer(setup, again.state, false).events[0]).toMatchObject({ type: "kaiju-hit", blocked: false });
    expect(startBattle(setup).retries).toBe(GEAR.retry.chances);
  });

  it("ชิปเร่งพลัง: การโจมตีครั้งแรกใส่ไคจูแต่ละร่างแรง 2 เท่า ไม่เสียไปกับการทุบเกราะ", () => {
    const setup = setupOf("easy", "k1", "lab", { chip: "charger" });
    expect(play(setup, [true, false, true]).events.filter((e) => e.type === "robot-hit")).toEqual([hit(2, { opening: true }), hit(1)]);
    const armored = setupOf("normal", "n2", "lab", { chip: "charger" });
    const opened = play(armored, [true, true]);
    expect(opened.events.map((e) => e.type)).toEqual(["armor-break", "robot-hit", "bit-assist"]);
    // ข้อที่สองที่ตอบถูกติดกัน หมัดได้เปรียบเกียร์แครบของแมพ 2: (1 + 1) × 2
    expect(opened.events[1]).toEqual(hit((BATTLE.hit + GEAR.advantage) * 2, { opening: true, advantage: true }));
    // กลายร่างแล้วพร้อมใช้อีกครั้ง
    const boss = setupOf("normal", "omega-n", "lab", { chip: "charger" });
    let state = startBattle(boss);
    for (let i = 0; i < 40 && state.form === 0; i++) state = resolveAnswer(boss, state, true).state;
    expect(state).toMatchObject({ form: 1, opening: true });
  });

  it("ลำดับของตัวช่วยเมื่อตอบผิด: ชิปคิดทบทวน สตัน เกราะสะท้อน แล้วจึงโล่พลังงาน", () => {
    const setup = setupOf("easy", "k1", "pilot", { weapon: "blaster", armor: "guard", chip: "retry" });
    let state: BattleState = { ...startBattle(setup), stunned: true };
    const saved: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      saved.push(threatOf(setup, state).saved);
      state = resolveAnswer(setup, state, false).state;
    }
    expect(saved).toEqual(["retry", "stun", "guard", "shield", null]);
    expect(state.robotHp).toBe(setup.robotMax - BATTLE.wrongDamage);
  });

  it("ท่าปิดฉาก: การโจมตีที่ทำให้ร่างสุดท้ายพลังหมดมี final ส่วนร่างที่ยังกลายร่างต่อไม่มี", () => {
    const boss = setupOf("normal", "omega-n");
    const { events, state } = sweep(boss);
    expect(state.status).toBe("won");
    const hits = events.filter((e): e is Extract<BattleEvent, { type: "robot-hit" }> => e.type === "robot-hit");
    expect(hits.filter((e) => e.final)).toHaveLength(1);
    expect(hits.at(-1)?.final || events.at(-1)?.type === "bit-assist").toBe(true);
  });

  it("แผงคำสั่งบอกล่วงหน้าตรงกับผลจริงทุกตา ทุกด่าน ทุกชุดอุปกรณ์", () => {
    const random = seeded(11);
    const gears: Gear[] = [DEFAULT_GEAR, { weapon: "sword", armor: "guard", chip: "retry" }, { weapon: "blaster", armor: "heavy", chip: "charger" }];
    for (const difficulty of DIFFICULTIES) {
      for (const battle of CAMPAIGN[difficulty].battles) {
        for (const gear of gears) {
          const setup = setupOf(difficulty, battle.id, "lab", gear);
          let state = startBattle(setup, { reboot: true });
          for (let i = 0; i < 200 && state.status === "fighting"; i++) {
            const strike = strikeOf(setup, state);
            const threat = threatOf(setup, state);
            const correct = random() < 0.6;
            const result = resolveAnswer(setup, state, correct);
            const types = result.events.map((e) => e.type);
            if (correct) {
              const struck = result.events.find((e) => e.type === "robot-hit") as Extract<BattleEvent, { type: "robot-hit" }> | undefined;
              expect(types.includes("armor-break")).toBe(strike.armorBreak);
              expect(struck?.damage ?? 0).toBe(strike.damage);
              expect(struck?.crit ?? false).toBe(strike.crit);
              expect(types.includes("bit-assist")).toBe(strike.assist > 0);
              if (result.state.status === "fighting" && result.state.form === state.form) expect(types.includes("stun")).toBe(strike.stuns);
            } else {
              const struck = result.events.find((e) => e.type === "kaiju-hit") as Extract<BattleEvent, { type: "kaiju-hit" }> | undefined;
              expect(types.includes("second-chance")).toBe(threat.saved === "retry");
              expect(types.includes("kaiju-stunned")).toBe(threat.saved === "stun");
              if (struck) expect([struck.blocked, struck.heavy, struck.blocked ? 0 : threat.damage]).toEqual([threat.saved === "guard" || threat.saved === "shield", threat.heavy, struck.damage]);
              expect(types.includes("kaiju-regen")).toBe(threat.regen > 0);
              expect(types.includes("kaiju-rearm")).toBe(threat.rearm);
            }
            state = result.state;
          }
        }
      }
    }
  });

  it("อาวุธได้เปรียบ: ประเภทตรงกับจุดอ่อนของคู่ต่อสู้ แรงขึ้นเมื่อตอบถูกติดกันตั้งแต่ 2 ข้อ อาวุธประเภทอื่นไม่ได้", () => {
    // ไตรฮอร์นแพ้ทางคมอาวุธ: ดาบได้เปรียบ หมัดและปืนไม่ได้
    const sword = play(setupOf("easy", "k2", "lab", { weapon: "sword" }), [true, true]).events.filter((e) => e.type === "robot-hit");
    expect(sword).toEqual([hit(1), hit(1 + GEAR.advantage, { advantage: true })]);
    for (const weapon of ["fist", "blaster"] as const) {
      const hits = play(setupOf("easy", "k2", "lab", { weapon }), [true, true]).events.filter((e) => e.type === "robot-hit");
      expect(hits, weapon).toEqual([hit(1), hit(1)]);
    }
    // ตอบผิดแล้วต้องตอบถูกติดกันใหม่จึงได้เปรียบอีก
    const broken = play(setupOf("easy", "k2", "lab", { weapon: "sword" }), [true, false, true]).events.filter((e) => e.type === "robot-hit");
    expect(broken.every((e) => !(e as { advantage: boolean }).advantage)).toBe(true);
    expect(strikeOf(setupOf("easy", "k2", "lab", { weapon: "sword" }), startBattle(setupOf("easy", "k2", "lab", { weapon: "sword" }))).advantage).toBe(false);
    // ด่านแรกแพ้ทางหมัด: อุปกรณ์เริ่มต้นได้เปรียบตั้งแต่ยังไม่ซื้ออะไร
    expect(play(setupOf("easy", "k1"), [true, true]).events.filter((e) => e.type === "robot-hit")).toEqual([hit(1), hit(2, { advantage: true })]);
  });

  it("คู่ต่อสู้ทุกร่างมีจุดอ่อน และอาวุธแต่ละประเภทได้เปรียบอย่างน้อยหนึ่งด่านในแมพ 1 และแมพ 2", () => {
    for (const difficulty of DIFFICULTIES) for (const battle of CAMPAIGN[difficulty].battles) for (const form of battle.forms) expect(WEAPON_CLASSES, `${battle.id} ${form.art}`).toContain(form.weak);
    for (const difficulty of ["easy", "normal"] as const) {
      const weak = new Set(CAMPAIGN[difficulty].battles.flatMap((battle) => battle.forms.map((form) => form.weak)));
      expect([...weak].sort(), difficulty).toEqual([...WEAPON_CLASSES].sort());
    }
    // บอสของแมพ 3 แต่ละร่างแพ้ทางอาวุธคนละประเภท: อาวุธชิ้นเดียวชนะทางได้ร่างเดียว และแพ้ทางอีกร่างหนึ่งเสมอ
    expect(new Set(CAMPAIGN.hard.battles.at(-1)!.forms.map((form) => form.weak)).size).toBe(3);
    // อาวุธมีประเภทละ 2 แบบ
    for (const kind of WEAPON_CLASSES) expect(Object.values(WEAPON).filter((spec) => spec.class === kind), kind).toHaveLength(2);
  });

  it("ตีเกินพลังที่คู่ต่อสู้เหลือ: บันทึกส่วนที่เกิน (wasted) แถบพลังจึงลดน้อยกว่าตัวเลขได้ และส่วนที่เกินไม่ทบไปร่างถัดไป", () => {
    const setup = plain();
    // แบตเตอรี่เสริมแรง 2 เท่า แต่ไคจูเหลือพลัง 1
    const boosted = resolveAnswer(setup, { ...startBattle(setup), kaijuHp: 1, boost: true }, true);
    expect(boosted.events[0]).toMatchObject({ type: "robot-hit", damage: 2, wasted: 1, final: true });
    expect(boosted.state.kaijuHp).toBe(0);
    // ตีพอดี: ไม่มีส่วนเกิน และพี่บิตไม่ยิงเสริมใส่คู่ต่อสู้ที่หมดพลังแล้ว
    const exact = resolveAnswer(setup, { ...startBattle(setup), kaijuHp: 1, streak: 1 }, true);
    expect(exact.events.find((e) => e.type === "robot-hit")).not.toHaveProperty("wasted");
    expect(exact.events.some((e) => e.type === "bit-assist")).toBe(false);
  });

  it("ชนะทาง แพ้ทาง พอใช้ได้: ทุกอาวุธชนะทางร่างที่แพ้ทางประเภทของมัน แพ้ทางร่างที่ทนประเภทของมัน วนเป็นวงสามประเภท", () => {
    for (const weak of WEAPON_CLASSES) {
      expect(resistOf(weak)).not.toBe(weak);
      for (const weapon of WEAPONS) {
        const kind = WEAPON[weapon].class;
        expect(matchupOf(weapon, weak), `${weapon} vs ${weak}`).toBe(kind === weak ? "strong" : kind === resistOf(weak) ? "weak" : "even");
      }
    }
    expect(new Set(WEAPON_CLASSES.map(resistOf)).size).toBe(3);
  });

  it("ชนะทางตีแรงขึ้นและอึดขึ้น แพ้ทางตีเบาลงและอ่อนแอลง พอใช้ได้ตีปกติ (ฝูงแพ้ทางลำแสง ทนแรงกระแทก)", () => {
    const blaster = withWeak("k5", "beam", { weapon: "blaster" });
    const sword = withWeak("k5", "beam", { weapon: "sword" });
    const hammer = withWeak("k5", "beam", { weapon: "hammer" });
    expect([blaster, sword, hammer].map((setup) => strikeOf(setup, startBattle(setup)).matchup)).toEqual(["strong", "even", "weak"]);
    // อึด: การโจมตีแรงของคู่ต่อสู้เบาลงเมื่อชนะทาง แรงขึ้นเมื่อแพ้ทาง
    expect([blaster, sword, hammer].map((setup) => play(setup, [false]).events[0])).toEqual(
      [BATTLE.heavyDamage - GEAR.strongGuard, BATTLE.heavyDamage, BATTLE.heavyDamage + GEAR.weakExposure].map((damage) => expect.objectContaining({ type: "kaiju-hit", damage, heavy: true })),
    );
    // ตีแรง: ชนะทางแรงขึ้นตั้งแต่ข้อที่ตอบถูกติดกันข้อที่ 2
    const damage = (setup: BattleSetup) => play(setup, [true, true]).events.filter((e) => e.type === "robot-hit").map((e) => (e as { damage: number }).damage);
    expect(damage(blaster)).toEqual([BATTLE.hit, BATTLE.hit + GEAR.advantage]);
    expect(damage(sword)).toEqual([BATTLE.hit, BATTLE.hit]);
    // แพ้ทาง: ความสามารถพิเศษของอาวุธไม่ทำงาน (ค้อนไม่ทุบสะเทือน)
    expect(play(hammer, [true, true, true]).events.some((e) => e.type === "robot-hit" && e.quake)).toBe(false);
    expect(play(withWeak("k5", "blade", { weapon: "hammer" }), [true, true, true]).events.some((e) => e.type === "robot-hit" && e.quake)).toBe(true);
  });

  it("ค้อนพลังงาน: ทุบทะลุเกราะและโจมตีเข้าในครั้งเดียว และตอบถูกติดกันครบ 3 ข้อทุบสะเทือนแรงขึ้น", () => {
    // ไคจูแพ้ทางคมอาวุธ ทนลำแสง: ค้อน (แรงกระแทก) พอใช้ได้
    const setup = battleSetup("easy", { ...PLAIN, forms: [{ art: "kaiju_4", hp: 12, trait: "armor", weak: "blade" }] }, "lab", [], { ...DEFAULT_GEAR, weapon: "hammer" });
    expect(startBattle(setup).armored).toBe(true);
    const first = play(setup, [true]);
    expect(first.events).toEqual([{ type: "armor-break", pierced: true }, hit(1)]);
    expect(first.state).toMatchObject({ armored: false, kaijuHp: 11 });
    expect(strikeOf(setup, startBattle(setup))).toMatchObject({ armorBreak: false, pierced: true, damage: 1 });
    // ข้อที่สาม: ทุบสะเทือน +2
    const third = play(setup, [true, true, true]).events.filter((e) => e.type === "robot-hit");
    expect(third).toEqual([hit(1), hit(1), hit(1 + GEAR.quakeDamage, { quake: true })]);
    // ตอบผิดแล้วเกราะกลับมา ค้อนก็ยังทุบทะลุได้อีก
    const again = play(setup, [true, false, true]);
    expect(again.events.map((e) => e.type)).toEqual(["armor-break", "robot-hit", "kaiju-hit", "kaiju-rearm", "armor-break", "robot-hit"]);
  });

  it("หอกสายฟ้าและปืนใหญ่พลาสม่า: ความสามารถเดียวกับดาบและปืนเลเซอร์ แต่ทำงานทุก 2 ข้อที่ตอบถูกติดกัน", () => {
    const lance = play(plain("lab", { weapon: "lance" }), [true, true, true, true]).events.filter((e) => e.type === "robot-hit");
    // คู่ต่อสู้ของด่านทดสอบแพ้ทางคมอาวุธ: หอกได้เปรียบด้วย
    expect(lance.map((e) => [(e as { damage: number }).damage, (e as { crit: boolean }).crit])).toEqual([[1, false], [(1 + GEAR.advantage) * 2, true]].slice(0, lance.length));
    // ปืนใหญ่ (ลำแสง) แพ้ทางคู่ต่อสู้ของด่านทดสอบ (ทนลำแสง) จึงทดสอบกับคู่ต่อสู้ที่แพ้ทางแรงกระแทกแทน (พอใช้ได้)
    const cannon = play(withWeak("k1", "strike", { weapon: "cannon" }), [true, true]);
    expect(cannon.events.map((e) => e.type)).toEqual(["robot-hit", "robot-hit", "stun", "bit-assist"]);
    expect(cannon.state.stunned).toBe(true);
    expect([WEAPON.sword.critEvery, WEAPON.lance.critEvery, WEAPON.blaster.stunEvery, WEAPON.cannon.stunEvery]).toEqual([3, 2, 3, 2]);
  });

  it("เกราะไททันเพิ่มพลังสูงสุดมากกว่าเกราะหนัก", () => {
    expect(plain("lab", { armor: "titan" }).robotMax).toBe(ROBOT + GEAR.titan.hp);
    expect(GEAR.titan.hp).toBeGreaterThan(GEAR.heavy.hp);
  });

  it("ชุดไซเบอร์นินจา: หลบการโจมตีครั้งแรกของการออกปฏิบัติการ (ก่อนเกราะสะท้อนและโล่) ครั้งถัดไปโดนตามปกติ", () => {
    const setup = plain("ninja");
    expect(startBattle(setup).dodge).toBe(BATTLE.perks.ninjaDodges);
    expect(threatOf(setup, startBattle(setup)).saved).toBe("dodge");
    const first = resolveAnswer(setup, startBattle(setup), false);
    expect(first.events).toEqual([{ type: "kaiju-hit", damage: 0, blocked: true, heavy: false, by: "dodge" }]);
    expect(first.state).toMatchObject({ robotHp: setup.robotMax, dodge: 0 });
    expect(resolveAnswer(setup, first.state, false).events[0]).toMatchObject({ blocked: false, damage: BATTLE.wrongDamage });
    // ลำดับ: ชิปคิดทบทวน → สตัน → หลบ → เกราะสะท้อน → โล่
    const all = battleSetup("easy", PLAIN, "ninja", [], { weapon: "blaster", armor: "guard", chip: "retry" });
    let state: BattleState = { ...startBattle(all), stunned: true, shield: true };
    const saved: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      saved.push(threatOf(all, state).saved);
      state = resolveAnswer(all, state, false).state;
    }
    expect(saved).toEqual(["retry", "stun", "dodge", "guard", "shield", null]);
  });
});
