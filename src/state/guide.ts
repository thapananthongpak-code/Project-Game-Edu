// ไกด์นำทางและสอนเล่นสำหรับผู้เริ่มต้น (GDD ข้อ 23): ฟังก์ชันล้วน ข้ามได้ทุกเมื่อ ไม่มีผลต่อการเล่น การวัดผล หรือเครดิต
import type { RoomProgress } from "./progressStore";

/** ขั้นของการสอนเล่นครั้งแรก (ทำเสร็จเมื่อผู้เล่นทำจริง ไม่ใช่กดถัดไป ยกเว้นขั้น goal ที่เป็นข้อความอธิบาย) */
export const GUIDE_STEPS = ["move", "questlog", "goal", "door"] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/** คำแนะนำครั้งแรกของแต่ละที่ แสดงครั้งเดียวเมื่อไปถึงครั้งแรก */
export const TIP_IDS = ["room", "hangar", "market", "lab"] as const;
export type TipId = (typeof TIP_IDS)[number];

/** รหัสในบันทึก: tutorial = จบหรือข้ามการสอนแล้ว, tips-off = ไม่ต้องแสดงคำแนะนำอีก, tip:<ที่> = เห็นคำแนะนำของที่นั้นแล้ว */
export const TIP_ENTRY = /^(?:tutorial|tips-off|tip:(?:room|hangar|market|lab))$/;
export const TUTORIAL_DONE = "tutorial";
export const TIPS_OFF = "tips-off";

interface Untouched {
  progress: Record<number, RoomProgress | undefined>;
  battles: Record<string, unknown>;
}

const untouched = ({ progress, battles }: Untouched): boolean =>
  Object.keys(battles).length === 0 && Object.values(progress).every((room) => !room || (room.stationsSeen === 0 && !room.minigameDone && !room.core));

/**
 * ควรสอนเล่นตอนนี้หรือไม่: ยังไม่จบหรือข้าม ทำแบบทดสอบก่อนเรียนและดูบทนำเสร็จแล้ว และเป็นผู้เล่นที่ยังไม่เคยทำอะไรในเกม
 * (ผู้เล่นเดิมที่มีความคืบหน้าอยู่แล้วไม่ถูกสอน) หรือผู้เล่นขอดูการสอนอีกครั้ง (replay)
 */
export function guideDue(state: Untouched & { tips: readonly string[]; hasPretest: boolean; storySeen: readonly string[]; replay: boolean }): boolean {
  if (state.tips.includes(TUTORIAL_DONE)) return false;
  if (!state.hasPretest || !state.storySeen.includes("prologue")) return false;
  return state.replay || untouched(state);
}

/** คำแนะนำของที่ที่ผู้เล่นอยู่ (screen ของเกม) ที่ยังไม่เคยแสดง ไม่มีคืน null */
export function tipDue(screen: string, tips: readonly string[]): TipId | null {
  if (tips.includes(TIPS_OFF)) return null;
  const id = TIP_IDS.find((tip) => tip === screen);
  return id && !tips.includes(`tip:${id}`) ? id : null;
}
