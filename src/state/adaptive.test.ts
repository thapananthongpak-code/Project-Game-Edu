import { describe, expect, it } from "vitest";
import {
  type AdaptiveEvent,
  evaluateMinigame,
  pretestTier,
  repairPracticeDone,
  roomStartTier,
  shiftTier,
  starsFor,
} from "./adaptive";
import { ADAPTIVE } from "./adaptive.config";

const ok = (timeMs = 1000): AdaptiveEvent => ({ type: "check", correct: true, timeMs });
const miss = (timeMs = 1000): AdaptiveEvent => ({ type: "check", correct: false, timeMs });
const repair: AdaptiveEvent = { type: "repair" };

describe("pretestTier (GDD 7.1)", () => {
  it("ถูก 2 = ท้าทาย, ถูก 1 = ปกติ, ถูก 0 = ประคอง", () => {
    expect(pretestTier(2)).toBe("challenge");
    expect(pretestTier(1)).toBe("standard");
    expect(pretestTier(0)).toBe("assist");
  });
  it("ค่าที่อยู่นอกช่วงถูกจำกัดไว้ที่ขอบ", () => {
    expect(pretestTier(-1)).toBe("assist");
    expect(pretestTier(5)).toBe("challenge");
  });
});

describe("starsFor (GDD 4.4)", () => {
  it.each([
    [0, 3],
    [1, 2],
    [2, 2],
    [3, 1],
    [10, 1],
  ])("ผิดสะสม %i ครั้ง ได้ %i ดาว", (misses, stars) => {
    expect(starsFor(misses)).toBe(stars);
  });
});

describe("shiftTier", () => {
  it("ไม่ต่ำกว่าประคองและไม่สูงกว่าท้าทาย", () => {
    expect(shiftTier("assist", -1)).toBe("assist");
    expect(shiftTier("challenge", 1)).toBe("challenge");
    expect(shiftTier("standard", 1)).toBe("challenge");
    expect(shiftTier("standard", -1)).toBe("assist");
  });
});

describe("evaluateMinigame (GDD 4.2, 7.2, 7.3)", () => {
  it("ยังไม่มีเหตุการณ์: ใช้ระดับเริ่มต้น ไม่มีห้องซ่อม ได้ 3 ดาว", () => {
    const state = evaluateMinigame("standard", []);
    expect(state).toMatchObject({ tier: "standard", repair: "none", canSkipRepair: true, totalMisses: 0, stars: 3, requiredRepair: false });
    expect(state.summary).toEqual({ checks: 0, correct: 0, totalTimeMs: 0, averageTimeMs: 0 });
  });

  it("สิทธิ์เปิดอ่านและโหมดตรวจตามระดับ (GDD 4.3)", () => {
    expect(evaluateMinigame("assist", [])).toMatchObject({ peeksAllowed: Number.POSITIVE_INFINITY, checkMode: "piece" });
    expect(evaluateMinigame("standard", [])).toMatchObject({ peeksAllowed: 2, checkMode: "piece" });
    expect(evaluateMinigame("challenge", [])).toMatchObject({ peeksAllowed: 0, checkMode: "round" });
  });

  it("ผิด 1 ครั้ง: ยังไม่ลดระดับและยังไม่เสนอห้องซ่อม", () => {
    expect(evaluateMinigame("standard", [miss()])).toMatchObject({ tier: "standard", repair: "none", consecutiveMisses: 1, totalMisses: 1, stars: 2 });
  });

  it("ผิด 2 ครั้งติดต่อกัน: ลดระดับ 1 ขั้นทันทีและเสนอห้องซ่อมที่ปฏิเสธได้", () => {
    expect(evaluateMinigame("challenge", [miss(), miss()])).toMatchObject({ tier: "standard", repair: "offer", canSkipRepair: true, consecutiveMisses: 2 });
  });

  it("ผิด 2 ครั้งที่มีการตอบถูกคั่น: ไม่นับว่าติดต่อกัน", () => {
    expect(evaluateMinigame("standard", [miss(), ok(), miss()])).toMatchObject({ tier: "standard", repair: "none", consecutiveMisses: 1, totalMisses: 2 });
  });

  it("ระดับไม่ลดต่ำกว่าประคอง", () => {
    expect(evaluateMinigame("assist", [miss(), miss()])).toMatchObject({ tier: "assist", repair: "offer" });
  });

  it("ข้อเสนอห้องซ่อมหายไปเมื่อผู้เล่นเล่นต่อ แต่ระดับที่ลดแล้วคงอยู่", () => {
    expect(evaluateMinigame("standard", [miss(), miss(), ok()])).toMatchObject({ tier: "assist", repair: "none", consecutiveMisses: 0 });
    expect(evaluateMinigame("challenge", [miss(), miss(), miss()])).toMatchObject({ tier: "standard", repair: "none", consecutiveMisses: 3 });
  });

  it("ผิดสะสมครบ 4 ครั้ง: ต้องเข้าห้องซ่อมและข้ามไม่ได้ แม้ไม่ได้ผิดติดต่อกัน", () => {
    const state = evaluateMinigame("standard", [miss(), ok(), miss(), ok(), miss(), ok(), miss()]);
    expect(state).toMatchObject({ repair: "required", canSkipRepair: false, requiredRepair: true, totalMisses: 4, tier: "standard" });
  });

  it("สถานะบังคับค้างอยู่จนกว่าจะเข้าห้องซ่อม แม้จะตอบถูกต่อ", () => {
    expect(evaluateMinigame("standard", [miss(), miss(), miss(), miss(), ok()])).toMatchObject({ repair: "required", canSkipRepair: false });
  });

  it("ผิด 4 ครั้งติดต่อกัน: ลดระดับ 2 ขั้นและบังคับเข้าห้องซ่อม", () => {
    expect(evaluateMinigame("challenge", [miss(), miss(), miss(), miss()])).toMatchObject({ tier: "assist", repair: "required" });
  });

  it("กลับจากห้องซ่อม: ระดับประคอง นับผิดติดต่อกันใหม่ ผิดสะสมที่ใช้คิดดาวไม่รีเซ็ต", () => {
    const state = evaluateMinigame("challenge", [miss(), miss(), repair]);
    expect(state).toMatchObject({ tier: "assist", repair: "none", consecutiveMisses: 0, missesSinceRepair: 0, totalMisses: 2, repairVisits: 1, stars: 2 });
  });

  it("หลังกลับจากห้องซ่อม การบังคับครั้งถัดไปเกิดเมื่อผิดเพิ่มอีก 4 ครั้ง", () => {
    const afterRepair: AdaptiveEvent[] = [miss(), miss(), miss(), miss(), repair];
    expect(evaluateMinigame("standard", [...afterRepair, miss(), ok(), miss(), ok(), miss()])).toMatchObject({ repair: "none", totalMisses: 7, requiredRepair: true });
    expect(evaluateMinigame("standard", [...afterRepair, miss(), ok(), miss(), ok(), miss(), ok(), miss()])).toMatchObject({ repair: "required", totalMisses: 8, repairVisits: 1 });
  });

  it("เข้าห้องซ่อมจากข้อเสนอ (ไม่ถูกบังคับ): requiredRepair ยังเป็น false", () => {
    expect(evaluateMinigame("standard", [miss(), miss(), repair, ok()])).toMatchObject({ requiredRepair: false, repairVisits: 1, tier: "assist" });
  });

  it("เวลาถูกสรุปแต่ไม่มีผลต่อการตัดสิน", () => {
    const fast = evaluateMinigame("standard", [miss(100), miss(100), ok(100)]);
    const slow = evaluateMinigame("standard", [miss(90_000), miss(90_000), ok(90_000)]);
    expect(slow.summary).toEqual({ checks: 3, correct: 1, totalTimeMs: 270_000, averageTimeMs: 90_000 });
    const { summary: _fastSummary, ...fastDecision } = fast;
    const { summary: _slowSummary, ...slowDecision } = slow;
    expect(slowDecision).toEqual(fastDecision);
  });

  it("เป็นฟังก์ชันล้วน: ไม่แก้ประวัติที่รับเข้ามา และให้ผลเดิมเมื่อเรียกซ้ำ", () => {
    const events = Object.freeze([miss(), miss(), repair, ok()]) as readonly AdaptiveEvent[];
    expect(evaluateMinigame("challenge", events)).toEqual(evaluateMinigame("challenge", events));
  });
});

describe("roomStartTier (GDD 7.2)", () => {
  it("ห้องแรกใช้ระดับจากแบบทดสอบก่อนเรียน", () => {
    expect(roomStartTier(1, null)).toBe("standard");
  });
  it("ห้องก่อนหน้าผ่านโดยไม่ผิดเลย: สูงขึ้น 1 ขั้น ไม่เกินท้าทาย", () => {
    expect(roomStartTier(0, { totalMisses: 0, requiredRepair: false })).toBe("standard");
    expect(roomStartTier(2, { totalMisses: 0, requiredRepair: false })).toBe("challenge");
  });
  it("ห้องก่อนหน้าถูกบังคับเข้าห้องซ่อม: ต่ำลง 1 ขั้น ไม่ต่ำกว่าประคอง", () => {
    expect(roomStartTier(2, { totalMisses: 5, requiredRepair: true })).toBe("standard");
    expect(roomStartTier(0, { totalMisses: 5, requiredRepair: true })).toBe("assist");
  });
  it("ห้องก่อนหน้าผิดบ้างแต่ไม่ถูกบังคับ: ไม่ปรับ", () => {
    expect(roomStartTier(1, { totalMisses: 2, requiredRepair: false })).toBe("standard");
  });
});

describe("ระดับขั้นต่ำตามระดับความยากของเกม (GDD 15)", () => {
  it("ระดับเริ่มต้นไม่ต่ำกว่าขั้นต่ำ แม้แบบทดสอบก่อนเรียนผิดทุกข้อหรือห้องก่อนหน้าถูกบังคับเข้าห้องซ่อม", () => {
    expect(roomStartTier(0, null, "standard")).toBe("standard");
    expect(roomStartTier(0, { totalMisses: 5, requiredRepair: true }, "challenge")).toBe("challenge");
    expect(roomStartTier(2, null, "standard")).toBe("challenge");
  });
  it("ตอบผิดติดกันแล้วระดับไม่ลดต่ำกว่าขั้นต่ำ แต่ห้องซ่อมยังทำงานเหมือนเดิม", () => {
    const events = [miss(), miss(), miss(), miss()];
    expect(evaluateMinigame("challenge", events).tier).toBe("assist");
    const hard = evaluateMinigame("challenge", events, "challenge");
    expect(hard).toMatchObject({ tier: "challenge", checkMode: "round", peeksAllowed: 0, repair: "required" });
    expect(evaluateMinigame("assist", [miss(), miss()], "standard")).toMatchObject({ tier: "standard", repair: "offer" });
  });
});

describe("ห้องซ่อม (GDD 7.3)", () => {
  it("ออกได้เมื่อตอบถูก 2 ข้อติดต่อกัน", () => {
    expect(repairPracticeDone([true])).toBe(false);
    expect(repairPracticeDone([true, false, true])).toBe(false);
    expect(repairPracticeDone([false, true, true])).toBe(true);
    expect(repairPracticeDone([true, true, false])).toBe(false);
  });
});

describe("ค่าคงที่ตรงกับ GDD", () => {
  it("เกณฑ์ตัวเลขใน adaptive.config.ts", () => {
    expect(ADAPTIVE.consecutiveMissesToOfferRepair).toBe(2);
    expect(ADAPTIVE.missesToRequireRepair).toBe(4);
    expect(ADAPTIVE.repairExitStreak).toBe(2);
    expect(ADAPTIVE.pretestItemsPerTopic).toBe(2);
    expect(ADAPTIVE.peeks).toEqual({ assist: Number.POSITIVE_INFINITY, standard: 2, challenge: 0 });
  });
});
