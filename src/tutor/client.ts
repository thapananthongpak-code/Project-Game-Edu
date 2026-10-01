import { TUTOR } from "./config";

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

export type TutorAnswer = { kind: "reply"; text: string } | { kind: "fallback"; reason: string };

/** ถามติวเตอร์ AI ผ่านฟังก์ชันฝั่งเซิร์ฟเวอร์ ทุกความล้มเหลวกลายเป็น fallback ให้เกมแสดงคำใบ้สำเร็จรูป */
export async function askTutor(room: number, messages: TutorTurn[]): Promise<TutorAnswer> {
  try {
    const response = await fetch(TUTOR.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, messages }),
      signal: AbortSignal.timeout(TUTOR.timeoutMs),
    });
    if (!response.ok) return { kind: "fallback", reason: `http_${response.status}` };
    const data = (await response.json()) as { reply?: string; fallback?: boolean; reason?: string };
    if (typeof data.reply === "string" && data.reply.trim()) return { kind: "reply", text: data.reply };
    return { kind: "fallback", reason: data.reason ?? "empty" };
  } catch {
    return { kind: "fallback", reason: "network" };
  }
}

const USED_KEY = "ai-trainer-quest-tutor-used";

/** จำนวนคำถามที่ถามไปแล้วในเซสชันของเบราว์เซอร์นี้ */
export function tutorUsed(): number {
  try {
    return Number(window.sessionStorage.getItem(USED_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function recordTutorUse(): number {
  const used = tutorUsed() + 1;
  try {
    window.sessionStorage.setItem(USED_KEY, String(used));
  } catch {
    // ไม่มี sessionStorage: นับได้แค่ในหน่วยความจำของหน้านี้ ซึ่งฝั่งเซิร์ฟเวอร์จำกัดความยาวบทสนทนาอยู่แล้ว
  }
  return used;
}
