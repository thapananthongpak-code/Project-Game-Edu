// เครื่องยนต์ปรับระดับ (GDD ข้อ 4.2–4.4 และ 7): ฟังก์ชันล้วน ไม่อ่านเวลา ไม่สุ่ม ไม่แตะ store
// รับประวัติการตรวจคำตอบ (ถูก/ผิด/เวลา) แล้วบอกระดับถัดไป สถานะห้องซ่อม และดาว
//
// หมายเหตุสองข้อจาก GDD:
// - เวลาถูกบันทึกและสรุปให้ครู แต่ไม่ใช้ตัดสิน เพราะเกมผ่านด้วยความเข้าใจ ไม่ใช่ความเร็ว (GDD ข้อ 1)
// - "ข้าม" ได้เฉพาะห้องซ่อมที่ถูกเสนอ (canSkipRepair) การข้ามห้องเรียนไม่มีในเกม (GDD ข้อ 1 และ 4.4)
import { ADAPTIVE, type CheckMode, LEARNING_STYLES, type LearningStyle, TIERS, type Tier } from "./adaptive.config";

/** เหตุการณ์ในมินิเกมหนึ่งรอบ เรียงตามเวลา */
export type AdaptiveEvent =
  /** การตรวจคำตอบ 1 ครั้ง (GDD ข้อ 4.2) timeMs = เวลาที่ใช้ตั้งแต่เหตุการณ์ก่อนหน้า */
  | { type: "check"; correct: boolean; timeMs: number }
  /** ผู้เล่นออกจากห้องซ่อมแล้วกลับมาเล่นต่อ */
  | { type: "repair" };

export type RepairStatus = "none" | "offer" | "required";

export interface MinigameState {
  /** ระดับที่ใช้กับการตรวจครั้งถัดไป */
  tier: Tier;
  checkMode: CheckMode;
  peeksAllowed: number;
  consecutiveMisses: number;
  /** ผิดสะสมทั้งมินิเกม ใช้คิดดาว ไม่รีเซ็ตเมื่อเข้าห้องซ่อม */
  totalMisses: number;
  /** ผิดสะสมตั้งแต่ออกจากห้องซ่อมครั้งล่าสุด ใช้ตัดสินการบังคับเข้าห้องซ่อม */
  missesSinceRepair: number;
  /** none = เล่นต่อ, offer = เสนอห้องซ่อม (ปฏิเสธได้), required = ต้องเข้าห้องซ่อมก่อนเล่นต่อ */
  repair: RepairStatus;
  /** ผู้เล่นเลือกไม่เข้าห้องซ่อมได้หรือไม่ เป็น false เมื่อถูกบังคับ */
  canSkipRepair: boolean;
  repairVisits: number;
  /** เคยถูกบังคับเข้าห้องซ่อมในมินิเกมนี้หรือไม่ มีผลต่อระดับเริ่มต้นของห้องถัดไป */
  requiredRepair: boolean;
  stars: number;
  /** สรุปสำหรับครู ไม่ใช้ตัดสิน */
  summary: { checks: number; correct: number; totalTimeMs: number; averageTimeMs: number };
}

/** ผลของห้องที่เล่นจบแล้ว ใช้ตั้งระดับเริ่มต้นของห้องถัดไป */
export interface RoomOutcome {
  totalMisses: number;
  requiredRepair: boolean;
}

/** เลื่อนระดับตามจำนวนขั้น ไม่เกินขอบบนและล่าง */
export function shiftTier(tier: Tier, steps: number): Tier {
  const index = Math.min(TIERS.length - 1, Math.max(0, TIERS.indexOf(tier) + steps));
  return TIERS[index];
}

/** ระดับจากแบบทดสอบก่อนเรียนของหัวข้อนั้น (GDD ข้อ 7.1) */
export function pretestTier(correct: number): Tier {
  const table = ADAPTIVE.tierByPretestCorrect;
  return table[Math.min(table.length - 1, Math.max(0, Math.floor(correct)))];
}

/** ดาวประจำห้องจากจำนวนผิดสะสม (GDD ข้อ 4.4) */
export function starsFor(misses: number): number {
  return (ADAPTIVE.stars.find((row) => misses <= row.maxMisses) ?? ADAPTIVE.stars[ADAPTIVE.stars.length - 1]).stars;
}

/** ประเมินมินิเกมจากประวัติทั้งหมดตั้งแต่เริ่ม (GDD ข้อ 4.2 และ 7.2–7.3) */
export function evaluateMinigame(startTier: Tier, events: readonly AdaptiveEvent[]): MinigameState {
  let tier = startTier;
  let consecutiveMisses = 0;
  let totalMisses = 0;
  let missesSinceRepair = 0;
  let repairVisits = 0;
  let requiredRepair = false;
  let offer = false;
  let checks = 0;
  let correct = 0;
  let totalTimeMs = 0;

  for (const event of events) {
    // ข้อเสนอห้องซ่อมมีผลเฉพาะทันทีหลังการตรวจที่ทำให้เกิด เหตุการณ์ถัดไปถือว่าผู้เล่นเลือกแล้ว
    offer = false;
    if (event.type === "repair") {
      // กลับจากห้องซ่อม: ระดับประคอง เริ่มนับผิดติดต่อกันใหม่ ผิดสะสมที่ใช้คิดดาวคงเดิม
      tier = TIERS[0];
      consecutiveMisses = 0;
      missesSinceRepair = 0;
      repairVisits++;
      continue;
    }
    checks++;
    totalTimeMs += Math.max(0, event.timeMs);
    if (event.correct) {
      correct++;
      consecutiveMisses = 0;
      continue;
    }
    consecutiveMisses++;
    totalMisses++;
    missesSinceRepair++;
    if (consecutiveMisses % ADAPTIVE.consecutiveMissesToOfferRepair === 0) {
      tier = shiftTier(tier, -1);
      offer = true;
    }
    if (missesSinceRepair >= ADAPTIVE.missesToRequireRepair) requiredRepair = true;
  }

  const required = missesSinceRepair >= ADAPTIVE.missesToRequireRepair;
  const repair: RepairStatus = required ? "required" : offer ? "offer" : "none";
  return {
    tier,
    checkMode: ADAPTIVE.checkMode[tier],
    peeksAllowed: ADAPTIVE.peeks[tier],
    consecutiveMisses,
    totalMisses,
    missesSinceRepair,
    repair,
    canSkipRepair: repair !== "required",
    repairVisits,
    requiredRepair,
    stars: starsFor(totalMisses),
    summary: { checks, correct, totalTimeMs, averageTimeMs: checks === 0 ? 0 : Math.round(totalTimeMs / checks) },
  };
}

/**
 * ระดับเริ่มต้นของห้อง: ระดับจากแบบทดสอบก่อนเรียนของหัวข้อนั้น ปรับตามผลของห้องก่อนหน้า (GDD ข้อ 7.2)
 * สูงขึ้น 1 ขั้นเมื่อห้องก่อนหน้าผ่านมินิเกมโดยไม่ผิดเลย ต่ำลง 1 ขั้นเมื่อห้องก่อนหน้าถูกบังคับเข้าห้องซ่อม
 */
export function roomStartTier(pretestCorrect: number, previous: RoomOutcome | null): Tier {
  const base = pretestTier(pretestCorrect);
  if (!previous) return base;
  if (previous.requiredRepair) return shiftTier(base, -1);
  if (previous.totalMisses === 0) return shiftTier(base, 1);
  return base;
}

/** เสนอให้เปลี่ยนสไตล์การเรียนเมื่อห้องล่าสุดที่เล่นจบติดกันถูกบังคับเข้าห้องซ่อมทุกห้อง (GDD ข้อ 7.2) */
export function shouldSuggestStyleChange(outcomesInRoomOrder: readonly RoomOutcome[]): boolean {
  const n = ADAPTIVE.requiredRepairRoomsToSuggestStyle;
  return outcomesInRoomOrder.length >= n && outcomesInRoomOrder.slice(-n).every((o) => o.requiredRepair);
}

/** สไตล์ถัดไปที่ห้องซ่อมใช้ทบทวน วนตามลำดับใน LEARNING_STYLES (GDD ข้อ 7.3) */
export function nextStyle(style: LearningStyle): LearningStyle {
  return LEARNING_STYLES[(LEARNING_STYLES.indexOf(style) + 1) % LEARNING_STYLES.length];
}

/** ออกจากห้องซ่อมได้เมื่อผลการฝึกล่าสุดถูกติดต่อกันครบตามเกณฑ์ (GDD ข้อ 7.3) */
export function repairPracticeDone(results: readonly boolean[]): boolean {
  const n = ADAPTIVE.repairExitStreak;
  return results.length >= n && results.slice(-n).every(Boolean);
}
