// ทดสอบการซิงก์กับฐานข้อมูลกลางด้วยเบราว์เซอร์จริง โดยจำลอง Supabase ไว้ในสคริปต์นี้
// (โปรโตคอลเดียวกับที่ supabase-js เรียก: auth/v1/signup, rest/v1/players, rest/v1/rpc/*)
//
// ต้องเปิด dev server อีกตัวที่ชี้ไปยัง Supabase จำลอง:
//   VITE_SUPABASE_URL=http://localhost:5174/_sb VITE_SUPABASE_ANON_KEY=test-anon-key npx vite --port 5174 --strictPort
// แล้วรัน: npm run test:e2e:cloud
//
// กติกาของฐานข้อมูลจริง (RLS สิทธิ์เขียน การตรวจค่า) ทดสอบกับ Postgres ใน supabase/schema.test.ts
// สคริปต์นี้ตรวจฝั่งเกม: ล็อกอินไม่ระบุตัวตน ส่งข้อมูลเมื่อไร ไม่ส่งอะไร เล่นต่อจากเครื่องอื่น และเริ่มใหม่
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_CLOUD_URL ?? "http://localhost:5174/";
const quests = JSON.parse(readFileSync(new URL("../src/content/quests.json", import.meta.url), "utf8"));
const log = (message) => console.log(`  ✓ ${message}`);
const errors = [];

// ---------------------------------------------------------------- Supabase จำลอง (ทำตามกติกาใน supabase/schema.sql)
const db = { players: [], devices: new Map(), signups: 0, saves: 0, down: false };
const jwt = (userId) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
const userOf = (request) => JSON.parse(Buffer.from((request.headers().authorization ?? "").split(".")[1] ?? "", "base64url").toString() || "{}").sub;

async function supabase(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/_sb/, "");
  if (db.down) return route.abort("failed");
  if (request.headers().apikey !== "test-anon-key") return route.fulfill({ status: 401, json: { message: "bad apikey" } });

  if (path === "/auth/v1/signup") {
    const id = randomUUID();
    db.signups += 1;
    const now = new Date().toISOString();
    return route.fulfill({
      json: { access_token: jwt(id), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: randomUUID(), user: { id, aud: "authenticated", role: "authenticated", email: "", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: now, updated_at: now } },
    });
  }
  const user = userOf(request);
  if (!user) return route.fulfill({ status: 401, json: { message: "not signed in" } });
  const mine = () => db.players.find((player) => player.id === db.devices.get(user));

  if (path === "/rest/v1/players" && request.method() === "GET") {
    // RLS: เห็นเฉพาะแถวที่เชื่อมกับอุปกรณ์นี้
    const row = mine();
    return route.fulfill({ json: row && row.archived_at === null ? [{ data: row.data, resume_code: row.resume_code }] : [] });
  }
  if (path === "/rest/v1/rpc/save_progress") {
    const body = request.postDataJSON();
    if (!/^[A-Z0-9_-]{1,20}$/.test(body.p_class_code) || body.p_display_name.length < 1) return route.fulfill({ status: 400, json: { code: "22023", message: "invalid" } });
    db.saves += 1;
    let row = mine();
    if (!row) {
      row = { id: randomUUID(), resume_code: randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(), created_at: new Date().toISOString(), archived_at: null };
      db.players.push(row);
      db.devices.set(user, row.id);
    }
    Object.assign(row, { class_code: body.p_class_code, display_name: body.p_display_name, data: body.p_data, updated_at: new Date().toISOString() });
    return route.fulfill({ json: row.resume_code });
  }
  if (path === "/rest/v1/rpc/reset_progress") {
    const row = mine();
    db.devices.delete(user);
    // เก็บถาวรเมื่อไม่มีอุปกรณ์อื่นเชื่อมอยู่แล้ว (เหมือน supabase/schema.sql)
    if (row && ![...db.devices.values()].includes(row.id)) row.archived_at = new Date().toISOString();
    return route.fulfill({ status: 204, body: "" });
  }
  if (path === "/rest/v1/rpc/detach_device") {
    db.devices.delete(user);
    return route.fulfill({ status: 204, body: "" });
  }
  if (path === "/rest/v1/rpc/claim_progress") {
    const row = db.players.find((player) => player.resume_code === request.postDataJSON().p_code.toUpperCase() && player.archived_at === null);
    if (!row) return route.fulfill({ json: [] });
    db.devices.set(user, row.id);
    return route.fulfill({ json: [{ data: row.data, resume_code: row.resume_code }] });
  }
  return route.fulfill({ status: 404, json: { message: `ไม่ได้จำลอง ${request.method()} ${path}` } });
}

async function device(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.location().url.includes("/_sb/") && errors.push(`console: ${m.text()}`));
  await page.route("**/_sb/**", supabase);
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  return page;
}
const store = (page) => page.evaluate(() => window.__aitq.snapshot().store);
const synced = (page) => page.waitForFunction(() => window.__aitq.snapshot().store.sync === "synced", null, { timeout: 15000 });

async function register(page, name, classCode) {
  await page.getByTestId("menu-new").click();
  await page.getByTestId("player-name").fill(name);
  if (classCode !== null) await page.getByTestId("class-code").fill(classCode);
  return page.getByTestId("onboarding-next");
}

async function pretest(page) {
  await page.getByTestId("pretest").waitFor();
  const form = await page.getByTestId("pretest").getAttribute("data-form");
  for (let i = 0; i < quests.assessment[form].length; i++) {
    await page.getByTestId("choice-unknown").click();
    await page.waitForTimeout(30);
  }
  await page.getByTestId("assessment-finish").click();
  await page.waitForFunction(() => window.__aitq.snapshot().store.screen === "hall");
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  console.log("ฐานข้อมูลกลาง (Supabase จำลอง)");
  // --- เครื่องที่ 1: ลงทะเบียนพร้อมรหัสห้องเรียน
  const first = await device(browser);
  assert.equal(await first.getByTestId("menu-resume").count(), 1, "ตั้งค่าฐานข้อมูลแล้ว เมนูมีปุ่มเล่นต่อจากเครื่องอื่น");
  assert.equal(db.signups, 0, "เปิดเกมเฉย ๆ ยังไม่สร้างบัญชี");
  let next = await register(first, "แก้ว", "ปวช 1");
  assert.equal(await next.isDisabled(), true, "รหัสห้องเรียนผิดรูปแบบ: ไปต่อไม่ได้");
  await first.getByTestId("class-code").fill("pvc1-67");
  assert.equal(await next.isDisabled(), false);
  await next.click();
  await pretest(first);
  await synced(first);
  assert.equal(db.signups, 1, "ล็อกอินแบบไม่ระบุตัวตนครั้งเดียว ตอนส่งข้อมูลครั้งแรก");
  assert.equal(db.players.length, 1);
  const row = db.players[0];
  assert.deepEqual([row.class_code, row.display_name, row.data.version, row.data.pretest.items.length], ["PVC1-67", "แก้ว", 3, 12], "แถวในฐานข้อมูล: รหัสห้อง (ตัวพิมพ์ใหญ่) ชื่อที่แสดง และผลก่อนเรียนรายข้อ");
  assert.deepEqual(Object.keys(row.data).sort(), ["posttest", "pretest", "profile", "rooms", "updatedAt", "version"], "ไม่มีข้อมูลอื่นนอกจากความคืบหน้าในเกม");
  const code = (await store(first)).resumeCode;
  assert.equal(code, row.resume_code);
  await first.getByRole("button", { name: "สมุดเควส" }).click();
  assert.equal(await first.getByTestId("resume-code").innerText(), code);
  assert.equal(await first.getByTestId("sync").getAttribute("data-status"), "synced");
  await first.screenshot({ path: "test-results/25-cloud-profile.png" });
  await first.getByRole("button", { name: "ปิด" }).click();
  log(`เครื่องที่ 1: ลงทะเบียนด้วยรหัสห้อง PVC1-67 ข้อมูลขึ้นฐานข้อมูลกลาง สมุดเควสแสดงสถานะและรหัสเล่นต่อ ${code}`);

  // --- เปลี่ยนสไตล์การเรียน: ส่งขึ้นแบบหน่วง รวมหลายครั้งเป็นครั้งเดียว
  const savesBefore = db.saves;
  await first.getByRole("button", { name: "สมุดเควส" }).click();
  await first.getByTestId("style-visual").click();
  await first.getByTestId("style-hands").click();
  await first.getByRole("button", { name: "ปิด" }).click();
  await first.waitForFunction(() => window.__aitq.snapshot().store.sync === "pending");
  await synced(first);
  assert.equal(db.saves, savesBefore + 1, "การเปลี่ยนแปลงถี่ ๆ ถูกรวมเป็นการส่งครั้งเดียว");
  assert.equal(row.data.profile.style, "hands");
  log("การเปลี่ยนแปลงถี่ ๆ ถูกรวมแล้วส่งครั้งเดียว ฐานข้อมูลได้ค่าล่าสุด");

  // --- เครือข่ายล่ม: เกมยังเล่นและบันทึกในเครื่องได้ กลับมาแล้วส่งเอง
  db.down = true;
  await first.getByRole("button", { name: "สมุดเควส" }).click();
  await first.getByTestId("style-read").click();
  await first.waitForFunction(() => window.__aitq.snapshot().store.sync === "error", null, { timeout: 15000 });
  assert.match(await first.getByTestId("sync").innerText(), /ข้อมูลยังอยู่ในเครื่อง/);
  assert.equal(JSON.parse(await first.evaluate(() => localStorage.getItem("ai-trainer-quest-save"))).profile.style, "read");
  await first.getByRole("button", { name: "ปิด" }).click();
  db.down = false;
  await synced(first);
  assert.equal(row.data.profile.style, "read");
  log("เครือข่ายล่ม: บันทึกในเครื่องต่อได้ แจ้งสถานะ และส่งขึ้นเองเมื่อเครือข่ายกลับมา");

  // --- เครื่องที่ 2: เล่นต่อด้วยรหัส
  const second = await device(browser);
  await second.getByTestId("menu-resume").click();
  await second.getByTestId("resume-input").fill("0000000000");
  await second.getByTestId("resume-submit").click();
  await second.getByRole("alert").waitFor();
  assert.match(await second.getByRole("alert").innerText(), /ไม่พบรหัสนี้/);
  await second.getByTestId("resume-input").fill(code.toLowerCase());
  await second.getByTestId("resume-submit").click();
  await second.waitForFunction(() => window.__aitq.snapshot().store.screen === "hall");
  const moved = await store(second);
  assert.deepEqual([moved.profile.name, moved.profile.classCode, moved.pretest.items.length, moved.resumeCode], ["แก้ว", "PVC1-67", 12, code]);
  assert.equal(db.players.length, 1, "เล่นต่อจากเครื่องอื่นต้องไม่สร้างผู้เล่นซ้ำ");
  log("เครื่องที่ 2: รหัสผิดถูกปฏิเสธ รหัสถูกได้ความคืบหน้าเดิมและไม่สร้างแถวซ้ำ");

  // --- เปิดเครื่องที่ 2 ใหม่: โหลดจากฐานข้อมูลกลางได้เอง
  await second.reload();
  await second.waitForFunction(() => window.__aitq?.snapshot().store.ready && window.__aitq.snapshot().store.sync === "synced");
  assert.equal(await second.getByTestId("menu-continue").count(), 1);

  // --- เครื่องที่ใช้ร่วมกัน: ผู้เรียนคนใหม่มาใช้เครื่องที่ 2 ข้อมูลของแก้วต้องไม่หายและไม่ถูกเก็บถาวร
  assert.match(await second.getByTestId("menu-continue").innerText(), /เล่นต่อ \(แก้ว\)/);
  await second.getByTestId("menu-new").click();
  assert.match(await second.getByTestId("reset-confirm").innerText(), /ถ้าคุณไม่ใช่ แก้ว/);
  await second.screenshot({ path: "test-results/27-cloud-shared-device.png" });
  await second.getByTestId("reset-switch").click();
  await second.getByTestId("onboarding").waitFor();
  await second.waitForFunction(() => window.__aitq.snapshot().store.sync === "local");
  assert.equal(row.archived_at, null, "ผู้เล่นใหม่บนเครื่องร่วม: แถวของคนเดิมยังใช้งานอยู่");
  await second.getByTestId("player-name").fill("ต้น");
  await second.getByTestId("class-code").fill("PVC1-67");
  await second.getByTestId("onboarding-next").click();
  await pretest(second);
  await synced(second);
  assert.deepEqual(db.players.map((player) => [player.display_name, player.archived_at]), [["แก้ว", null], ["ต้น", null]], "สองคนสองแถว ไม่มีใครถูกเก็บถาวร");
  const tonCode = (await store(second)).resumeCode;
  assert.notEqual(tonCode, code);
  log("เครื่องที่ใช้ร่วมกัน: ผู้เรียนคนใหม่ลงทะเบียนบนเครื่องเดิม ข้อมูลของคนเดิมยังอยู่ครบ");

  // --- แก้วกลับมาเล่นต่อบนเครื่องร่วม (ที่ตอนนี้เป็นของต้น) ด้วยรหัส ข้อมูลของต้นไม่ถูกแตะ
  await second.getByRole("button", { name: "เมนู" }).click();
  await second.getByTestId("menu-resume").click();
  await second.getByTestId("resume-input").fill(code);
  await second.getByTestId("resume-submit").click();
  await second.waitForFunction(() => window.__aitq.snapshot().store.profile?.name === "แก้ว" && window.__aitq.snapshot().store.screen === "hall");
  assert.deepEqual(db.players.map((player) => [player.display_name, player.archived_at]), [["แก้ว", null], ["ต้น", null]]);
  log("เจ้าของเดิมกลับมาเล่นต่อบนเครื่องร่วมด้วยรหัส ข้อมูลของอีกคนไม่ถูกแตะ");

  // --- ผู้เรียนคนเดิมขอเริ่มใหม่ทั้งหมด: ข้อมูลชุดเดิมถูกเก็บถาวรให้ครู ไม่ถูกลบ (เครื่องที่ 1 ต้องไม่เชื่อมกับแถวนี้แล้ว)
  await first.getByRole("button", { name: "เมนู" }).click();
  await first.getByTestId("menu-new").click();
  await first.getByTestId("reset-switch").click();
  await first.getByTestId("onboarding").waitFor();
  await second.getByRole("button", { name: "เมนู" }).click();
  await second.getByTestId("menu-new").click();
  await second.getByTestId("reset-restart").click();
  await second.getByTestId("onboarding").waitFor();
  await second.waitForFunction(() => window.__aitq.snapshot().store.sync === "local");
  assert.notEqual(row.archived_at, null, "คนเดิมเริ่มใหม่ทั้งหมด: แถวเดิมถูกเก็บถาวร");
  assert.equal(db.players.length, 2);
  log("ผู้เรียนคนเดิมเริ่มใหม่ทั้งหมด: ข้อมูลชุดเดิมถูกเก็บถาวรไว้ให้ครู ไม่ถูกลบ");

  // --- ไม่ใส่รหัสห้องเรียน: ไม่มีอะไรออกจากเครื่อง
  const solo = await device(browser);
  const savesBeforeSolo = db.saves;
  await (await register(solo, "เล่นคนเดียว", "")).click();
  await pretest(solo);
  await solo.waitForTimeout(3500);
  assert.equal(db.saves, savesBeforeSolo, "ไม่มีรหัสห้องเรียน: ไม่ส่งความคืบหน้าขึ้นฐานข้อมูลกลาง");
  assert.equal(db.signups, 2, "ผู้เล่นที่ไม่ใส่รหัสห้องเรียนไม่ถูกสร้างบัญชี (มีแค่เครื่องที่ 1 และ 2)");
  assert.equal((await store(solo)).sync, "local");
  log("ไม่ใส่รหัสห้องเรียน: เก็บในเครื่องอย่างเดียว ไม่ส่งข้อมูลออก");
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error(`พบ error ในเบราว์เซอร์ ${errors.length} รายการ`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("ผ่านทั้งหมด");
