import { describe, expect, it } from "vitest";
import { applySupply, type BattleSetup, type BattleState, battleSetup, formOf, isCharging, isEnraged, phaseCount, phaseOf, questionSource, resolveAnswer, retryCarry, startBattle } from "./battle";
import { BATTLE } from "./battle.config";
import { type BattleSpec, battleOf, CAMPAIGN, type Difficulty, DIFFICULTIES } from "./campaign";
import { OUTFITS } from "./shop.config";

const setupOf = (difficulty: Difficulty, id: string, outfit: (typeof OUTFITS)[number] = "lab", parts = 0): BattleSetup => battleSetup(difficulty, battleOf(difficulty, id) as BattleSpec, outfit, parts);

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

const easy = (room: number) => setupOf("easy", room === 6 ? "omega" : `k${room}`);
const ROBOT = CAMPAIGN.easy.robotHp;

describe("โครงของระดับความยาก (GDD 15)", () => {
  it("ง่าย 6 ห้อง ไคจูประจำห้อง 5 ตัวและบอส 1 ตัว, กลาง 3 ห้อง ไคจู 3 ตัวและบอส 2 ร่าง, ยาก 1 ห้อง บอส 3 ร่าง", () => {
    const shape = (difficulty: Difficulty) => {
      const level = CAMPAIGN[difficulty];
      return [level.zones.length, level.battles.filter((b) => !b.boss).length, level.battles.filter((b) => b.boss).map((b) => b.forms.length)];
    };
    expect(shape("easy")).toEqual([6, 5, [1]]);
    expect(shape("normal")).toEqual([3, 3, [2]]);
    expect(shape("hard")).toEqual([1, 0, [3]]);
  });

  it("ทุกระดับสอนครบ 6 หัวข้อตามลำดับ บอสอยู่ท้ายสุด และรหัสด่านไม่ซ้ำกันข้ามระดับ", () => {
    const ids = DIFFICULTIES.flatMap((difficulty) => CAMPAIGN[difficulty].battles.map((battle) => battle.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const difficulty of DIFFICULTIES) {
      const level = CAMPAIGN[difficulty];
      expect(level.zones.flatMap((zone) => zone.topics)).toEqual([1, 2, 3, 4, 5, 6]);
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
    expect(resolveAnswer(setup, before, true).events[0]).toEqual({ type: "robot-hit", damage: BATTLE.charge.counterDamage, counter: true, boosted: false });
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
    const { events } = play(easy(4), [true, true, true, true]);
    expect(events.filter((e) => e.type === "robot-hit").map((e) => (e as { damage: number }).damage)).toEqual([1, 2, 3, 3]);
  });

  it("ฝูง (ห้อง 5): เหลือเยอะโจมตีแรง เหลือน้อยโจมตีเบา", () => {
    expect(play(easy(5), [false]).events[0]).toMatchObject({ damage: BATTLE.heavyDamage, heavy: true });
    const few = play(easy(5), [true, true, false]);
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
    const hit = resolveAnswer(setup, boosted!.state, true);
    expect(hit.events[0]).toEqual({ type: "robot-hit", damage: BATTLE.hit * 2, counter: false, boosted: true });
    expect(hit.state.boost).toBe(false);
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
    // ทุกชุดในร้านให้อะไรบางอย่างที่ต่างจากชุดเริ่มต้น
    for (const outfit of OUTFITS.filter((o) => o !== "lab")) expect(setupOf("normal", "n1", outfit), outfit).not.toEqual(base);
  });

  it("ชิ้นส่วนอัปเกรดจากไคจูที่ชนะแล้วเพิ่มพลังสูงสุดของการ์เดียน ไม่เกินจำนวนสูงสุด", () => {
    expect(setupOf("easy", "k3", "lab", 2).robotMax).toBe(ROBOT + 2 * BATTLE.armorPerWin);
    expect(setupOf("easy", "omega", "lab", 5).robotMax).toBe(ROBOT + BATTLE.armorMax * BATTLE.armorPerWin);
  });

  it("โมดูลอัปเกรดของพี่บิต: เลเซอร์ยิงเสริมแรงขึ้น สแกนเนอร์ขอข้อมูลได้เพิ่ม พยาบาลฟื้นพลังเมื่อยิงเสริม และใช้ร่วมกับเครื่องแบบได้", () => {
    const spec = battleOf("easy", "k1") as BattleSpec;
    const base = battleSetup("easy", spec, "lab", 0);
    expect(base.assistHeal).toBe(0);
    expect(battleSetup("easy", spec, "lab", 0, ["laser"]).assistDamage).toBe(BATTLE.assistDamage + BATTLE.modules.laserAssist);
    expect(battleSetup("easy", spec, "commander", 0, ["laser"]).assistDamage).toBe(BATTLE.perks.commanderAssist + BATTLE.modules.laserAssist);
    expect(battleSetup("hard", battleOf("hard", "end") as BattleSpec, "lab", 0, ["scanner"]).hints).toBe(BATTLE.modules.scannerHints);
    expect(battleSetup("easy", spec, "researcher", 0, ["scanner"]).hints).toBe(base.hints + BATTLE.perks.researcherHints + BATTLE.modules.scannerHints);

    const medic = battleSetup("easy", battleOf("easy", "k2") as BattleSpec, "lab", 0, ["medic"]);
    // เสียพลัง 1 แล้วตอบถูกสองข้อติดกัน: พี่บิตยิงเสริมและซ่อมการ์เดียน 1
    const healed = play(medic, [false, true, true]);
    expect(healed.events.map((e) => e.type)).toEqual(["kaiju-hit", "robot-hit", "robot-hit", "bit-assist", "bit-heal"]);
    expect(healed.state.robotHp).toBe(medic.robotMax);
    // พลังเต็มอยู่แล้ว: ไม่มีอะไรให้ซ่อม
    expect(play(medic, [true, true]).events.map((e) => e.type)).toEqual(["robot-hit", "robot-hit", "bit-assist"]);
  });
});
