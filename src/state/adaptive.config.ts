// ค่าคงที่ของระบบ Personalized Education (docs/GDD.md ข้อ 4.2–4.4 และ 7)
// ตัวเลขทุกตัวของ src/state/adaptive.ts อยู่ที่นี่ แก้ที่นี่ที่เดียวเมื่อ GDD เปลี่ยน

/** ระดับความช่วยเหลือ เรียงจากช่วยมากที่สุดไปหาท้าทายที่สุด (GDD ข้อ 4.3) */
export const TIERS = ["assist", "standard", "challenge"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * รูปแบบการนำเสนอเนื้อหา (GDD ข้อ 7.4): read = ข้อความและตารางเต็ม ใช้กับบทสอน, visual = เน้นคำสำคัญและตารางเป็นการ์ด ใช้กับห้องซ่อม
 * ผู้เล่นไม่ได้เลือกเอง (ตัวเลือกของผู้เล่นคือระดับความยาก ใน src/state/campaign.ts)
 */
export type PageStyle = "read" | "visual";

export type CheckMode = "piece" | "round";

export const ADAPTIVE = {
  /** แบบทดสอบก่อนเรียน: ข้อต่อหัวข้อ และระดับเริ่มต้นตามจำนวนข้อที่ถูก (index = จำนวนข้อถูก) */
  pretestItemsPerTopic: 2,
  tierByPretestCorrect: ["assist", "standard", "challenge"] as readonly Tier[],

  /** ผิดติดต่อกันครบจำนวนนี้: ลดระดับ 1 ขั้นและเสนอห้องซ่อม */
  consecutiveMissesToOfferRepair: 2,
  /** ผิดสะสมครบจำนวนนี้ (นับใหม่หลังออกจากห้องซ่อม): ต้องเข้าห้องซ่อมก่อนเล่นต่อ */
  missesToRequireRepair: 4,
  /** ออกจากห้องซ่อมได้เมื่อตอบถูกติดต่อกันครบจำนวนนี้ */
  repairExitStreak: 2,

  /** จำนวนครั้งที่เปิดอ่านแผงอ้างอิงได้ต่อมินิเกม */
  peeks: { assist: Number.POSITIVE_INFINITY, standard: 2, challenge: 0 } as Record<Tier, number>,
  /** ตรวจทีละชิ้น หรือตรวจทั้งรอบเมื่อกดส่งคำตอบ */
  checkMode: { assist: "piece", standard: "piece", challenge: "round" } as Record<Tier, CheckMode>,

  /** ดาวจากจำนวนผิดสะสม: ใช้แถวแรกที่ผิดสะสมไม่เกิน maxMisses */
  stars: [
    { maxMisses: 0, stars: 3 },
    { maxMisses: 2, stars: 2 },
    { maxMisses: Number.POSITIVE_INFINITY, stars: 1 },
  ],
} as const;
