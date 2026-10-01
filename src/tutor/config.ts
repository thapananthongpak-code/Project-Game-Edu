// ขีดจำกัดของติวเตอร์ฝั่งเกม ต้องตรงกับ TUTOR_LIMITS ใน api/tutor.ts (มีเทสต์ตรวจ)
export const TUTOR = {
  /** จำนวนคำถามที่ถามติวเตอร์ AI ได้ต่อเซสชันของเบราว์เซอร์ */
  questionsPerSession: 8,
  maxQuestionChars: 300,
  /** เวลารอคำตอบก่อนเปลี่ยนไปใช้คำใบ้สำเร็จรูป */
  timeoutMs: 30_000,
  endpoint: "/api/tutor",
} as const;
