// ตัวเลขกติกาจาก docs/GDD.md ที่ไม่เกี่ยวกับการปรับระดับ (ส่วนนั้นอยู่ใน adaptive.config.ts)
// ไฟล์นี้ไม่ import อะไร เพื่อให้สคริปต์ตรวจ (scripts/check-coverage.ts) อ่านได้ตรง ๆ

/** ความยาวขั้นต่ำของคำตอบแบบพิมพ์ (GDD ข้อ 4.5) */
export const MIN_ANSWER_CHARS = 20;

/** ความยาวขั้นต่ำของช่องสั้นในฟอร์มกิจกรรม เช่น ชื่อบริการ */
export const MIN_SHORT_ANSWER_CHARS = 3;

/** ความยาวสูงสุดของคำตอบแบบพิมพ์หนึ่งช่อง (ทุกช่องรวมกันต้องไม่เกินขนาดที่ supabase/schema.sql รับ) */
export const MAX_ANSWER_CHARS = 1500;

/** ความยาวสูงสุดของชื่อผู้เล่น */
export const MAX_NAME_CHARS = 40;

/** บันทึกเวลาที่อยู่ในห้องทุกช่วงเวลานี้ (มิลลิวินาที) */
export const ROOM_TIME_TICK_MS = 15000;

/** ไม่แตะจอหรือคีย์บอร์ดนานเกินนี้ ถือว่าไม่ได้เล่นอยู่ ไม่นับเวลา */
export const IDLE_AFTER_MS = 120000;

/** ห้องที่เล่นได้ เรียงตามเส้นทาง 1→6 */
export const PLAYABLE_ROOMS: readonly number[] = [1, 2, 3, 4, 5, 6];

/** ชนิดมินิเกมที่เกมมีตัวเล่นแล้ว ต้องตรงกับตัวสร้างด่านใน src/ui/minigames/MinigameOverlay.tsx (TypeScript บังคับ) */
export const IMPLEMENTED_MINIGAMES = ["match-terms", "sort-cases", "sort-items", "order-steps", "accuracy", "match-table"] as const;
