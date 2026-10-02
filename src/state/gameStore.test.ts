import { beforeEach, describe, expect, it } from "vitest";
import { evaluateMinigame } from "./adaptive";
import { BATTLE } from "./battle.config";
import { CAMPAIGN, type Difficulty } from "./campaign";
import { allBattlesWon, armorParts, creditsOf, earningOf, isRoomUnlocked, isTopicOpen, nextStepOf, pendingBattle, pendingStory, startTierOf, useGameStore } from "./gameStore";
import { emptyShop } from "./progressStore";
import { earnedCredits } from "./shop";
import { REWARDS } from "./shop.config";

const miss = { type: "check", correct: false, timeMs: 1000 } as const;
const ok = { type: "check", correct: true, timeMs: 1000 } as const;
const perfect = evaluateMinigame("standard", [ok]);
const forced = evaluateMinigame("standard", [miss, miss, miss, miss, { type: "repair" }, ok]);

const pretest = (correctByTopic: Record<number, number>) => ({ form: "A" as const, correctByTopic, items: [], completedAt: "" });

/** รหัสด่านต่อสู้ของห้องในระดับง่าย */
const easyBattle = (room: number) => (room === 6 ? "omega" : `k${room}`);
const win = { won: true, asked: 4, correct: 4 };

/** ระดับง่าย: ผ่านเควส รับแกน AI และชนะไคจูของห้อง */
function finishRoom(room: number, result = perfect) {
  const store = useGameStore.getState();
  store.enterRoom(room);
  useGameStore.getState().completeMinigame(result);
  useGameStore.getState().collectCore();
  useGameStore.getState().recordBattle(easyBattle(room), win);
}

const setDifficulty = (difficulty: Difficulty) => useGameStore.setState({ profile: { name: "ทดสอบ", difficulty, classCode: "", avatar: "a" } });

/** ได้แกน AI ของหัวข้อโดยตรง (ข้ามขั้นตอนในห้อง) */
function grantCore(topic: number) {
  useGameStore.getState().focusTopic(topic);
  useGameStore.getState().collectCore();
}

beforeEach(() => {
  useGameStore.setState({ progress: {}, battles: {}, pretest: null, posttest: null, story: [], shop: emptyShop(), zone: null, room: null, screen: "hall", overlay: null });
  setDifficulty("easy");
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
    expect(pendingBattle(useGameStore.getState())?.id).toBe("k1");
    // แพ้แล้วยังล็อก จำนวนครั้งที่ออกปฏิบัติการและโจทย์ที่ตอบสะสมต่อ
    useGameStore.getState().recordBattle("k1", { won: false, asked: 6, correct: 2 });
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(false);
    useGameStore.getState().recordBattle("k1", { won: true, asked: 3, correct: 3 });
    expect(useGameStore.getState().battles.k1).toEqual({ won: true, wins: 1, sorties: 2, asked: 9, correct: 5 });
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

describe("ระดับความยาก (GDD 15)", () => {
  it("ไม่ได้เลือกระดับ: ใช้ระดับง่ายเป็นค่าเริ่มต้น", () => {
    useGameStore.setState({ profile: null });
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("station");
    expect(pendingBattle(useGameStore.getState())).toBeNull();
  });

  it("ง่าย: ต้องฟังสถานีครบ ทำเควส ตอบคำถามทบทวน แล้วจึงรับแกน AI", () => {
    useGameStore.getState().enterRoom(1);
    expect(useGameStore.getState()).toMatchObject({ zone: 1, room: 1 });
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("station");
    useGameStore.setState({ progress: { 1: { ...useGameStore.getState().progress[1], stationsSeen: 99 } } });
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("minigame");
    useGameStore.getState().completeMinigame(perfect);
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("review");
    expect(useGameStore.getState().progress[1].core).toBe(false);
    useGameStore.getState().saveReview(["ก"]);
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("core");
  });

  it("กลาง: 3 ห้อง ห้องละ 2 หัวข้อ ไม่บังคับฟังสถานี หัวข้อในห้องต้องทำตามลำดับ", () => {
    setDifficulty("normal");
    useGameStore.getState().enterRoom(1);
    expect(useGameStore.getState()).toMatchObject({ zone: 1, room: 1 });
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("minigame");
    expect([isTopicOpen(useGameStore.getState(), 1), isTopicOpen(useGameStore.getState(), 2)]).toEqual([true, false]);
    useGameStore.getState().completeMinigame(perfect);
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("review");
    useGameStore.getState().saveReview(["ก"]);
    useGameStore.getState().collectCore();
    expect(isTopicOpen(useGameStore.getState(), 2)).toBe(true);
    // ได้แกนชิ้นแรกแล้ว: ยังไม่มีด่านต่อสู้ เพราะไคจูของห้องนี้ต้องใช้แกนทั้งสองชิ้น
    expect(pendingBattle(useGameStore.getState())).toBeNull();
    // ปิดหน้าต่างแล้ว หัวข้อที่กำลังทำเลื่อนไปหัวข้อถัดไปของห้อง
    useGameStore.getState().closeOverlay();
    expect(useGameStore.getState().room).toBe(2);
    grantCore(2);
    expect(pendingBattle(useGameStore.getState())?.id).toBe("n1");
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(false);
    useGameStore.getState().recordBattle("n1", win);
    expect([2, 3].map((zone) => isRoomUnlocked(useGameStore.getState(), zone))).toEqual([true, false]);
  });

  it("กลาง: อ่านคลังความรู้จบนับว่าฟังครบทุกสถานีของหัวข้อ", () => {
    setDifficulty("normal");
    useGameStore.getState().enterRoom(1);
    useGameStore.getState().openStation(-1);
    useGameStore.getState().closeDialogue(true);
    expect(useGameStore.getState().progress[1].stationsSeen).toBeGreaterThan(0);
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("minigame");
  });

  it("ยาก: ห้องเดียว ผ่านเควสแล้วได้แกน AI ทันที บอสออกปฏิบัติการได้เมื่อครบ 6 ชิ้น", () => {
    setDifficulty("hard");
    useGameStore.getState().enterRoom(1);
    for (let topic = 1; topic <= 5; topic++) {
      expect(useGameStore.getState().room).toBe(topic);
      expect(nextStepOf(useGameStore.getState(), topic)).toBe("minigame");
      useGameStore.getState().completeMinigame(perfect);
      expect(useGameStore.getState().progress[topic].core).toBe(true);
      useGameStore.getState().closeOverlay();
    }
    expect(useGameStore.getState().room).toBe(6);
    // หัวข้อภาคสนามไม่ได้แกนอัตโนมัติ ต้องทำภารกิจและแบบทดสอบหลังเรียน
    expect(nextStepOf(useGameStore.getState(), 6)).toBe("field");
    expect(pendingBattle(useGameStore.getState())).toBeNull();
    grantCore(6);
    expect(pendingBattle(useGameStore.getState())?.id).toBe("end");
    useGameStore.getState().recordBattle("end", win);
    expect(allBattlesWon(useGameStore.getState())).toBe(true);
  });

  it("ระดับเริ่มต้นของเควสไม่ต่ำกว่าระดับขั้นต่ำของระดับความยาก", () => {
    useGameStore.setState({ pretest: pretest({ 1: 0 }) });
    expect(startTierOf(useGameStore.getState(), 1)).toBe("assist");
    setDifficulty("normal");
    expect(startTierOf(useGameStore.getState(), 1)).toBe("standard");
    setDifficulty("hard");
    expect(startTierOf(useGameStore.getState(), 1)).toBe("challenge");
  });

  it("บรรยายสรุปของห้องใช้ฉากของระดับความยากนั้น", () => {
    useGameStore.setState({ pretest: pretest({}), story: ["prologue"] });
    setDifficulty("normal");
    useGameStore.getState().enterRoom(1);
    expect(pendingStory(useGameStore.getState())).toBe("zone-n1");
    setDifficulty("hard");
    expect(pendingStory(useGameStore.getState())).toBe("zone-h1");
  });

  it("ชิ้นส่วนอัปเกรดการ์เดียน: ได้จากไคจูประจำห้องที่ชนะแล้ว ไม่นับบอส", () => {
    expect(armorParts(useGameStore.getState())).toBe(0);
    for (let room = 1; room <= 6; room++) finishRoom(room);
    expect(armorParts(useGameStore.getState())).toBe(5);
    setDifficulty("hard");
    useGameStore.setState({ battles: { end: { won: true, wins: 1, sorties: 1, asked: 9, correct: 9 } } });
    expect(armorParts(useGameStore.getState())).toBe(0);
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
  const earning = () => earningOf(useGameStore.getState());
  const creditBalance = (_: unknown, __: unknown) => creditsOf(useGameStore.getState());

  it("เครดิตคำนวณจากความคืบหน้า ทำเควสเดิมซ้ำไม่ได้เครดิตเพิ่ม", () => {
    expect(earnedCredits(earning())).toBe(0);
    finishRoom(1);
    const once = REWARDS.star * 3 + REWARDS.core + REWARDS.battle + REWARDS.firstSortie;
    expect(earnedCredits(earning())).toBe(once);
    useGameStore.getState().completeMinigame(perfect);
    expect(earnedCredits(earning())).toBe(once);
  });

  it("แพ้ก่อนแล้วจึงชนะ: ไม่ได้โบนัสชนะในครั้งแรก", () => {
    useGameStore.getState().enterRoom(1);
    useGameStore.getState().collectCore();
    useGameStore.getState().recordBattle("k1", { won: false, asked: 5, correct: 1 });
    useGameStore.getState().recordBattle("k1", win);
    expect(earnedCredits(earning())).toBe(REWARDS.core + REWARDS.battle);
  });

  it("ซ้อมรบซ้ำกับด่านที่ชนะแล้วได้เครดิตเพิ่มต่อครั้ง แต่ไม่เกินจำนวนครั้งที่กำหนด", () => {
    finishRoom(1);
    const base = earnedCredits(earning());
    useGameStore.getState().recordBattle("k1", win);
    expect(earnedCredits(earning())).toBe(base + REWARDS.replay);
    for (let i = 0; i < BATTLE.replayRewards + 3; i++) useGameStore.getState().recordBattle("k1", win);
    expect(earnedCredits(earning())).toBe(base + REWARDS.replay * BATTLE.replayRewards);
    // ซ้อมแล้วแพ้ไม่ทำให้เครดิตลด
    useGameStore.getState().recordBattle("k1", { won: false, asked: 3, correct: 0 });
    expect(earnedCredits(earning())).toBeGreaterThanOrEqual(base + REWARDS.replay * BATTLE.replayRewards - REWARDS.firstSortie);
  });

  it("ระดับความยากสูงได้เครดิตมากขึ้นตามตัวคูณ และบอสให้รางวัลมากกว่าไคจูประจำห้อง", () => {
    finishRoom(1);
    const easy = earnedCredits(earning());
    useGameStore.setState({ battles: {} });
    const withoutBattle = earnedCredits(earning());
    setDifficulty("normal");
    expect(earnedCredits(earning())).toBe(Math.round(withoutBattle * CAMPAIGN.normal.creditMultiplier));
    setDifficulty("hard");
    expect(earnedCredits(earning())).toBe(withoutBattle * CAMPAIGN.hard.creditMultiplier);
    useGameStore.setState({ battles: { end: { won: true, wins: 1, sorties: 1, asked: 9, correct: 9 } } });
    expect(earnedCredits(earning())).toBe((withoutBattle + REWARDS.boss + REWARDS.firstSortie) * CAMPAIGN.hard.creditMultiplier);
    expect(easy).toBe(withoutBattle + REWARDS.battle + REWARDS.firstSortie);
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

  it("ร้านมีของใช้ใหม่สำหรับระดับที่ยากขึ้น: แบตเตอรี่เสริม ชิปวิเคราะห์ และแกนสำรอง (ถือได้ 1 ชิ้น)", () => {
    for (let room = 1; room <= 3; room++) finishRoom(room);
    for (const id of ["supply-overcharge", "supply-analyzer", "supply-reboot"]) expect(useGameStore.getState().buy(id), id).toBeNull();
    expect(useGameStore.getState().shop.supplies).toMatchObject({ overcharge: 1, analyzer: 1, reboot: 1 });
    expect(useGameStore.getState().buy("supply-reboot")).toBe("owned");
  });

  it("เริ่มเกมใหม่: เนื้อเรื่องและร้านค้ากลับเป็นค่าเริ่มต้น", () => {
    finishRoom(1);
    useGameStore.getState().buy("supply-shield");
    useGameStore.setState({ story: ["prologue"] });
    useGameStore.getState().newGame();
    expect(useGameStore.getState()).toMatchObject({ story: [], shop: emptyShop(), progress: {} });
  });
});
