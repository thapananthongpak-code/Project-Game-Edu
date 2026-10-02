import { beforeEach, describe, expect, it } from "vitest";
import { evaluateMinigame } from "./adaptive";
import { allBattlesWon, isRoomUnlocked, pendingBattle, pendingStory, startTierOf, useGameStore } from "./gameStore";
import { emptyShop } from "./progressStore";
import { creditBalance, earnedCredits } from "./shop";
import { REWARDS } from "./shop.config";

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
  useGameStore.getState().recordBattle(room, { won: true, asked: 4, correct: 4 });
}

beforeEach(() => {
  useGameStore.setState({ progress: {}, pretest: null, posttest: null, story: [], shop: emptyShop(), profile: { name: "ทดสอบ", style: "read", classCode: "", avatar: "a" }, styleSuggestion: false, room: null, screen: "hall", overlay: null });
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

  it("ได้แกน AI แล้วแต่ยังไม่ชนะไคจูของห้องนั้น: ห้องถัดไปยังล็อก และมีด่านต่อสู้รออยู่ (GDD 12)", () => {
    const store = useGameStore.getState();
    expect(pendingBattle(store)).toBeNull();
    store.enterRoom(1);
    useGameStore.getState().collectCore();
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(false);
    expect(pendingBattle(useGameStore.getState())).toBe(1);
    // แพ้แล้วยังล็อก จำนวนครั้งที่ออกปฏิบัติการและโจทย์ที่ตอบสะสมต่อ
    useGameStore.getState().recordBattle(1, { won: false, asked: 6, correct: 2 });
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(false);
    useGameStore.getState().recordBattle(1, { won: true, asked: 3, correct: 3 });
    expect(useGameStore.getState().progress[1].battle).toEqual({ won: true, sorties: 2, asked: 9, correct: 5 });
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(true);
    expect(pendingBattle(useGameStore.getState())).toBeNull();
    expect(allBattlesWon(useGameStore.getState())).toBe(false);
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

describe("เนื้อเรื่อง (GDD 2)", () => {
  it("บทนำแสดงเมื่อเข้าแล็บครั้งแรกหลังทำแบบทดสอบก่อนเรียน และไม่แสดงซ้ำเมื่อดูจบแล้ว", () => {
    expect(pendingStory(useGameStore.getState())).toBeNull();
    useGameStore.setState({ pretest: pretest({}) });
    expect(pendingStory(useGameStore.getState())).toBe("prologue");
    useGameStore.getState().openStory("prologue");
    useGameStore.getState().finishStory();
    expect(useGameStore.getState().story).toEqual(["prologue"]);
    expect(pendingStory(useGameStore.getState())).toBeNull();
  });

  it("บรรยายสรุปของห้องแสดงเมื่อเข้าห้องนั้นครั้งแรก", () => {
    useGameStore.setState({ pretest: pretest({}), story: ["prologue"] });
    useGameStore.getState().enterRoom(1);
    expect(pendingStory(useGameStore.getState())).toBe("room-1");
    useGameStore.getState().openStory("room-1");
    useGameStore.getState().finishStory();
    expect(pendingStory(useGameStore.getState())).toBeNull();
  });

  it("บทส่งท้ายแสดงเมื่อชนะครบทุกด่าน ไม่แสดงบนหน้าเมนู", () => {
    useGameStore.setState({ pretest: pretest({}), story: ["prologue", "room-1", "room-2", "room-3", "room-4", "room-5", "room-6"] });
    for (let room = 1; room <= 6; room++) finishRoom(room);
    useGameStore.getState().exitToHall();
    expect(allBattlesWon(useGameStore.getState())).toBe(true);
    expect(pendingStory(useGameStore.getState())).toBe("ending");
    useGameStore.getState().toMenu();
    expect(pendingStory(useGameStore.getState())).toBeNull();
  });
});

describe("เครดิตวิจัยและร้านสหกรณ์แล็บ (GDD 13)", () => {
  const earning = () => ({ rooms: useGameStore.getState().progress, posttest: useGameStore.getState().posttest });

  it("เครดิตคำนวณจากความคืบหน้า เล่นด่านเดิมซ้ำไม่ได้เครดิตเพิ่ม", () => {
    expect(earnedCredits(earning())).toBe(0);
    finishRoom(1);
    const once = REWARDS.star * 3 + REWARDS.core + REWARDS.battle + REWARDS.firstSortie;
    expect(earnedCredits(earning())).toBe(once);
    useGameStore.getState().completeMinigame(perfect);
    useGameStore.getState().recordBattle(1, { won: true, asked: 4, correct: 4 });
    // ออกปฏิบัติการครั้งที่สองแล้ว: โบนัสชนะในครั้งแรกหายไป ส่วนอื่นเท่าเดิม
    expect(earnedCredits(earning())).toBe(once - REWARDS.firstSortie);
  });

  it("ซื้อชุดแล้วสวมให้ทันที เครดิตไม่พอซื้อไม่ได้ ของที่มีแล้วซื้อซ้ำไม่ได้", () => {
    expect(useGameStore.getState().buy("outfit-engineer")).toBe("credits");
    for (let room = 1; room <= 2; room++) finishRoom(room);
    const before = creditBalance(earning(), useGameStore.getState().shop);
    expect(useGameStore.getState().buy("outfit-engineer")).toBeNull();
    expect(useGameStore.getState().shop).toMatchObject({ outfit: "engineer", owned: ["outfit-engineer"], spent: 100 });
    expect(creditBalance(earning(), useGameStore.getState().shop)).toBe(before - 100);
    expect(useGameStore.getState().buy("outfit-engineer")).toBe("owned");
    expect(useGameStore.getState().buy("no-such-item")).toBe("unknown");
    // สลับกลับชุดเริ่มต้นได้ แต่สวมชุดที่ยังไม่ได้ซื้อไม่ได้
    useGameStore.getState().equip("outfit", "lab");
    expect(useGameStore.getState().shop.outfit).toBe("lab");
    useGameStore.getState().equip("outfit", "guardian");
    expect(useGameStore.getState().shop.outfit).toBe("lab");
  });

  it("ของใช้ในการต่อสู้: ซื้อได้จนถึงจำนวนสูงสุด ใช้แล้วหมดไป", () => {
    for (let room = 1; room <= 2; room++) finishRoom(room);
    for (let i = 0; i < 3; i++) expect(useGameStore.getState().buy("supply-shield")).toBeNull();
    expect(useGameStore.getState().buy("supply-shield")).toBe("owned");
    expect(useGameStore.getState().consumeSupply("shield")).toBe(true);
    expect(useGameStore.getState().shop.supplies.shield).toBe(2);
    expect(useGameStore.getState().consumeSupply("repair-kit")).toBe(false);
  });

  it("เริ่มเกมใหม่: เนื้อเรื่องและร้านค้ากลับเป็นค่าเริ่มต้น", () => {
    finishRoom(1);
    useGameStore.getState().buy("supply-shield");
    useGameStore.setState({ story: ["prologue"] });
    useGameStore.getState().newGame();
    expect(useGameStore.getState()).toMatchObject({ story: [], shop: emptyShop(), progress: {} });
  });
});
