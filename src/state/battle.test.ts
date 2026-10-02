import { describe, expect, it } from "vitest";
import { applySupply, type BattleState, isCharging, kaijuOf, phaseCount, phaseOf, questionRoom, resolveAnswer, startBattle } from "./battle";
import { BATTLE } from "./battle.config";

const play = (room: number, answers: boolean[], from?: BattleState) => {
  const spec = kaijuOf(room);
  let state = from ?? startBattle(spec);
  const events = [];
  for (const correct of answers) {
    const result = resolveAnswer(spec, state, correct);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events, spec };
};

describe("ด่านต่อสู้ไคจู", () => {
  it("ทุกห้องมีไคจูหนึ่งตัว และลักษณะไม่ซ้ำกัน", () => {
    expect(BATTLE.kaiju.map((k) => k.room)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(BATTLE.kaiju.map((k) => k.trait)).size).toBe(BATTLE.kaiju.length);
  });

  it("ตอบถูกหุ่นโจมตี ตอบผิดไคจูโจมตี และตัวนับถูกติดต่อกันเริ่มใหม่", () => {
    const { state, events } = play(1, [true, false]);
    expect(state).toMatchObject({ kaijuHp: 5, robotHp: BATTLE.robotHp - 1, streak: 0, turn: 2, correct: 1, status: "fighting" });
    expect(events.map((e) => e.type)).toEqual(["robot-hit", "kaiju-hit"]);
  });

  it("ตอบถูกสองข้อติดกัน พี่บิตยิงเสริม", () => {
    const { state, events } = play(1, [true, true]);
    expect(events.map((e) => e.type)).toEqual(["robot-hit", "robot-hit", "bit-assist"]);
    expect(state.kaijuHp).toBe(6 - 3);
  });

  it("ตอบถูกทุกข้อชนะได้ทุกด่านโดยหุ่นไม่เสียพลัง", () => {
    for (const spec of BATTLE.kaiju) {
      const { state } = play(spec.room, Array(spec.hp).fill(true));
      expect(state.status).toBe("won");
      expect(state.robotHp).toBe(BATTLE.robotHp);
    }
  });

  it("ตอบผิดทุกข้อแพ้ แล้วเกมไม่รับคำตอบต่อ", () => {
    const { state, spec } = play(1, Array(BATTLE.robotHp).fill(false));
    expect(state.status).toBe("lost");
    expect(resolveAnswer(spec, state, true)).toEqual({ state, events: [] });
  });

  it("ออกปฏิบัติการใหม่หลังถอยกลับมาซ่อม: หุ่นพลังเต็ม ไคจูเหลือพลังเท่าเดิม", () => {
    const spec = kaijuOf(1);
    expect(startBattle(spec, 2)).toMatchObject({ robotHp: BATTLE.robotHp, kaijuHp: 2, status: "fighting" });
    expect(startBattle(spec, 0).kaijuHp).toBe(1);
    expect(startBattle(spec, 99).kaijuHp).toBe(spec.hp);
  });

  it("ไคจูชาร์จพลัง (ห้อง 2): ตาที่สามตอบถูกสวนกลับแรง ตอบผิดโดนหนัก", () => {
    const spec = kaijuOf(2);
    const before = play(2, [true, false]).state;
    expect(isCharging(spec, startBattle(spec))).toBe(false);
    expect(isCharging(spec, before)).toBe(true);
    const hit = resolveAnswer(spec, before, true);
    expect(hit.events[0]).toEqual({ type: "robot-hit", damage: BATTLE.charge.counterDamage, counter: true });
    const miss = resolveAnswer(spec, before, false);
    expect(miss.events[0]).toMatchObject({ type: "kaiju-hit", damage: BATTLE.charge.damage, heavy: true });
  });

  it("ไคจูฟื้นพลัง (ห้อง 3): ตอบผิดแล้วฟื้น แต่ไม่เกินพลังเต็ม", () => {
    const spec = kaijuOf(3);
    expect(play(3, [false]).state.kaijuHp).toBe(spec.hp);
    const { state, events } = play(3, [true, false]);
    expect(state.kaijuHp).toBe(spec.hp);
    expect(events.at(-1)).toEqual({ type: "kaiju-regen", amount: 1 });
  });

  it("คอมโบ (ห้อง 4): ถูกติดต่อกันยิ่งแรง ไม่เกินค่าสูงสุด", () => {
    const { events } = play(4, [true, true, true, true]);
    expect(events.filter((e) => e.type === "robot-hit").map((e) => (e as { damage: number }).damage)).toEqual([1, 2, 3, 3]);
  });

  it("ฝูง (ห้อง 5): เหลือเยอะโจมตีแรง เหลือน้อยโจมตีเบา", () => {
    expect(play(5, [false]).events[0]).toMatchObject({ damage: BATTLE.swarm.heavyDamage, heavy: true });
    const few = play(5, [true, true, false]);
    expect(few.state.kaijuHp).toBe(2);
    expect(few.events.at(-1)).toMatchObject({ damage: BATTLE.wrongDamage, heavy: false });
  });

  it("ด่านสุดท้าย: ไล่โจทย์ห้อง 1 ถึง 6 ตามเฟส และหุ่นฟื้นพลังเมื่อผ่านเฟส", () => {
    const spec = kaijuOf(6);
    expect(phaseCount(spec)).toBe(6);
    let state = startBattle(spec);
    const rooms = [questionRoom(spec, state)];
    state = resolveAnswer(spec, state, false).state;
    for (let i = 0; i < 20 && state.status === "fighting"; i++) {
      const result = resolveAnswer(spec, state, true);
      state = result.state;
      if (state.status === "fighting" && questionRoom(spec, state) !== rooms.at(-1)) rooms.push(questionRoom(spec, state));
    }
    expect(state.status).toBe("won");
    expect(rooms[0]).toBe(1);
    expect(rooms).toEqual([...rooms].sort((a, b) => a - b));
    expect(rooms.every((room) => room >= 1 && room <= 6)).toBe(true);
    expect(state.robotHp).toBe(BATTLE.robotHp);
    expect(phaseOf(spec, { kaijuHp: 1 })).toBe(5);
  });

  it("ของจากร้าน: ชุดซ่อมฟื้นพลังไม่เกินพลังเต็ม โล่กันการโจมตีหนึ่งครั้ง", () => {
    const spec = kaijuOf(1);
    const fresh = startBattle(spec);
    expect(applySupply(fresh, "repair-kit")).toBeNull();
    const hurt = play(1, [false, false]).state;
    expect(applySupply(hurt, "repair-kit")?.state.robotHp).toBe(BATTLE.robotHp);
    const shielded = applySupply(hurt, "shield");
    expect(shielded?.state.shield).toBe(true);
    expect(applySupply(shielded!.state, "shield")).toBeNull();
    const blocked = resolveAnswer(spec, shielded!.state, false);
    expect(blocked.events[0]).toMatchObject({ type: "kaiju-hit", damage: 0, blocked: true });
    expect(blocked.state).toMatchObject({ robotHp: hurt.robotHp, shield: false });
  });
});
