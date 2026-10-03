import { beforeEach, describe, expect, it } from "vitest";
import { evaluateMinigame } from "./adaptive";
import { BATTLE } from "./battle.config";
import { CAMPAIGN, type Difficulty } from "./campaign";
import { allBattlesWon, coreBoostOf, coreTotal, guardianPowerOf, planOf, learningRooms, mapUnlocked, reachedMap, roomsOfMap, creditsOf, earningOf, isRoomUnlocked, isTopicOpen, nextStepOf, pendingBattle, pendingStory, startTierOf, useGameStore } from "./gameStore";
import { NPC_REWARDS, NPCS } from "./npcs";
import { emptyShop } from "./progressStore";
import { BAG_SIZE, DEFAULT_GEAR, itemPower, POWER } from "./gear";
import { ADVICE, adviseBag, adviseWeapon, idealBag, missingAdvice, wishList } from "./loadout";
import { bagOf, earnedCredits, gearOf, ownedDecor, stockLeft } from "./shop";
import { CATALOG } from "./shop.config";
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
  useGameStore.setState({ progress: {}, others: {}, battles: {}, npcs: {}, pretest: null, posttest: null, story: [], shop: emptyShop(), zone: null, room: null, screen: "hall", overlay: null, musicCue: null, npcId: null, shopVendor: null });
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
    useGameStore.getState().saveReview({ correct: 4, total: 6 });
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("core");
  });

  it("แมพ 2: 3 ห้อง ห้องละ 2 หัวข้อ ไม่บังคับฟังสถานี หัวข้อในห้องต้องทำตามลำดับ ข้ามการเรียนไปออกรบได้ แกนที่ชาร์จแล้วเพิ่มพลังสูงสุด", () => {
    setDifficulty("normal");
    useGameStore.getState().enterRoom(1);
    expect(useGameStore.getState()).toMatchObject({ zone: 1, room: 1 });
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("minigame");
    expect([isTopicOpen(useGameStore.getState(), 1), isTopicOpen(useGameStore.getState(), 2)]).toEqual([true, false]);
    useGameStore.getState().completeMinigame(perfect);
    expect(nextStepOf(useGameStore.getState(), 1)).toBe("review");
    useGameStore.getState().saveReview({ correct: 4, total: 6 });
    useGameStore.getState().collectCore();
    expect(isTopicOpen(useGameStore.getState(), 2)).toBe(true);
    // ไม่ต้องมีแกนก็ออกรบได้ (ข้ามการเรียนได้) แกนของหัวข้อที่ด่านใช้ชาร์จแล้วเพิ่มพลังสูงสุดให้ชิ้นละ 1
    expect(pendingBattle(useGameStore.getState())?.id).toBe("n1");
    expect(coreBoostOf(useGameStore.getState(), pendingBattle(useGameStore.getState())!)).toBe(1);
    // ปิดหน้าต่างแล้ว หัวข้อที่กำลังทำเลื่อนไปหัวข้อถัดไปของห้อง
    useGameStore.getState().closeOverlay();
    expect(useGameStore.getState().room).toBe(2);
    grantCore(2);
    expect(coreBoostOf(useGameStore.getState(), pendingBattle(useGameStore.getState())!)).toBe(2);
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

  it("แมพ 2 ข้ามการเรียนได้: ห้องถัดไปเปิดเมื่อชนะไคจูที่เฝ้าห้อง ไม่ต้องมีแกน AI", () => {
    setDifficulty("normal");
    expect(pendingBattle(useGameStore.getState())?.id).toBe("n1");
    useGameStore.getState().recordBattle("n1", win);
    expect(isRoomUnlocked(useGameStore.getState(), 2)).toBe(true);
    expect(pendingBattle(useGameStore.getState())?.id).toBe("n2");
  });

  it("แมพ 3: ไม่มีห้องเรียน ลุยด่านต่อสู้ตามลำดับ h1 → h2 → บอส", () => {
    setDifficulty("hard");
    expect(planOf(useGameStore.getState()).zones).toEqual([]);
    for (const id of ["h1", "h2", "end"]) {
      expect(pendingBattle(useGameStore.getState())?.id).toBe(id);
      useGameStore.getState().recordBattle(id, win);
    }
    expect(pendingBattle(useGameStore.getState())).toBeNull();
    expect(allBattlesWon(useGameStore.getState())).toBe(true);
    // แมพที่ไม่มีห้องเรียนไม่เพิ่มพลังจากแกน
    expect(coreBoostOf(useGameStore.getState(), CAMPAIGN.hard.battles[0])).toBe(0);
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
    useGameStore.setState({ pretest: pretest({}), story: ["prologue", "map-normal", "map-hard"] });
    setDifficulty("normal");
    useGameStore.getState().enterRoom(1);
    expect(pendingStory(useGameStore.getState())).toBe("zone-n1");
    setDifficulty("hard");
    expect(pendingStory(useGameStore.getState())).toBe("zone-h1");
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

  it("ชนะไคจูประจำห้องแล้วเห็นฉากหลังชนะหนึ่งครั้ง ก่อนบรรยายสรุปของห้องถัดไป แพ้หรือซ้อมรบซ้ำไม่แสดงซ้ำ", () => {
    useGameStore.setState({ pretest: pretest({}), story: ["prologue", "room-1"] });
    useGameStore.getState().enterRoom(1);
    useGameStore.getState().collectCore();
    useGameStore.getState().exitToHall();
    useGameStore.getState().enterHangar();
    useGameStore.getState().recordBattle("k1", { won: false, asked: 3, correct: 0 });
    expect(pendingStory(useGameStore.getState())).toBeNull();
    useGameStore.getState().recordBattle("k1", win);
    expect(pendingStory(useGameStore.getState())).toBe("win-k1");
    useGameStore.getState().openStory("win-k1");
    useGameStore.getState().finishStory();
    useGameStore.getState().recordBattle("k1", win);
    expect(pendingStory(useGameStore.getState())).toBeNull();
    useGameStore.getState().exitToHall();
    useGameStore.getState().enterRoom(2);
    expect(pendingStory(useGameStore.getState())).toBe("room-2");
  });

  it("บทส่งท้ายแสดงเมื่อชนะครบทุกด่าน ไม่แสดงบนหน้าเมนู", () => {
    useGameStore.setState({ pretest: pretest({}), story: ["prologue", "room-1", "room-2", "room-3", "room-4", "room-5", "room-6", "win-k1", "win-k2", "win-k3", "win-k4", "win-k5"] });
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

  it("ซื้อชุดแล้วเก็บไว้ในตู้เสื้อผ้า (ไม่สวมให้เอง) เครดิตไม่พอซื้อไม่ได้ ของที่มีแล้วซื้อซ้ำไม่ได้", () => {
    expect(useGameStore.getState().buy("outfit-engineer")).toBe("credits");
    for (let room = 1; room <= 2; room++) finishRoom(room);
    const before = creditBalance(earning(), useGameStore.getState().shop);
    expect(useGameStore.getState().buy("outfit-engineer")).toBeNull();
    expect(useGameStore.getState().shop).toMatchObject({ outfit: "lab", owned: ["outfit-engineer"], spent: 100 });
    expect(creditBalance(earning(), useGameStore.getState().shop)).toBe(before - 100);
    expect(useGameStore.getState().buy("outfit-engineer")).toBe("owned");
    expect(useGameStore.getState().buy("no-such-item")).toBe("unknown");
    // สวมที่ตู้เสื้อผ้า สลับกลับชุดเริ่มต้นได้ แต่สวมชุดที่ยังไม่ได้ซื้อไม่ได้
    useGameStore.getState().equip("outfit", "engineer");
    expect(useGameStore.getState().shop.outfit).toBe("engineer");
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

  it("อุปกรณ์ของการ์เดียน: ซื้อแล้วไปใส่ที่แท่นการ์เดียน ใส่ได้ช่องละชิ้น สลับกลับอุปกรณ์เริ่มต้นได้ อุปกรณ์ที่ยังไม่ซื้อใส่ไม่ได้", () => {
    const store = () => useGameStore.getState();
    for (let room = 1; room <= 4; room++) finishRoom(room);
    expect(gearOf(store().shop)).toEqual(DEFAULT_GEAR);
    expect(store().buy("weapon-sword")).toBeNull();
    expect(store().buy("armor-heavy")).toBeNull();
    expect(gearOf(store().shop)).toEqual(DEFAULT_GEAR);
    store().equip("weapon", "sword");
    store().equip("armor", "heavy");
    expect(gearOf(store().shop)).toEqual({ weapon: "sword", armor: "heavy", chip: "none" });
    expect(store().buy("weapon-sword")).toBe("owned");
    store().equip("weapon", "blaster");
    expect(store().shop.weapon).toBe("sword");
    store().equip("weapon", "fist");
    expect(store().shop.weapon).toBe("fist");
    store().equip("weapon", "sword");
    expect(store().shop.weapon).toBe("sword");
    // เกราะสะท้อนวางขายตั้งแต่แมพ 2: ยังซื้อไม่ได้จนกว่าจะชนะครบทุกด่านของแมพ 1
    expect(store().buy("armor-guard")).toBe("locked");
    for (let room = 5; room <= 6; room++) finishRoom(room);
    // ช่องหนึ่งใส่ได้ชิ้นเดียว: ซื้อเกราะอีกแบบแล้วสลับไปใช้แบบใหม่ แบบเดิมยังเป็นของเรา
    expect(store().buy("armor-guard")).toBeNull();
    store().equip("armor", "guard");
    expect(store().shop).toMatchObject({ armor: "guard", owned: ["weapon-sword", "armor-heavy", "armor-guard"] });
  });

  it("ค่าพลังรวมของการ์เดียน: เริ่มที่พลังสูงสุดคูณสิบ เพิ่มตามอุปกรณ์ เครื่องแบบ โมดูลของพี่บิต และของใช้ในกระเป๋า", () => {
    const store = () => useGameStore.getState();
    const base = CAMPAIGN.easy.robotHp * POWER.perHp;
    expect(guardianPowerOf(store())).toBe(base);
    for (let room = 1; room <= 6; room++) finishRoom(room);
    store().buy("armor-heavy");
    // ซื้อแล้วยังไม่ใส่: ค่าพลังยังไม่เปลี่ยน
    expect(guardianPowerOf(store())).toBe(base);
    store().equip("armor", "heavy");
    expect(guardianPowerOf(store())).toBe(base + itemPower("armor", "heavy"));
    store().buy("weapon-sword");
    store().buy("chip-charger");
    store().equip("weapon", "sword");
    store().equip("chip", "charger");
    store().buy("supply-shield");
    const geared = base + itemPower("armor", "heavy") + POWER.weapon.sword + POWER.chip.charger + POWER.perItem;
    expect(guardianPowerOf(store())).toBe(geared);
    store().buy("module-laser");
    store().buy("outfit-engineer");
    store().equip("outfit", "engineer");
    expect(guardianPowerOf(store())).toBe(geared + POWER.module.laser + POWER.outfit.engineer);
    // เอาของออกจากกระเป๋าหรือถอดอุปกรณ์ ค่าพลังลดตาม
    store().packBag([]);
    store().equip("weapon", "fist");
    expect(guardianPowerOf(store())).toBe(geared + POWER.module.laser + POWER.outfit.engineer - POWER.perItem - POWER.weapon.sword);
    // ระดับยากเริ่มที่พลังสูงสุดน้อยกว่า
    setDifficulty("hard");
    expect(guardianPowerOf({ profile: store().profile, shop: emptyShop(), progress: {} })).toBe(CAMPAIGN.hard.robotHp * POWER.perHp);
  });

  it("กระเป๋า: ของที่ซื้อลงกระเป๋าให้จนเต็ม 3 ชิ้น ที่เหลืออยู่ในกล่อง ใช้ไปแล้วกระเป๋ารอบถัดไปมีเฉพาะของที่ยังเหลือ", () => {
    const store = () => useGameStore.getState();
    for (let room = 1; room <= 5; room++) finishRoom(room);
    for (const id of ["supply-shield", "supply-shield", "supply-repair-kit", "supply-analyzer"]) expect(store().buy(id), id).toBeNull();
    expect(store().shop.loadout).toEqual(["shield", "shield", "repair-kit"]);
    expect(store().shop.supplies).toMatchObject({ shield: 2, "repair-kit": 1, analyzer: 1 });
    expect(bagOf(store().shop)).toHaveLength(BAG_SIZE);
    // จัดใหม่: เกิน 3 ชิ้นถูกตัด ของที่ไม่มีในกล่องหรือเกินจำนวนที่มีไม่ถูกใส่
    store().packBag(["analyzer", "analyzer", "reboot", "shield", "repair-kit", "shield"]);
    expect(bagOf(store().shop)).toEqual(["analyzer", "shield", "repair-kit"]);
    // ใช้โล่ไป 2 ชิ้นจนหมดกล่อง: กระเป๋ารอบถัดไปไม่มีโล่ ของที่เลือกไว้อย่างอื่นยังอยู่
    store().packBag(["shield", "shield", "analyzer"]);
    store().consumeSupply("shield");
    expect(bagOf(store().shop)).toEqual(["shield", "analyzer"]);
    store().consumeSupply("shield");
    expect(bagOf(store().shop)).toEqual(["analyzer"]);
    // ช่องของของที่ใช้หมดแล้วถือว่าว่าง: ของที่ซื้อใหม่ลงกระเป๋าได้
    expect(store().buy("supply-overcharge")).toBeNull();
    expect(store().buy("supply-overcharge")).toBeNull();
    expect(store().shop.loadout).toEqual(["analyzer", "overcharge", "overcharge"]);
  });

  it("คำแนะนำของพี่บิต: แนะนำของตามลักษณะของคู่ต่อสู้จากของที่มีในกล่อง และบอกของที่ยังขาด", () => {
    const spec = (id: string) => CAMPAIGN.easy.battles.find((battle) => battle.id === id)!;
    const none = emptyShop().supplies;
    // ด่านชาร์จพลัง: โล่มาก่อน
    expect(idealBag(spec("k2"))).toEqual(["shield", "overcharge", "repair-kit"]);
    expect(adviseBag(spec("k2"), none)).toEqual([]);
    expect(missingAdvice(spec("k2"), none)).toEqual(["shield", "overcharge", "repair-kit"]);
    // มีแค่ชุดซ่อม 3 ชิ้น: พกชุดซ่อมทั้งหมด
    expect(adviseBag(spec("k2"), { ...none, "repair-kit": 3 })).toEqual(["repair-kit", "repair-kit", "repair-kit"]);
    // มีครบ: ได้กระเป๋าตามลำดับที่ควรพก ไม่เกิน 3 ชิ้น
    const all = { "repair-kit": 3, shield: 3, overcharge: 3, analyzer: 3, reboot: 1 };
    expect(adviseBag(spec("k2"), all)).toEqual(idealBag(spec("k2")));
    expect(missingAdvice(spec("k2"), all)).toEqual([]);
    // แกนสำรองใช้ได้ครั้งเดียวต่อรอบ: ไม่ถูกแนะนำซ้ำ
    expect(adviseBag(spec("omega"), { ...none, reboot: 1 })).toEqual(["reboot"]);
    // บอสหลายร่าง: สลับของสำคัญของแต่ละร่าง
    const end = CAMPAIGN.hard.battles.at(-1)!;
    expect(idealBag(end)).toEqual([ADVICE.charge[0], ADVICE.armor[0], ADVICE.enrage[0]]);
    for (const difficulty of ["easy", "normal", "hard"] as const) for (const battle of CAMPAIGN[difficulty].battles) expect(new Set(wishList(battle)).size, battle.id).toBe(5);
  });

  it("พี่บิตแนะนำอาวุธ: อาวุธที่ได้เปรียบคู่ต่อสู้ของด่าน ถ้าได้เปรียบเท่ากันแนะนำชิ้นที่แรงกว่า ไม่ได้เปรียบเลยไม่ชวนเปลี่ยน", () => {
    const n2 = CAMPAIGN.normal.battles[1];
    // ไอรอนเชลล์แพ้ทางแรงกระแทก: ถือดาบอยู่ มีค้อน = เปลี่ยนเป็นค้อน, ถือหมัดอยู่ มีค้อน = ค้อนแรงกว่า, ไม่มีค้อน = ชวนซื้อ
    expect(adviseWeapon(n2, "sword", ["sword", "hammer"])).toMatchObject({ weak: ["strike"], resist: ["blade"], matchups: ["weak"], advantaged: false, better: "hammer", stronger: false, wanted: [] });
    expect(adviseWeapon(n2, "fist", ["hammer"])).toMatchObject({ advantaged: true, better: "hammer", stronger: true });
    expect(adviseWeapon(n2, "hammer", ["hammer", "sword"])).toMatchObject({ advantaged: true, better: null, stronger: false });
    expect(adviseWeapon(n2, "sword", ["sword"])).toMatchObject({ advantaged: false, better: "fist", wanted: ["hammer"] });
    expect(adviseWeapon(n2, "fist", [])).toMatchObject({ advantaged: true, better: null, wanted: [] });
    // บอสสองร่าง: ดาบชนะทางร่างแรก พอใช้ได้กับร่างที่สอง ส่วนปืนชนะทางร่างที่สองแต่แพ้ทางร่างแรก จึงไม่ชวนเปลี่ยน แต่หอกแรงกว่าดาบ
    const boss = CAMPAIGN.normal.battles[3];
    expect(adviseWeapon(boss, "sword", ["sword", "blaster"])).toMatchObject({ weak: ["blade", "beam"], advantaged: true, better: null });
    expect(adviseWeapon(boss, "sword", ["sword", "blaster", "lance"])).toMatchObject({ better: "lance", stronger: true });
    // ไม่มีอาวุธไหนได้เปรียบ: ไม่ชวนเปลี่ยน บอกอาวุธที่ควรหา
    expect(adviseWeapon(CAMPAIGN.easy.battles[2], "sword", ["sword"])).toMatchObject({ advantaged: false, better: null, wanted: ["blaster", "cannon"] });
  });

  it("เริ่มเกมใหม่: เนื้อเรื่องและร้านค้ากลับเป็นค่าเริ่มต้น", () => {
    finishRoom(1);
    useGameStore.getState().buy("supply-shield");
    useGameStore.setState({ story: ["prologue"] });
    useGameStore.getState().newGame();
    expect(useGameStore.getState()).toMatchObject({ story: [], shop: emptyShop(), progress: {} });
  });
});

describe("NPC ประจำห้อง (GDD 16)", () => {
  it("เควสเสริม: ต้องรับเควสก่อนจึงเก็บของได้ เก็บซ้ำไม่นับ เก็บครบแล้วจึงส่งได้ และได้เครดิตครั้งเดียว", () => {
    const store = () => useGameStore.getState();
    expect(store().collectPickup("mechanic", 0)).toBe(0);
    store().acceptQuest("mechanic");
    expect(store().collectPickup("mechanic", 0)).toBe(1);
    expect(store().collectPickup("mechanic", 0)).toBe(1);
    expect(store().collectPickup("mechanic", 99)).toBe(1);
    store().completeQuest("mechanic");
    expect(store().npcs.mechanic.done).toBe(false);
    expect(creditsOf(store())).toBe(0);
    for (let index = 1; index < NPCS.mechanic.pickups; index++) store().collectPickup("mechanic", index);
    store().completeQuest("mechanic");
    expect(store().npcs.mechanic).toMatchObject({ done: true, found: [0, 1, 2] });
    expect(creditsOf(store())).toBe(NPC_REWARDS.quest);
    store().completeQuest("mechanic");
    expect(store().collectPickup("mechanic", 1)).toBe(3);
    expect(creditsOf(store())).toBe(NPC_REWARDS.quest);
  });

  it("ถามตอบพิเศษ: เก็บรอบที่ดีที่สุด เครดิตคิดจากรอบนั้น เล่นซ้ำแล้วได้น้อยลงเครดิตไม่ลด และคูณตามตัวคูณของแมพที่ NPC อยู่", () => {
    const store = () => useGameStore.getState();
    store().recordQuiz("coach", 2);
    expect(creditsOf(store())).toBe(2 * NPC_REWARDS.quizPerCorrect);
    store().recordQuiz("coach", 1);
    store().recordQuiz("coach", 99);
    expect(store().npcs.coach).toMatchObject({ best: NPCS.coach.questions, tries: 3 });
    expect(creditsOf(store())).toBe(NPCS.coach.questions * NPC_REWARDS.quizPerCorrect);
    // โค้ชแดเนียลอยู่แมพ 1: เครดิตไม่เปลี่ยนตามแมพที่ผู้เล่นอยู่ ส่วน NPC ของแมพ 2 ได้ตัวคูณของแมพ 2
    setDifficulty("hard");
    expect(creditsOf(store())).toBe(NPCS.coach.questions * NPC_REWARDS.quizPerCorrect);
    store().recordQuiz("sage", 2);
    expect(creditsOf(store())).toBe(NPCS.coach.questions * NPC_REWARDS.quizPerCorrect + Math.round(2 * NPC_REWARDS.quizPerCorrect * CAMPAIGN.normal.creditMultiplier));
  });

  it("กิจกรรมเสริมไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ หรือขั้นตอนของหัวข้อ", () => {
    const store = () => useGameStore.getState();
    useGameStore.setState({ pretest: pretest({ 1: 1 }) });
    const before = [isRoomUnlocked(store(), 2), startTierOf(store(), 1), nextStepOf(store(), 1), pendingBattle(store())];
    store().acceptQuest("mechanic");
    for (let index = 0; index < NPCS.mechanic.pickups; index++) store().collectPickup("mechanic", index);
    store().completeQuest("mechanic");
    store().recordQuiz("coach", 4);
    expect([isRoomUnlocked(store(), 2), startTierOf(store(), 1), nextStepOf(store(), 1), pendingBattle(store())]).toEqual(before);
    expect(store().progress).toEqual({});
  });

  it("ร้านพิเศษและคอสตูมของพี่บิต: ซื้อแล้วไปเปลี่ยนที่แท่นพี่บิต สลับกลับรูปเดิมได้ โมดูลซื้อได้ครั้งเดียว", () => {
    const store = () => useGameStore.getState();
    for (let room = 1; room <= 4; room++) finishRoom(room);
    store().openShop("archivist");
    expect(store()).toMatchObject({ overlay: "shop", shopVendor: "archivist" });
    expect(store().buy("bit-explorer")).toBeNull();
    expect(store().shop).toMatchObject({ bit: "classic", owned: ["bit-explorer"] });
    store().equip("bit", "explorer");
    expect(store().shop.bit).toBe("explorer");
    store().equip("bit", "classic");
    expect(store().shop.bit).toBe("classic");
    store().equip("bit", "gold");
    expect(store().shop.bit).toBe("classic");
    expect(store().buy("module-scanner")).toBeNull();
    expect(store().buy("module-scanner")).toBe("owned");
    store().closeOverlay();
    expect(store()).toMatchObject({ overlay: null, shopVendor: null });
    store().openShop();
    expect(store().shopVendor).toBeNull();
  });

  it("เริ่มเกมใหม่: กิจกรรมเสริมกลับเป็นค่าเริ่มต้น", () => {
    useGameStore.getState().recordQuiz("coach", 3);
    useGameStore.getState().newGame();
    expect(useGameStore.getState().npcs).toEqual({});
  });
});

describe("แมพต่อเนื่อง 3 แมพ (GDD 15)", () => {
  const store = () => useGameStore.getState();
  const clearMap1 = () => {
    for (let room = 1; room <= 6; room++) finishRoom(room);
  };

  it("เริ่มเกม: เปิดเฉพาะแมพ 1 เดินทางไปแมพที่ยังไม่เปิดไม่ได้", () => {
    expect((["easy", "normal", "hard"] as const).map((map) => mapUnlocked(store(), map))).toEqual([true, false, false]);
    expect(reachedMap(store())).toBe("easy");
    expect(store().travel("normal")).toBe(false);
    expect(store().profile?.difficulty).toBe("easy");
  });

  it("ชนะครบทุกด่านของแมพ 1 แล้วแมพ 2 เปิด เดินทางไปแล้วเริ่มความคืบหน้าของแมพ 2 ใหม่ ความคืบหน้าของแมพ 1 ยังอยู่", () => {
    clearMap1();
    expect((["easy", "normal", "hard"] as const).map((map) => mapUnlocked(store(), map))).toEqual([true, true, false]);
    expect(store().travel("hard")).toBe(false);
    expect(store().travel("normal")).toBe(true);
    expect(store()).toMatchObject({ screen: "hall", zone: null, room: null, overlay: null, progress: {} });
    expect(store().profile?.difficulty).toBe("normal");
    expect(coreTotal(store())).toBe(5);
    // บันทึกการเรียนของแมพ 1 ยังครบ (ใช้กับใบประกาศ) และห้องของแมพ 2 เริ่มจากห้องแรก
    expect(Object.values(learningRooms(store())).filter((room) => room.core)).toHaveLength(6);
    expect([1, 2, 3].map((zone) => isRoomUnlocked(store(), zone))).toEqual([true, false, false]);
    // แมพ 2 ข้ามการเรียนได้: ออกรบด่านแรกได้ทันที
    expect(pendingBattle(store())?.id).toBe("n1");
    // เรื่องมาถึงแมพ 2 แสดงครั้งแรกที่ไปถึง
    useGameStore.setState({ pretest: pretest({}), story: ["prologue", "ending"] });
    expect(pendingStory(store())).toBe("map-normal");
  });

  it("ความคืบหน้าของแต่ละแมพเก็บแยกกัน เดินทางกลับไปกลับมาได้ และด่านของแมพก่อนหน้ายังซ้อมรบได้", () => {
    clearMap1();
    store().travel("normal");
    store().enterRoom(1);
    store().completeMinigame(perfect);
    store().saveReview({ correct: 6, total: 6 });
    store().collectCore();
    expect(roomsOfMap(store(), "normal")[1].core).toBe(true);
    expect(roomsOfMap(store(), "easy")[1].stars).toBe(3);
    store().travel("easy");
    expect(store().profile?.difficulty).toBe("easy");
    expect(Object.keys(store().progress)).toHaveLength(6);
    expect(roomsOfMap(store(), "normal")[1].core).toBe(true);
    expect(allBattlesWon(store())).toBe(true);
    store().travel("normal");
    expect(store().progress[1].core).toBe(true);
    expect(store().progress[2]).toBeUndefined();
  });

  it("แมพ 3 เปิดเมื่อชนะครบทุกด่านของแมพ 2 และบทส่งท้ายของแต่ละแมพแสดงแยกกัน", () => {
    clearMap1();
    useGameStore.setState({ pretest: pretest({}), story: ["prologue", "win-k1", "win-k2", "win-k3", "win-k4", "win-k5", "room-6"] });
    expect(pendingStory(store())).toBe("ending");
    store().travel("normal");
    for (const id of ["n1", "n2", "n3"]) store().recordBattle(id, win);
    expect(mapUnlocked(store(), "hard")).toBe(false);
    store().recordBattle("omega-n", win);
    expect(mapUnlocked(store(), "hard")).toBe(true);
    useGameStore.setState({ story: [...store().story, "ending", "map-normal", "win-n1", "win-n2", "win-n3"] });
    expect(pendingStory(store())).toBe("ending-normal");
    expect(store().travel("hard")).toBe(true);
    useGameStore.setState({ story: [...store().story, "ending-normal"] });
    expect(pendingStory(store())).toBe("map-hard");
  });

  it("เครดิตรวมจากทุกแมพ แต่ละแมพคูณด้วยตัวคูณของแมพนั้น", () => {
    clearMap1();
    const first = creditsOf(store());
    store().travel("normal");
    expect(creditsOf(store())).toBe(first);
    store().enterRoom(1);
    store().completeMinigame(perfect);
    store().collectCore();
    expect(creditsOf(store())).toBe(first + Math.round((REWARDS.star * 3 + REWARDS.core) * CAMPAIGN.normal.creditMultiplier));
    // เครดิตของแมพ 2 ไม่หายเมื่อกลับไปแมพ 1
    const both = creditsOf(store());
    store().travel("easy");
    expect(creditsOf(store())).toBe(both);
  });

  it("ของในร้านวางขายตามแมพที่ไปถึง และของใช้มีจำนวนจำกัดต่อแมพ", () => {
    clearMap1();
    // ของของแมพ 2 และ 3
    expect(reachedMap(store())).toBe("normal");
    expect(store().buy("weapon-cannon")).toBe("locked");
    expect(store().buy("outfit-hero")).toBe("locked");
    expect(CATALOG.filter((item) => item.tier === "normal").length).toBeGreaterThan(5);
    expect(CATALOG.filter((item) => item.tier === "hard").length).toBeGreaterThan(2);
    // ชุดซ่อมฉุกเฉิน: ร้านของแมพ 1 ขาย 3 ชิ้น ใช้แล้วซื้อเพิ่มที่แมพเดิมไม่ได้ ต้องไปซื้อที่ร้านของแมพอื่น
    const kit = CATALOG.find((item) => item.id === "supply-repair-kit") as Extract<(typeof CATALOG)[number], { kind: "supply" }>;
    for (let i = 0; i < kit.stock; i++) expect(store().buy("supply-repair-kit")).toBeNull();
    expect(stockLeft(store().shop, kit, "easy")).toBe(0);
    store().consumeSupply("repair-kit");
    expect(store().buy("supply-repair-kit")).toBe("sold-out");
    store().travel("normal");
    expect(stockLeft(store().shop, kit, "normal")).toBe(kit.stock);
    expect(store().buy("supply-repair-kit")).toBeNull();
    expect(store().shop.bought).toEqual({ "easy:repair-kit": 3, "normal:repair-kit": 1 });
  });

  it("ของตกแต่งโถง: ซื้อแล้วเลือกวางในช่องของโถงแต่ละแมพ ขนาดต้องตรงกับช่อง ชิ้นหนึ่งวางได้ช่องเดียวต่อแมพ", () => {
    clearMap1();
    expect(ownedDecor(store().shop)).toEqual(["window", "plant"]);
    expect(store().shop.decor.easy).toEqual({ wall1: "window", small1: "plant" });
    expect(store().buy("decor-sofa")).toBeNull();
    store().placeDecor({ id: "big1", size: "big" }, "sofa");
    expect(store().shop.decor.easy).toMatchObject({ big1: "sofa" });
    // ขนาดไม่ตรงกับช่อง หรือของที่ยังไม่มี: วางไม่ได้
    store().placeDecor({ id: "wall2", size: "wall" }, "sofa");
    store().placeDecor({ id: "big2", size: "big" }, "aquarium");
    expect(store().shop.decor.easy).toEqual({ wall1: "window", small1: "plant", big1: "sofa" });
    // ย้ายไปช่องอื่นของแมพเดียวกัน และเอาออก
    store().placeDecor({ id: "big2", size: "big" }, "sofa");
    expect(store().shop.decor.easy).toEqual({ wall1: "window", small1: "plant", big2: "sofa" });
    store().placeDecor({ id: "small1", size: "small" }, null);
    expect(store().shop.decor.easy).toEqual({ wall1: "window", big2: "sofa" });
    // โถงของแมพ 2 ตกแต่งแยกกัน ของชิ้นเดียวกันใช้ได้ทุกแมพ
    store().travel("normal");
    store().placeDecor({ id: "big1", size: "big" }, "sofa");
    expect(store().shop.decor).toMatchObject({ easy: { big2: "sofa" }, normal: { big1: "sofa" } });
  });

  it("NPC ของแมพ 2: ฟังเรื่องราวแล้วจำไว้ หมอสนามให้ของใช้ครั้งเดียว และถามตอบของดร.ไอรีนใช้สองหัวข้อ", () => {
    expect(NPCS.sage).toMatchObject({ map: "normal", role: "quiz", quizTopics: [1, 2] });
    store().meetNpc("smith");
    expect(store().npcs.smith.met).toBe(true);
    store().claimGift("medic");
    expect(store().shop.supplies).toMatchObject({ "repair-kit": 1, shield: 1 });
    expect(store().shop.loadout).toEqual(["repair-kit", "shield"]);
    expect(store().npcs.medic).toMatchObject({ gifted: true, met: true });
    store().claimGift("medic");
    expect(store().shop.supplies).toMatchObject({ "repair-kit": 1, shield: 1 });
    // NPC ที่ไม่ใช่บทบาทช่วยเหลือให้ของไม่ได้
    store().claimGift("smith");
    expect(store().npcs.smith.gifted).toBe(false);
  });
});
