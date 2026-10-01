// แดชบอร์ดผู้สอน: ฟังก์ชัน serverless ของ Vercel (POST /api/teacher)
//
// ผู้เรียนอ่านได้เฉพาะแถวของตัวเอง (RLS ใน supabase/schema.sql) ข้อมูลทั้งห้องจึงอ่านได้ทางเดียวคือฟังก์ชันนี้
// ซึ่งตรวจรหัสผ่านครู (TEACHER_PASSWORD) แล้วอ่านด้วย service role key ทั้งสองค่าอยู่ใน environment ของเซิร์ฟเวอร์เท่านั้น
// ห้ามตั้งชื่อตัวแปรสองตัวนี้ขึ้นต้นด้วย VITE_ เพราะ Vite จะฝังค่าลงในโค้ดฝั่งเบราว์เซอร์
//
// ไฟล์นี้ไม่ import โค้ดจาก src/ เพื่อให้ Vercel build ได้โดยไม่ขึ้นกับการตั้งค่า bundler ของ Vite
import { createHash, timingSafeEqual } from "node:crypto";

export interface TeacherEnv {
  TEACHER_PASSWORD?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface TeacherResult {
  status: number;
  body: { players: unknown[] } | { deleted: number } | { error: string };
}

/** ต้องตรงกับ CLASS_CODE_PATTERN ใน src/state/progressStore.ts และ supabase/schema.sql (มีเทสต์ตรวจ) */
export const CLASS_CODE = /^[A-Z0-9_-]{1,20}$/;
/** รหัสผ่านที่สั้นกว่านี้ถือว่ายังไม่ได้ตั้งค่า */
export const MIN_PASSWORD_CHARS = 8;
const MAX_ROWS = 2000;
const WRONG_PASSWORD_DELAY_MS = 600;
const COLUMNS = "id,class_code,display_name,data,resume_code,created_at,updated_at,archived_at";

/** เทียบรหัสผ่านด้วยเวลาคงที่ (เทียบค่าแฮชซึ่งยาวเท่ากันเสมอ) */
function samePassword(given: string, expected: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handleTeacher(input: unknown, env: TeacherEnv, fetchFn: typeof fetch = fetch, delayMs = WRONG_PASSWORD_DELAY_MS): Promise<TeacherResult> {
  if (!env.TEACHER_PASSWORD || env.TEACHER_PASSWORD.length < MIN_PASSWORD_CHARS) return { status: 503, body: { error: "not_configured" } };
  const { password, classCode, action = "list" } = (input && typeof input === "object" ? input : {}) as { password?: unknown; classCode?: unknown; action?: unknown };

  if (typeof password !== "string" || !samePassword(password, env.TEACHER_PASSWORD)) {
    // หน่วงคำตอบ ทำให้การเดารหัสผ่านทีละคำช้าลง
    await wait(delayMs);
    return { status: 401, body: { error: "wrong_password" } };
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503, body: { error: "no_database" } };
  if (classCode !== undefined && classCode !== "" && (typeof classCode !== "string" || !CLASS_CODE.test(classCode))) return { status: 400, body: { error: "bad_class_code" } };
  if (action !== "list" && action !== "delete-class") return { status: 400, body: { error: "bad_action" } };

  const base = `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/players`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const filter = classCode ? `&class_code=eq.${encodeURIComponent(classCode as string)}` : "";

  try {
    if (action === "delete-class") {
      // ลบข้อมูลทั้งห้องเมื่อจบภาคเรียน ต้องระบุรหัสห้องเรียนเสมอ ไม่มีคำสั่งลบทั้งฐานข้อมูล
      if (!classCode) return { status: 400, body: { error: "class_code_required" } };
      const response = await fetchFn(`${base}?select=id${filter}`, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
      if (!response.ok) return { status: 502, body: { error: `database_${response.status}` } };
      return { status: 200, body: { deleted: ((await response.json()) as unknown[]).length } };
    }
    const response = await fetchFn(`${base}?select=${COLUMNS}${filter}&order=updated_at.desc&limit=${MAX_ROWS}`, { headers });
    if (!response.ok) return { status: 502, body: { error: `database_${response.status}` } };
    return { status: 200, body: { players: (await response.json()) as unknown[] } };
  } catch {
    return { status: 502, body: { error: "database_unreachable" } };
  }
}

export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const result = await handleTeacher(input, process.env as TeacherEnv);
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
