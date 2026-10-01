import { describe, expect, it, vi } from "vitest";
import { CLASS_CODE, handleTeacher, MIN_PASSWORD_CHARS } from "../../api/teacher";
import { CLASS_CODE_PATTERN } from "../state/progressStore";

const env = { TEACHER_PASSWORD: "ครู-secret-2567", SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
const ok = (body: unknown) => vi.fn(async () => Response.json(body));
const call = (input: unknown, fetchFn: typeof fetch, overrides: Partial<typeof env> = {}) => handleTeacher(input, { ...env, ...overrides }, fetchFn, 0);

describe("/api/teacher", () => {
  it("รหัสผ่านถูก: อ่านผู้เรียนด้วย service role key ซึ่งไม่อยู่ในคำตอบ", async () => {
    const fetchFn = ok([{ id: "1", display_name: "แก้ว" }]);
    const result = await call({ password: "ครู-secret-2567" }, fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ status: 200, body: { players: [{ id: "1", display_name: "แก้ว" }] } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/example\.supabase\.co\/rest\/v1\/players\?select=/);
    expect(url).not.toContain("class_code=");
    expect(init.headers).toMatchObject({ apikey: "service-key", Authorization: "Bearer service-key" });
    expect(JSON.stringify(result.body)).not.toContain("service-key");
  });

  it("รหัสผ่านผิด ว่าง หรือไม่ใช่ข้อความ: 401 และไม่แตะฐานข้อมูล", async () => {
    for (const input of [{ password: "ครู-secret-2568" }, { password: "" }, {}, null, { password: { $ne: "" } }]) {
      const fetchFn = ok([]);
      expect(await call(input, fetchFn as unknown as typeof fetch)).toEqual({ status: 401, body: { error: "wrong_password" } });
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("ยังไม่ตั้งรหัสผ่าน หรือสั้นเกินไป: ปิดไว้ ไม่มีใครเข้าได้แม้ส่งรหัสตรงกัน", async () => {
    const fetchFn = ok([]);
    for (const password of [undefined, "", "a".repeat(MIN_PASSWORD_CHARS - 1)]) {
      expect(await call({ password: password ?? "" }, fetchFn as unknown as typeof fetch, { TEACHER_PASSWORD: password })).toEqual({ status: 503, body: { error: "not_configured" } });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("ยังไม่ตั้งค่าฐานข้อมูล: 503 no_database", async () => {
    expect(await call({ password: env.TEACHER_PASSWORD }, ok([]) as unknown as typeof fetch, { SUPABASE_SERVICE_ROLE_KEY: undefined })).toEqual({ status: 503, body: { error: "no_database" } });
  });

  it("กรองตามรหัสห้องเรียน และปฏิเสธรหัสที่ผิดรูปแบบ (กันการแทรกเงื่อนไขในคำค้น)", async () => {
    const fetchFn = ok([]);
    await call({ password: env.TEACHER_PASSWORD, classCode: "PVC1-67" }, fetchFn as unknown as typeof fetch);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain("&class_code=eq.PVC1-67&");
    for (const classCode of ["PVC1&select=*", "a b", "x".repeat(21), 5]) {
      expect(await call({ password: env.TEACHER_PASSWORD, classCode }, fetchFn as unknown as typeof fetch)).toEqual({ status: 400, body: { error: "bad_class_code" } });
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("ลบข้อมูล: ต้องระบุห้องเรียนเสมอ และลบเฉพาะห้องนั้น", async () => {
    const fetchFn = ok([{ id: "1" }, { id: "2" }]);
    expect(await call({ password: env.TEACHER_PASSWORD, action: "delete-class" }, fetchFn as unknown as typeof fetch)).toEqual({ status: 400, body: { error: "class_code_required" } });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await call({ password: env.TEACHER_PASSWORD, action: "delete-class", classCode: "PVC1" }, fetchFn as unknown as typeof fetch)).toEqual({ status: 200, body: { deleted: 2 } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/players?select=id&class_code=eq.PVC1");
    expect(init.method).toBe("DELETE");
    expect(await call({ password: env.TEACHER_PASSWORD, action: "drop" }, fetchFn as unknown as typeof fetch)).toEqual({ status: 400, body: { error: "bad_action" } });
  });

  it("ฐานข้อมูลตอบผิดพลาดหรือเชื่อมต่อไม่ได้: 502 ไม่ส่งรายละเอียดภายในออกไป", async () => {
    const failing = vi.fn(async () => new Response("secret detail", { status: 500 }));
    expect(await call({ password: env.TEACHER_PASSWORD }, failing as unknown as typeof fetch)).toEqual({ status: 502, body: { error: "database_500" } });
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await call({ password: env.TEACHER_PASSWORD }, down as unknown as typeof fetch)).toEqual({ status: 502, body: { error: "database_unreachable" } });
  });

  it("รูปแบบรหัสห้องเรียนตรงกับฝั่งเกม", () => {
    expect(CLASS_CODE.source).toBe(CLASS_CODE_PATTERN.source);
  });
});
