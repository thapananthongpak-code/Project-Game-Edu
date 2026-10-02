// ทดสอบการซิงก์กับฐานข้อมูลกลางด้วยเบราว์เซอร์จริง โดยจำลอง Supabase ไว้ในสคริปต์นี้
// (โปรโตคอลเดียวกับที่ supabase-js เรียก: auth/v1/signup, rest/v1/players, rest/v1/rpc/*)
//
// ต้องเปิด dev server อีกตัวที่ชี้ไปยัง Supabase จำลอง:
//   VITE_SUPABASE_URL=http://localhost:5174/_sb VITE_SUPABASE_ANON_KEY=test-anon-key VITE_GOOGLE_LOGIN=1 npx vite --port 5174 --strictPort
// แล้วรัน: npm run test:e2e:cloud
//
// กติกาของฐานข้อมูลจริง (RLS สิทธิ์เขียน การตรวจค่า) ทดสอบกับ Postgres ใน supabase/schema.test.ts
// สคริปต์นี้ตรวจฝั่งเกม: ล็อกอินไม่ระบุตัวตน ส่งข้อมูลเมื่อไร ไม่ส่งอะไร เล่นต่อจากเครื่องอื่น เริ่มใหม่ และการเข้าสู่ระบบด้วย Google
// (หน้าล็อกอินของ Google จำลองเป็นการพากลับมาที่เกมพร้อม token ทันที บัญชีที่ใช้กำหนดด้วย db.googleEmail)
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_CLOUD_URL ?? "http://localhost:5174/";
const quests = JSON.parse(readFileSync(new URL("../src/content/quests.json", import.meta.url), "utf8"));
const log = (message) => console.log(`  ✓ ${message}`);
const errors = [];

// ---------------------------------------------------------------- Supabase จำลอง (ทำตามกติกาใน supabase/schema.sql)
const db = { players: [], devices: new Map(), signups: 0, saves: 0, down: false, users: new Map(), googleEmail: "kaew@example.com" };
const now = () => new Date().toISOString();
const userJson = (id) => {
  const user = db.users.get(id);
  return { id, aud: "authenticated", role: "authenticated", email: user.email, is_anonymous: user.email === "", app_metadata: user.email ? { provider: "google", providers: ["google"] } : {}, user_metadata: {}, identities: [], created_at: now(), updated_at: now() };
};
/** หน้าที่พาเบราว์เซอร์กลับมาที่เกม (แทนหน้าล็อกอินของ Google) */
const bounce = (target) => ({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(target)})</script>` });
const tokens = (id) => `access_token=${jwt(id)}&expires_in=3600&refresh_token=${randomUUID()}&token_type=bearer`;
const jwt = (userId) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
const userOf = (request) => JSON.parse(Buffer.from((request.headers().authorization ?? "").split(".")[1] ?? "", "base64url").toString() || "{}").sub;

async function supabase(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/_sb/, "");
  if (db.down) return route.abort("failed");
  // เข้าสู่ระบบด้วย Google (signInWithOAuth): เบราว์เซอร์ถูกพามาที่นี่ แล้วกลับไปที่เกมพร้อม token ของบัญชี Google นั้น
  if (path === "/auth/v1/authorize") {
    let id = [...db.users].find(([, user]) => user.email === db.googleEmail)?.[0];
    if (!id) db.users.set((id = randomUUID()), { email: db.googleEmail });
    return route.fulfill(bounce(`${url.searchParams.get("redirect_to")}#${tokens(id)}`));
  }
  // หน้าที่ผู้ให้บริการพากลับมาที่เกม (ของจริงคือหน้าของ Google ซึ่งอยู่คนละโดเมน จึงเป็นการเปิดหน้าใหม่เสมอ)
  if (path === "/auth/v1/bounce") return route.fulfill(bounce(url.searchParams.get("to")));
  if (request.headers().apikey !== "test-anon-key") return route.fulfill({ status: 401, json: { message: "bad apikey" } });

  if (path === "/auth/v1/signup") {
    const id = randomUUID();
    db.signups += 1;
    db.users.set(id, { email: "" });
    return route.fulfill({ json: { access_token: jwt(id), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: randomUUID(), user: userJson(id) } });
  }
  const user = userOf(request);
  if (!user || !db.users.has(user)) return route.fulfill({ status: 401, json: { message: "not signed in" } });
  if (path === "/auth/v1/user") return route.fulfill({ json: userJson(user) });
  if (path === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
  // ผูกบัญชี Google เข้ากับบัญชีไม่ระบุตัวตน (linkIdentity): บัญชี Google ที่ผูกกับคนอื่นแล้วผูกซ้ำไม่ได้
  if (path === "/auth/v1/user/identities/authorize") {
    const back = url.searchParams.get("redirect_to");
    const taken = [...db.users.values()].some((other) => other.email === db.googleEmail);
    const via = (target) => ({ json: { url: `${url.origin}/_sb/auth/v1/bounce?to=${encodeURIComponent(target)}` } });
    if (taken) return route.fulfill(via(`${back}#error=invalid_request&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user`));
    db.users.get(user).email = db.googleEmail;
    return route.fulfill(via(`${back}#${tokens(user)}`));
  }
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
    await page.getByTestId("choice-option").first().click();
    await page.waitForTimeout(30);
  }
  await page.getByTestId("assessment-finish").click();
  await page.waitForFunction(() => window.__aitq.snapshot().store.screen === "hall");
  // บทนำของเนื้อเรื่อง: ข้าม
  await page.getByTestId("story-skip").click();
  await page.waitForFunction(() => window.__aitq.snapshot().store.overlay === null);
}

/** กดเข้าสู่ระบบด้วย Google แล้วรอจนเกมเปิดใหม่หลังถูกพากลับมา */
async function googleSignIn(page, email) {
  db.googleEmail = email;
  await page.getByTestId("google-signin").click();
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready && window.__aitq.snapshot().store.hydrated !== false && document.querySelector('[data-testid="google-account"]'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
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
  assert.deepEqual([row.class_code, row.display_name, row.data.version, row.data.pretest.items.length], ["PVC1-67", "แก้ว", 7, 12], "แถวในฐานข้อมูล: รหัสห้อง (ตัวพิมพ์ใหญ่) ชื่อที่แสดง และผลก่อนเรียนรายข้อ");
  assert.deepEqual(Object.keys(row.data).sort(), ["battles", "npcs", "posttest", "pretest", "profile", "rooms", "shop", "story", "updatedAt", "version"], "ไม่มีข้อมูลอื่นนอกจากความคืบหน้าในเกม");
  const code = (await store(first)).resumeCode;
  assert.equal(code, row.resume_code);
  await first.getByRole("button", { name: "สมุดเควส" }).click();
  assert.equal(await first.getByTestId("resume-code").innerText(), code);
  assert.equal(await first.getByTestId("sync").getAttribute("data-status"), "synced");
  await first.screenshot({ path: "test-results/25-cloud-profile.png" });
  await first.getByRole("button", { name: "ปิด", exact: true }).click();
  log(`เครื่องที่ 1: ลงทะเบียนด้วยรหัสห้อง PVC1-67 ข้อมูลขึ้นฐานข้อมูลกลาง สมุดเควสแสดงสถานะและรหัสเล่นต่อ ${code}`);

  assert.deepEqual([row.data.profile.difficulty, Object.keys(row.data.profile).sort()], ["easy", ["avatar", "classCode", "difficulty", "name"]], "โปรไฟล์ในฐานข้อมูล: ระดับความยาก (ค่าเริ่มต้นง่าย) ไม่มีช่องอื่น");

  // --- เปลี่ยนตัวละครหลายครั้งติดกัน: ส่งขึ้นแบบหน่วง รวมหลายครั้งเป็นครั้งเดียว
  const savesBefore = db.saves;
  await first.evaluate(() => {
    const game = window.__aitq.store.getState();
    game.setAvatar("b");
    game.setAvatar("a");
    game.setAvatar("b");
  });
  await first.waitForFunction(() => window.__aitq.snapshot().store.sync === "pending");
  await synced(first);
  assert.equal(db.saves, savesBefore + 1, "การเปลี่ยนแปลงถี่ ๆ ถูกรวมเป็นการส่งครั้งเดียว");
  assert.equal(row.data.profile.avatar, "b");
  log("การเปลี่ยนแปลงถี่ ๆ ถูกรวมแล้วส่งครั้งเดียว ฐานข้อมูลได้ค่าล่าสุด");

  // --- เครือข่ายล่ม: เกมยังเล่นและบันทึกในเครื่องได้ กลับมาแล้วส่งเอง
  db.down = true;
  await first.getByRole("button", { name: "สมุดเควส" }).click();
  await first.evaluate(() => window.__aitq.store.getState().setAvatar("a"));
  await first.waitForFunction(() => window.__aitq.snapshot().store.sync === "error", null, { timeout: 15000 });
  assert.match(await first.getByTestId("sync").innerText(), /ข้อมูลยังอยู่ในเครื่อง/);
  assert.equal(JSON.parse(await first.evaluate(() => localStorage.getItem("ai-trainer-quest-save"))).profile.avatar, "a");
  await first.getByRole("button", { name: "ปิด", exact: true }).click();
  db.down = false;
  await synced(first);
  assert.equal(row.data.profile.avatar, "a");
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
  assert.equal(db.players.some((player) => player.display_name === "เล่นคนเดียว"), false);
  log("ไม่ใส่รหัสห้องเรียน: เก็บในเครื่องอย่างเดียว ไม่ส่งข้อมูลออก");

  // ================================================================ เข้าสู่ระบบด้วย Google (ทางเลือก)
  console.log("เข้าสู่ระบบด้วย Google (จำลอง)");
  // --- ผู้เล่นที่เก็บในเครื่องอย่างเดียวเข้าสู่ระบบ: ความคืบหน้าในเครื่องกลายเป็นของบัญชีนั้น ไม่สร้างบัญชีไม่ระบุตัวตน
  await solo.getByRole("button", { name: "เมนู" }).click();
  assert.equal(await solo.getByTestId("google-account").getAttribute("data-provider"), "none");
  await googleSignIn(solo, "kaew@example.com");
  assert.equal(await solo.getByTestId("google-account").getAttribute("data-provider"), "google");
  assert.match(await solo.getByTestId("google-email").innerText(), /kaew@example\.com/);
  assert.equal(new URL(solo.url()).hash, "", "token ถูกลบออกจาก URL หลังเข้าสู่ระบบ");
  await synced(solo);
  const soloRow = db.players.find((player) => player.display_name === "เล่นคนเดียว");
  assert.deepEqual([soloRow.class_code, soloRow.data.pretest.items.length, db.signups], ["SOLO", 12, 2], "ความคืบหน้าในเครื่องขึ้นฐานข้อมูลใต้รหัสห้อง SOLO โดยไม่สร้างบัญชีไม่ระบุตัวตน");
  assert.equal(JSON.stringify(soloRow.data).includes("kaew@example.com"), false, "อีเมลไม่ถูกบันทึกลงความคืบหน้า");
  await solo.screenshot({ path: "test-results/28-cloud-google.png" });
  log("ผู้เล่นที่เก็บในเครื่องอย่างเดียวเข้าสู่ระบบด้วย Google: ความคืบหน้าขึ้นฐานข้อมูลใต้รหัสห้อง SOLO เมนูแสดงบัญชี อีเมลไม่อยู่ในความคืบหน้า");

  // --- เครื่องใหม่: เข้าสู่ระบบบัญชีเดิมแล้วได้ความคืบหน้าเดิม ไม่สร้างแถวซ้ำ
  const fresh = await device(browser);
  await googleSignIn(fresh, "kaew@example.com");
  await fresh.locator('[data-testid="menu-continue"]:not([disabled])').waitFor();
  assert.match(await fresh.getByTestId("menu-continue").innerText(), /เล่นต่อ \(เล่นคนเดียว\)/);
  assert.equal(db.players.filter((player) => player.display_name === "เล่นคนเดียว").length, 1);
  log("เครื่องใหม่: เข้าสู่ระบบด้วยบัญชี Google เดิมแล้วเล่นต่อได้ทันที ไม่ต้องใช้รหัสเล่นต่อ");

  // --- ออกจากระบบ (เครื่องที่ใช้ร่วมกัน): สำเนาในเครื่องถูกลบ ข้อมูลในฐานข้อมูลยังอยู่และไม่ถูกเก็บถาวร
  await fresh.getByTestId("google-signout").click();
  await fresh.waitForFunction(() => document.querySelector('[data-testid="google-account"]')?.dataset.provider === "none");
  assert.equal(await fresh.getByTestId("menu-continue").count(), 0);
  assert.equal(await fresh.evaluate(() => localStorage.getItem("ai-trainer-quest-save")), null);
  assert.equal(soloRow.archived_at, null);
  log("ออกจากระบบ: สำเนาในเครื่องถูกลบ ความคืบหน้าของบัญชียังอยู่ในฐานข้อมูล");

  // --- เครื่องที่มีบัญชีไม่ระบุตัวตนอยู่แล้ว (ลงทะเบียนด้วยรหัสห้อง): ผูกบัญชี Google ใหม่เข้ากับความคืบหน้าเดิม
  await first.getByTestId("player-name").fill("นิด");
  await first.getByTestId("class-code").fill("PVC1-67");
  await first.getByTestId("onboarding-next").click();
  await pretest(first);
  await synced(first);
  const nidRow = db.players.find((player) => player.display_name === "นิด");
  const signupsBefore = db.signups;
  await first.getByRole("button", { name: "เมนู" }).click();
  await googleSignIn(first, "nid@example.com");
  assert.match(await first.getByTestId("google-email").innerText(), /nid@example\.com/);
  assert.match(await first.getByTestId("menu-continue").innerText(), /เล่นต่อ \(นิด\)/);
  assert.deepEqual([db.signups, db.players.filter((player) => player.display_name === "นิด").length, nidRow.archived_at], [signupsBefore, 1, null], "ผูกบัญชี: ไม่สร้างบัญชีหรือแถวใหม่");
  const linked = await device(browser);
  await googleSignIn(linked, "nid@example.com");
  await linked.locator('[data-testid="menu-continue"]:not([disabled])').waitFor();
  assert.match(await linked.getByTestId("menu-continue").innerText(), /เล่นต่อ \(นิด\)/);
  log("เครื่องที่ลงทะเบียนด้วยรหัสห้องอยู่แล้ว: ผูกบัญชี Google เข้ากับความคืบหน้าเดิม แล้วเล่นต่อจากเครื่องอื่นด้วยบัญชีนั้นได้");

  // --- บัญชี Google ที่มีความคืบหน้าอยู่แล้ว ผูกกับเครื่องที่มีผู้เล่นอีกคนไม่ได้: แจ้งเตือน ความคืบหน้าทั้งสองฝั่งไม่ถูกแตะ กดอีกครั้งจึงสลับไปบัญชีนั้น
  await second.getByTestId("player-name").fill("ฝน");
  await second.getByTestId("class-code").fill("PVC1-67");
  await second.getByTestId("onboarding-next").click();
  await pretest(second);
  await synced(second);
  await second.getByRole("button", { name: "เมนู" }).click();
  await googleSignIn(second, "kaew@example.com");
  assert.match(await second.getByTestId("google-notice").innerText(), /มีความคืบหน้าอยู่แล้ว/);
  assert.equal(await second.getByTestId("google-account").getAttribute("data-provider"), "anonymous");
  assert.match(await second.getByTestId("menu-continue").innerText(), /เล่นต่อ \(ฝน\)/, "ผูกไม่ได้: ความคืบหน้าของผู้เล่นบนเครื่องนี้ยังอยู่");
  await googleSignIn(second, "kaew@example.com");
  await second.locator('[data-testid="menu-continue"]:not([disabled])').waitFor();
  assert.match(await second.getByTestId("menu-continue").innerText(), /เล่นต่อ \(เล่นคนเดียว\)/, "กดอีกครั้ง: สลับไปใช้ความคืบหน้าของบัญชี Google นั้น");
  const fonRow = db.players.find((player) => player.display_name === "ฝน");
  assert.deepEqual([fonRow.archived_at, fonRow.data.profile.name, soloRow.data.profile.name], [null, "ฝน", "เล่นคนเดียว"], "ความคืบหน้าของทั้งสองคนไม่ถูกทับ");
  log("บัญชี Google ที่มีความคืบหน้าอยู่แล้ว: ผูกกับเครื่องของผู้เล่นอีกคนไม่ได้ แจ้งเตือน และสลับบัญชีได้โดยไม่ทับข้อมูลของใคร");
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error(`พบ error ในเบราว์เซอร์ ${errors.length} รายการ`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("ผ่านทั้งหมด");
