// ทดสอบ supabase/schema.sql กับ Postgres จริง (PGlite) โดยจำลองส่วนของ Supabase ที่ schema พึ่ง:
// ตาราง auth.users ฟังก์ชัน auth.uid() และ role anon / authenticated / service_role
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CAROL = "33333333-3333-4333-8333-333333333333";
const save = { version: 3, profile: { name: "เอ" }, rooms: {} };

let db: PGlite;

/** รันคำสั่งในฐานะผู้เรียนที่ล็อกอินแบบไม่ระบุตัวตน */
async function as<T>(user: string | null, role: "authenticated" | "anon", run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  try {
    return await run();
  } finally {
    await db.exec("reset role;");
  }
}
const student = <T>(user: string, run: () => Promise<T>) => as(user, "authenticated", run);
const saveProgress = (user: string, name: string, data: object = save, classCode = "pvc1") =>
  student(user, async () => (await db.query<{ code: string }>("select public.save_progress($1, $2, $3) as code", [classCode, name, JSON.stringify(data)])).rows[0].code);
const rows = <T>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    -- Supabase ให้สิทธิ์ทุกอย่างกับตารางใหม่ใน public เป็นค่าเริ่มต้น schema ต้องถอนเอง
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    insert into auth.users values ('${ALICE}'), ('${BOB}'), ('${CAROL}');
  `);
  await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
});

describe("supabase/schema.sql", () => {
  it("รันซ้ำได้โดยไม่ผิดพลาด", async () => {
    await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  });

  it("บันทึกแล้วอ่านกลับได้ รหัสห้องเรียนถูกปรับเป็นตัวพิมพ์ใหญ่ และได้รหัสเล่นต่อ 10 ตัว", async () => {
    const code = await saveProgress(ALICE, "  เอ  ");
    expect(code).toMatch(/^[0-9A-F]{10}$/);
    const mine = await student(ALICE, () => rows<{ class_code: string; display_name: string; data: typeof save; resume_code: string }>("select class_code, display_name, data, resume_code from public.players"));
    expect(mine).toEqual([{ class_code: "PVC1", display_name: "เอ", data: save, resume_code: code }]);
  });

  it("บันทึกซ้ำแก้แถวเดิม ไม่สร้างแถวใหม่ และรหัสเล่นต่อไม่เปลี่ยน", async () => {
    const first = await saveProgress(ALICE, "เอ");
    const second = await saveProgress(ALICE, "เอ", { ...save, rooms: { 1: { core: true } } });
    expect(second).toBe(first);
    expect(await rows("select 1 from public.players where display_name = 'เอ'")).toHaveLength(1);
  });

  it("ผู้เรียนเห็นเฉพาะแถวของตัวเอง", async () => {
    await saveProgress(ALICE, "เอ");
    await saveProgress(BOB, "บี");
    expect((await student(ALICE, () => rows<{ display_name: string }>("select display_name from public.players"))).map((r) => r.display_name)).toEqual(["เอ"]);
    expect((await student(BOB, () => rows<{ display_name: string }>("select display_name from public.players"))).map((r) => r.display_name)).toEqual(["บี"]);
    expect(await student(CAROL, () => rows("select 1 from public.players"))).toEqual([]);
    expect(await student(BOB, () => rows("select 1 from public.player_devices"))).toHaveLength(1);
  });

  it("ผู้เรียนเขียนตารางโดยตรงไม่ได้ ต้องผ่านฟังก์ชันเท่านั้น", async () => {
    await saveProgress(ALICE, "เอ");
    await expect(student(BOB, () => db.query("update public.players set display_name = 'แก้'"))).rejects.toThrow(/permission denied/);
    await expect(student(BOB, () => db.query("delete from public.players"))).rejects.toThrow(/permission denied/);
    await expect(student(BOB, () => db.query("insert into public.players (class_code, display_name, data, resume_code) values ('X', 'x', '{}', 'ABCDEF0123')"))).rejects.toThrow(/permission denied/);
    await expect(student(BOB, () => db.query(`insert into public.player_devices (user_id, player_id) select '${BOB}', id from public.players`))).rejects.toThrow(/permission denied/);
    expect(await rows("select 1 from public.players where display_name = 'แก้'")).toEqual([]);
  });

  it("ผู้ที่ยังไม่ล็อกอิน (anon) อ่านและเรียกฟังก์ชันไม่ได้", async () => {
    await expect(as(null, "anon", () => db.query("select * from public.players"))).rejects.toThrow(/permission denied/);
    await expect(as(null, "anon", () => db.query("select public.save_progress('A', 'x', '{}')"))).rejects.toThrow(/permission denied/);
    await expect(as(null, "anon", () => db.query("select * from public.claim_progress('ABCDEF0123')"))).rejects.toThrow(/permission denied/);
  });

  it("ตรวจข้อมูลเข้า: รหัสห้องเรียน ชื่อ และขนาดข้อมูล", async () => {
    await expect(saveProgress(CAROL, "ซี", save, "ห้อง 1")).rejects.toThrow(/invalid class code/);
    await expect(saveProgress(CAROL, "ซี", save, "")).rejects.toThrow(/invalid class code/);
    await expect(saveProgress(CAROL, "   ")).rejects.toThrow(/invalid display name/);
    await expect(saveProgress(CAROL, "x".repeat(41))).rejects.toThrow(/invalid display name/);
    await expect(saveProgress(CAROL, "ซี", { blob: "x".repeat(200001) })).rejects.toThrow(/invalid data/);
    expect(await rows("select 1 from public.player_devices where user_id = $1", [CAROL])).toEqual([]);
  });

  it("ครู (service role) อ่านได้ทุกแถวของห้อง", async () => {
    await saveProgress(ALICE, "เอ");
    await saveProgress(BOB, "บี");
    const all = await as(null, "anon", async () => {
      await db.exec("reset role; set role service_role;");
      return rows<{ display_name: string }>("select display_name from public.players where class_code = 'PVC1' and archived_at is null order by display_name");
    });
    expect(all.map((r) => r.display_name)).toEqual(["บี", "เอ"]);
  });

  it("ย้ายเครื่องด้วยรหัสเล่นต่อ: เครื่องใหม่ได้ข้อมูลเดิม เครื่องเก่ายังใช้ได้ ไม่เกิดแถวซ้ำ", async () => {
    const code = await saveProgress(ALICE, "เอ", { ...save, rooms: { 2: { core: true } } });
    const claimed = await student(CAROL, () => rows<{ data: { rooms: object }; resume_code: string }>("select * from public.claim_progress($1)", [` ${code.toLowerCase()} `]));
    expect(claimed).toEqual([{ data: { ...save, rooms: { 2: { core: true } } }, resume_code: code }]);
    // เครื่องใหม่บันทึกต่อในแถวเดิม
    await saveProgress(CAROL, "เอ", { ...save, rooms: { 3: { core: true } } });
    expect(await rows("select 1 from public.players where display_name = 'เอ' and archived_at is null")).toHaveLength(1);
    expect((await student(ALICE, () => rows<{ data: { rooms: object } }>("select data from public.players")))[0].data.rooms).toEqual({ 3: { core: true } });
  });

  it("รหัสเล่นต่อที่ผิด: ไม่ได้ข้อมูลและไม่เปลี่ยนการเชื่อมของเครื่อง", async () => {
    await saveProgress(BOB, "บี");
    expect(await student(BOB, () => rows("select * from public.claim_progress('0000000000')"))).toEqual([]);
    expect((await student(BOB, () => rows<{ display_name: string }>("select display_name from public.players"))).map((r) => r.display_name)).toEqual(["บี"]);
  });

  it("เริ่มเกมใหม่: แถวเดิมถูกเก็บถาวรให้ครู ผู้เรียนไม่เห็นแล้ว และการบันทึกครั้งถัดไปสร้างแถวใหม่", async () => {
    await saveProgress(BOB, "บี");
    await student(BOB, () => db.query("select public.reset_progress()"));
    expect(await student(BOB, () => rows("select 1 from public.players"))).toEqual([]);
    expect(await rows("select 1 from public.players where display_name = 'บี' and archived_at is not null")).toHaveLength(1);
    const code = await saveProgress(BOB, "บี รอบสอง");
    expect(await rows("select 1 from public.players where display_name = 'บี รอบสอง' and archived_at is null and resume_code = $1", [code])).toHaveLength(1);
  });

  it("เครื่องที่ใช้ร่วมกัน: ผู้เรียนคนใหม่เริ่มเล่นบนเครื่องเดิม ข้อมูลของคนเดิมยังอยู่และเล่นต่อที่เครื่องอื่นได้", async () => {
    const DAN = "44444444-4444-4444-8444-444444444444";
    const EVE = "55555555-5555-4555-8555-555555555555";
    await db.exec(`insert into auth.users values ('${DAN}'), ('${EVE}') on conflict do nothing`);
    const first = await saveProgress(DAN, "คาบเช้า", { ...save, rooms: { 4: { core: true } } });
    await student(DAN, () => db.query("select public.detach_device()"));
    expect(await student(DAN, () => rows("select 1 from public.players"))).toEqual([]);
    // คนใหม่ลงทะเบียนบนเครื่องเดิม: ได้แถวของตัวเอง แถวของคนเดิมไม่ถูกเก็บถาวร
    const second = await saveProgress(DAN, "คาบบ่าย");
    expect(second).not.toBe(first);
    expect(await rows("select 1 from public.players where display_name = 'คาบเช้า' and archived_at is null")).toHaveLength(1);
    // คนเดิมเล่นต่อที่อีกเครื่องด้วยรหัส
    const claimed = await student(EVE, () => rows<{ data: { rooms: object } }>("select * from public.claim_progress($1)", [first]));
    expect(claimed[0].data.rooms).toEqual({ 4: { core: true } });
    // คนเดิมกลับมาเล่นต่อบนเครื่องร่วม: ข้อมูลของคนคาบบ่ายต้องไม่ถูกเก็บถาวร และยังใช้รหัสของเขาได้
    await student(DAN, () => rows("select * from public.claim_progress($1)", [first]));
    expect(await rows("select 1 from public.players where display_name = 'คาบบ่าย' and archived_at is null")).toHaveLength(1);
    expect(await student(EVE, () => rows("select * from public.claim_progress($1)", [second]))).toHaveLength(1);
  });

  it("ผู้ที่ยังไม่ล็อกอินเรียก detach_device ไม่ได้", async () => {
    await expect(as(null, "anon", () => db.query("select public.detach_device()"))).rejects.toThrow();
  });

  it("แถวที่เก็บถาวรแล้วใช้รหัสเล่นต่อไม่ได้", async () => {
    const [{ resume_code }] = await rows<{ resume_code: string }>("select resume_code from public.players where archived_at is not null limit 1");
    expect(await student(CAROL, () => rows("select * from public.claim_progress($1)", [resume_code]))).toEqual([]);
  });
});
