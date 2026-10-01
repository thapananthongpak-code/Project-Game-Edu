import { beforeEach, describe, expect, it } from "vitest";
import { evaluateMinigame } from "./adaptive";
import { isRoomUnlocked, startTierOf, useGameStore } from "./gameStore";

const miss = { type: "check", correct: false, timeMs: 1000 } as const;
const ok = { type: "check", correct: true, timeMs: 1000 } as const;
const perfect = evaluateMinigame("standard", [ok]);
const forced = evaluateMinigame("standard", [miss, miss, miss, miss, { type: "repair" }, ok]);

const pretest = (correctByTopic: Record<number, number>) => ({ form: "A" as const, correctByTopic, items: [], completedAt: "" });

function finishRoom(room: number, result = perfect) {
  const store = useGameStore.getState();
  store.enterRoom(room);
  useGameStore.getState().completeMinigame(result);
  useGameStore.getState().collectCore();
}

beforeEach(() => {
  useGameStore.setState({ progress: {}, pretest: null, posttest: null, profile: { name: "ทดสอบ", style: "read", classCode: "" }, styleSuggestion: false, room: null, screen: "hall", overlay: null });
});

describe("เส้นทางปลดล็อกเชิงเส้น 1→6 (GDD 4.4)", () => {
  it("เริ่มเกม: เปิดเฉพาะห้อง 1", () => {
    const state = useGameStore.getState();
    expect([1, 2, 3, 4, 5, 6].map((room) => isRoomUnlocked(state, room))).toEqual([true, false, false, false, false, false]);
  });

  it("ได้แกน AI ของห้อง N จึงเปิดห้อง N+1 ทีละห้อง", () => {
    for (let room = 1; room <= 5; room++) {
      finishRoom(room);
      const state = useGameStore.getState();
      expect(isRoomUnlocked(state, room + 1)).toBe(true);
      if (room + 2 <= 6) expect(isRoomUnlocked(state, room + 2)).toBe(false);
    }
  });

  it("ผลแบบทดสอบก่อนเรียนไม่ปลดล็อกห้อง แม้ถูกทุกข้อ", () => {
    useGameStore.setState({ pretest: pretest({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 }) });
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(false);
  });

  it("ผ่านมินิเกมแต่ยังไม่รับแกน: ห้องถัดไปยังล็อก", () => {
    useGameStore.getState().enterRoom(1);
    useGameStore.getState().completeMinigame(perfect);
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(false);
  });
});

describe("ระดับเริ่มต้นของห้องตามเครื่องยนต์ปรับระดับ (GDD 7.1–7.2)", () => {
  it("ใช้ผลแบบทดสอบของหัวข้อนั้น ปรับตามผลของห้องก่อนหน้า", () => {
    useGameStore.setState({ pretest: pretest({ 1: 1, 2: 0, 3: 2, 4: 1 }) });
    expect(startTierOf(useGameStore.getState(), 1)).toBe("standard");
    finishRoom(1, perfect);
    expect(startTierOf(useGameStore.getState(), 2)).toBe("standard"); // ประคอง +1 เพราะห้อง 1 ไม่ผิดเลย
    finishRoom(2, forced);
    expect(startTierOf(useGameStore.getState(), 3)).toBe("standard"); // ท้าทาย -1 เพราะห้อง 2 ถูกบังคับเข้าห้องซ่อม
    finishRoom(3, evaluateMinigame("standard", [miss, ok]));
    expect(startTierOf(useGameStore.getState(), 4)).toBe("standard"); // ไม่ปรับ
  });
});

describe("ข้อเสนอเปลี่ยนสไตล์การเรียน (GDD 7.2)", () => {
  it("ถูกบังคับเข้าห้องซ่อม 2 ห้องติดกัน: พี่บิตเสนอให้เปลี่ยนสไตล์", () => {
    finishRoom(1, forced);
    expect(useGameStore.getState().styleSuggestion).toBe(false);
    finishRoom(2, forced);
    expect(useGameStore.getState().styleSuggestion).toBe(true);
    useGameStore.getState().dismissStyleSuggestion();
    expect(useGameStore.getState().styleSuggestion).toBe(false);
  });

  it("ไม่ติดกัน: ไม่เสนอ", () => {
    finishRoom(1, forced);
    finishRoom(2, perfect);
    finishRoom(3, forced);
    expect(useGameStore.getState().styleSuggestion).toBe(false);
  });
});

describe("แกน AI", () => {
  it("บันทึกเวลาที่ได้แกนครั้งแรก และไม่เปลี่ยนเมื่อรับซ้ำ", () => {
    finishRoom(1);
    const first = useGameStore.getState().progress[1].coreAt;
    expect(first).not.toBeNull();
    useGameStore.getState().collectCore();
    expect(useGameStore.getState().progress[1].coreAt).toBe(first);
  });
});

describe("ข้อมูลสำหรับครู", () => {
  it("สะสมชิ้นที่ตอบผิด เวลาในห้อง และจำนวนครั้งที่ถามพี่บิต แยกตามห้อง", () => {
    const store = useGameStore.getState();
    store.enterRoom(2);
    store.recordMisses(["ก", "ข"]);
    store.recordMisses(["ก"]);
    store.addRoomTime(2, 1500);
    store.exitToHall();
    useGameStore.getState().addRoomTime(2, 500);
    useGameStore.getState().enterRoom(2);
    store.recordTutor("ai");
    store.recordTutor("hints");
    store.recordTutor("hints");
    const room = useGameStore.getState().progress[2];
    expect(room.missed).toEqual({ ก: 2, ข: 1 });
    expect(room.timeMs).toBe(2000);
    expect(room.tutor).toEqual({ ai: 1, hints: 2 });
    expect(useGameStore.getState().progress[1]).toBeUndefined();
  });

  it("อยู่นอกห้อง: ไม่บันทึก", () => {
    useGameStore.getState().recordMisses(["ก"]);
    useGameStore.getState().recordTutor("ai");
    expect(useGameStore.getState().progress).toEqual({});
  });
});

describe("เริ่มเกมใหม่", () => {
  it("ล้างโปรไฟล์ ผลแบบทดสอบทั้งสองครั้ง และความคืบหน้า", () => {
    useGameStore.setState({ pretest: pretest({ 1: 2 }), posttest: pretest({ 1: 2 }) });
    finishRoom(1);
    useGameStore.getState().newGame();
    const state = useGameStore.getState();
    expect([state.profile, state.pretest, state.posttest, state.progress, state.screen]).toEqual([null, null, null, {}, "onboarding"]);
  });
});
