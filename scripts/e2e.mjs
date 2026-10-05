// ทดสอบเล่นเกมจบทั้ง 6 ห้องด้วยเบราว์เซอร์จริง (Chrome ที่ติดตั้งในเครื่อง)
// ต้องเปิด dev server ก่อน: npm run dev   แล้วรัน: npm run test:e2e
// เดินด้วยการกดปุ่มจริง อ่านตำแหน่งผู้เล่นจาก window.__aitq (มีเฉพาะตอน dev) เพื่อรู้ว่าต้องเดินไปทางไหน
// คำตอบของทุกมินิเกมคำนวณจาก course.json และ quests.json ในสคริปต์นี้เอง ไม่อ่านเฉลยจากหน้าเว็บ
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.E2E_URL ?? "http://localhost:5173/";
const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const TILE = 32;
const MAP_TOP = 8;

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const course = readJson("../src/content/course.json");
const quests = readJson("../src/content/quests.json");
const topicOf = (room) => course.topics[room - 1];
const questOf = (room) => quests.rooms.find((r) => r.room === room);
const KAIJU = ["กลิตช์", "ไตรฮอร์น", "สแครป", "เกียร์แครบ", "ฝูงมิมิก", "โอเมก้า"];
/** โครงของแมพ (ข้อมูลล้วนจาก src/state/campaign.ts): พลังของไคจูและพลังที่แนะนำของแต่ละด่าน กติกาตรวจใน unit test สคริปต์นี้ตรวจว่าหน้าจอแสดงตรงกับโครง */
const { CAMPAIGN } = await import("../src/state/campaign.ts");
const specOf = (id) => Object.values(CAMPAIGN).flatMap((map) => map.battles).find((battle) => battle.id === id);
const MAP_NAME = { easy: "แมพ 1: Pixel AI Lab", normal: "แมพ 2: ศูนย์วิจัยภาคสนาม", hard: "แมพ 3: ป้อมปราการภูเขาไฟ" };
/** ของตกแต่งเริ่มต้นของโถง (STARTER_PLACEMENT ใน progressStore.ts) */
/** ของตกแต่งที่วางไว้ให้ตั้งแต่เริ่มในโถงของแมพ 1 (ShopState.decor รุ่น 9: ตำแหน่งอิสระต่อห้อง) */
const STARTER_DECOR = { "easy:hall": [{ decor: "window", col: 3, row: 1 }, { decor: "plant", col: 1, row: 5 }] };
/** รหัสด่านต่อสู้ของห้องในแมพ 1 (src/state/campaign.ts) */
const easyBattle = (room) => (room === 6 ? "omega" : `k${room}`);
const NO_SUPPLIES = { "repair-kit": 0, shield: 0, overcharge: 0, analyzer: 0, reboot: 0 };
/** NPC ประจำห้อง (src/state/npcs.ts และ src/content/ui-strings.ts) */
const NPC = {
  mechanic: { name: "ช่างโซอี้", topic: 1, pickups: 3 },
  coach: { name: "โค้ชแดเนียล", topic: 2, questions: 4 },
  archivist: { name: "ป้ามาร์ธา", topic: 3 },
  foreman: { name: "หัวหน้าฮันส์", topic: 4, pickups: 4 },
  vendor: { name: "น้องมีอา", topic: 5 },
  director: { name: "พี่ลูคัส", topic: 6, questions: 4 },
  // แมพ 2
  smith: { name: "ลุงบียอร์น", topic: 1 },
  sage: { name: "ดร.ไอรีน", topics: [1, 2], questions: 5 },
  ranger: { name: "พี่ไรลีย์", topic: 4, pickups: 4 },
  medic: { name: "หมอโซเฟีย", topic: 5 },
  // แมพ 3
  captain: { name: "กัปตันเรย์", topics: [1, 2, 3, 4, 5], questions: 6 },
  keeper: { name: "ลุงโอลาฟ", topic: 1 },
};
const playing = async (page) => (await snap(page)).audio.playing;
const strip = (heading) => heading.replace(/^\d+\s+/, "");
const stationsCount = (room) => topicOf(room).sections.length + (topicOf(room).intro ? 1 : 0);
const topic1 = topicOf(1);
const terms = topic1.sections[1].terms;

mkdirSync(SHOTS, { recursive: true });
const errors = [];
const log = (message) => console.log(`  ✓ ${message}`);

// คำตอบ 401/503 ของ /api/teacher เป็นพฤติกรรมที่ตั้งใจทดสอบ (รหัสผ่านผิด ยังไม่ตั้งค่า) ไม่นับเป็น error
const expected = (url) => url.includes("/api/teacher");
function watch(page) {
  page.on("console", (m) => m.type() === "error" && !expected(m.location().url) && errors.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && !expected(r.url()) && errors.push(`http ${r.status()}: ${r.url()}`));
}

// ---------------------------------------------------------------- การเข้าถึง (axe-core) ตรวจทุกหน้าจอที่ถ่ายภาพ
const axeSource = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const a11y = [];
async function audit(page, name) {
  if (!(await page.evaluate(() => "axe" in window))) await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const run = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
    // ขนาดตัวอักษรเล็กที่สุดของข้อความที่มองเห็น (ไม่นับป้ายที่ซ่อนอยู่)
    let minFont = Infinity;
    let minText = "";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!node.textContent.trim() || !el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size < minFont) [minFont, minText] = [size, node.textContent.trim().slice(0, 30)];
    }
    // เป้าแตะที่เล็กกว่า 24×24 (WCAG 2.2 ข้อ 2.5.8)
    const small = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")]
      .filter((el) => el.checkVisibility() && !el.disabled)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
      .map(({ el, box }) => `${el.tagName.toLowerCase()}[${el.dataset.testid ?? el.textContent.trim().slice(0, 20)}] ${Math.round(box.width)}×${Math.round(box.height)}`);
    return { violations: run.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(1, 3).join(" ").trim() })) })), minFont, minText, small };
  });
  a11y.push({ screen: name, viewport: page.viewportSize(), ...result });
}

const snap = (page) => page.evaluate(() => window.__aitq.snapshot());
const shot = async (page, name) => {
  // รอให้แอนิเมชันที่มีจุดจบ (เช่น บัตรโจทย์เลื่อนเข้า) เล่นจบก่อน ภาพและผลตรวจคอนทราสต์จะได้เป็นสภาพที่ผู้เล่นเห็นจริง
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {}))));
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await audit(page, name);
};
const inHall = (page) => page.waitForFunction(() => window.__aitq?.snapshot().scene === "Hall" && window.__aitq.snapshot().store.screen === "hall" && window.__aitq.snapshot().interactables.length > 0);
const inHangar = async (page) => {
  await page.waitForFunction(() => window.__aitq.snapshot().scene === "Hangar" && window.__aitq.snapshot().interactables.length > 0);
  await page.waitForTimeout(350);
};

/** อ่านฉากเนื้อเรื่องที่เปิดอยู่จนจบ คืนรหัสฉากและข้อความทุกหน้า (ไม่มีฉากเปิดอยู่คืน null) */
async function readStory(page, press = (locator) => locator.click()) {
  await page.waitForTimeout(350);
  if ((await snap(page)).store.overlay !== "story") return null;
  const beat = await page.getByTestId("story").getAttribute("data-beat");
  const lines = [];
  const art = [];
  for (let guard = 0; guard < 20 && (await page.getByTestId("story").count()); guard++) {
    lines.push(`${await page.getByTestId("story-speaker").innerText()}: ${await page.getByTestId("story-text").innerText()}`);
    // ช่องการ์ตูน: ทุกช่องมีภาพประกอบที่โหลดได้จริง
    const image = page.getByTestId("story-art");
    await image.evaluate((img) => img.complete || new Promise((done) => img.addEventListener("load", done, { once: true })));
    assert.ok(await image.evaluate((img) => img.naturalWidth > 0), `ภาพประกอบเนื้อเรื่องโหลดไม่ได้: ${await image.getAttribute("data-art")}`);
    art.push(await image.getAttribute("data-art"));
    await press(page.getByTestId("story-next"));
    await page.waitForTimeout(120);
  }
  assert.equal(await page.getByTestId("story").count(), 0, "ฉากเนื้อเรื่องต้องปิดเมื่ออ่านจบ");
  await page.waitForTimeout(300);
  return { beat, lines, art };
}

/** รอจนเข้าห้อง (ลำดับห้องของระดับความยาก) แล้วอ่านบรรยายสรุปของห้อง (แสดงเฉพาะครั้งแรกที่เข้า) คืนฉากเนื้อเรื่องที่อ่าน หรือ null */
const inRoom = async (page, room, press) => {
  await page.waitForFunction((n) => window.__aitq.snapshot().scene === "Room" && window.__aitq.snapshot().store.zone === n && window.__aitq.snapshot().interactables.length > 0, room);
  return readStory(page, press);
};
const attr = (label) => JSON.stringify(label);

/** กดปุ่มทิศทางค้างจนพิกัดแกนนั้นถึงเป้าหมาย หรือจนเดินต่อไม่ได้ (ชนวัตถุ) */
async function moveAxis(page, axis, goal) {
  const start = (await snap(page)).player[axis];
  if (Math.abs(goal - start) < 5) return;
  const key = axis === "x" ? (goal > start ? "ArrowRight" : "ArrowLeft") : goal > start ? "ArrowDown" : "ArrowUp";
  await page.keyboard.down(key);
  let last = start;
  let stuck = 0;
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(25);
    const now = (await snap(page)).player[axis];
    if ((goal - now) * (goal - start) <= 0 || Math.abs(goal - now) < 5) break;
    stuck = Math.abs(now - last) < 0.5 ? stuck + 1 : 0;
    if (stuck > 8) break;
    last = now;
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(40);
}

const cellOf = (x, y) => ({ col: Math.floor(x / TILE), row: Math.floor((y - MAP_TOP - 1) / TILE) });
const cellSpot = ({ col, row }) => ({ x: col * TILE + TILE / 2, y: MAP_TOP + row * TILE + 20 });

/**
 * เส้นทางเดินบนผังของฉาก (หาแบบกว้างก่อน เดิน 4 ทิศ ไม่ผ่านผนังและช่องที่วัตถุตั้งอยู่)
 * จากช่องของผู้เล่นไปยังช่องที่ใกล้จุดโต้ตอบที่สุดในระยะโต้ตอบ คืนรายการช่องที่ต้องเดินผ่าน
 */
function findPath(map, from, target) {
  const blocked = new Set(map.blocked);
  const open = ({ col, row }) => map.shape[row]?.[col] === "." && !blocked.has(`${col},${row}`);
  const key = (cell) => `${cell.col},${cell.row}`;
  const reach = (cell) => Math.hypot(cellSpot(cell).x - target.x, cellSpot(cell).y - target.y);
  const cameFrom = new Map([[key(from), null]]);
  const queue = [from];
  let best = null;
  while (queue.length > 0) {
    const cell = queue.shift();
    if (reach(cell) < 40 && (best === null || reach(cell) < reach(best))) best = cell;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { col: cell.col + dc, row: cell.row + dr };
      if (!open(next) || cameFrom.has(key(next))) continue;
      cameFrom.set(key(next), cell);
      queue.push(next);
    }
  }
  if (!best) return null;
  const path = [];
  for (let cell = best; cell; cell = cameFrom.get(key(cell))) path.unshift(cell);
  return path;
}

/** เดินไปหาจุดโต้ตอบตามเส้นทางบนผังของฉาก (ผังอ่านจาก window.__aitq) */
async function walkTo(page, id) {
  const { interactables, map, player } = await snap(page);
  const target = interactables.find((i) => i.id === id);
  assert.ok(target, `ไม่พบจุดโต้ตอบ ${id}`);
  if (Math.hypot(player.x - target.x, player.y - target.y) >= 30) {
    const path = findPath(map, cellOf(player.x, player.y), target);
    assert.ok(path, `ไม่มีทางเดินไป ${id}`);
    // เดินไปที่กลางช่องของทุกจุดเลี้ยว
    for (let i = 0; i < path.length; i++) {
      const turn = i === 0 || i === path.length - 1 || path[i + 1].col - path[i].col !== path[i].col - path[i - 1].col || path[i + 1].row - path[i].row !== path[i].row - path[i - 1].row;
      if (!turn) continue;
      const spot = cellSpot(path[i]);
      await moveAxis(page, "x", spot.x);
      await moveAxis(page, "y", spot.y);
    }
    await moveAxis(page, "x", target.x);
    await moveAxis(page, "y", target.y);
  }
  const now = (await snap(page)).player;
  assert.ok(Math.hypot(now.x - target.x, now.y - target.y) < 46, `เดินไปไม่ถึง ${id} (อยู่ที่ ${Math.round(now.x)},${Math.round(now.y)} เป้าหมาย ${target.x},${target.y})`);
}

/** canvas ต้องอยู่ในกรอบจอทั้งหมดและคงสัดส่วน 16:9 */
async function assertCanvasFits(page, where) {
  const { box, width, height } = await page.evaluate(() => {
    const r = document.querySelector("#game-root canvas").getBoundingClientRect();
    return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, width: innerWidth, height: innerHeight };
  });
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1, `${where}: canvas ล้นจอ ${JSON.stringify(box)}`);
  assert.ok(Math.abs(box.w / box.h - 16 / 9) < 0.01, `${where}: canvas ไม่ใช่ 16:9`);
}

const act = async (page) => {
  await page.keyboard.press("e");
  await page.waitForTimeout(120);
};

/** คำตอบที่ถูกของโจทย์ "เซลล์นี้อยู่แถวใด" ของหัวข้อ 1 */
const rowNameOf = (cell) => topic1.tables[0].rows.find((row) => row.includes(cell))[0];

async function answerChoice(page, correctly) {
  const card = await page.getByTestId("choice-card").innerText();
  const options = await page.getByTestId("choice-option").allInnerTexts();
  const right = options.indexOf(rowNameOf(card));
  assert.notEqual(right, -1, `ไม่พบตัวเลือกที่ถูกของบัตร "${card}"`);
  await page.getByTestId("choice-option").nth(correctly ? right : (right + 1) % options.length).click();
}

/** คำตอบที่ถูกของข้อสอบ คิดจาก quests.json และ course.json โดยไม่พึ่งโค้ดของเกม */
function assessmentAnswer(id) {
  const spec = quests.assessment[id[0]].find((item) => item.id === id);
  const topic = topicOf(spec.topic);
  const first = Math.min(spec.first, spec.second);
  switch (spec.kind) {
    case "cell-row": return topic.tables[spec.table].rows[spec.row][0];
    case "cell-column": return topic.tables[spec.table].headers[spec.column];
    case "row-cell": return topic.tables[spec.table].rows[spec.row][spec.column];
    case "section-order": return strip(topic.sections[first].heading);
    case "quest-step-order": return course.finalQuest.steps[first];
  }
  throw new Error(`ไม่รู้จักชนิดข้อสอบ ${spec.kind}`);
}

/**
 * ทำแบบทดสอบก่อนเรียนหรือหลังเรียน 12 ข้อ ตอบถูกเฉพาะข้อที่ shouldAnswer(หัวข้อ, ลำดับในหัวข้อ) เป็นจริง ข้ออื่นเลือกตัวเลือกที่ผิด
 * (ไม่มีปุ่ม "ยังไม่รู้" แล้ว ทุกข้อต้องเลือกหนึ่งตัวเลือก)
 * คืนชุดข้อสอบที่ได้ (A หรือ B)
 */
async function takeAssessment(page, phase, shouldAnswer, press = (locator) => locator.click()) {
  const root = page.getByTestId(phase);
  await root.waitFor();
  const form = await root.getAttribute("data-form");
  const total = quests.assessment[form].length;
  assert.equal(total, 12);
  const seen = {};
  for (let i = 1; i <= total; i++) {
    assert.match(await page.getByTestId("assessment-progress").innerText(), new RegExp(`${i}/${total}`));
    const item = page.getByTestId("choice");
    const id = await item.getAttribute("data-item");
    const topic = Number(await item.getAttribute("data-topic"));
    assert.equal(id, quests.assessment[form][i - 1].id, "ข้อสอบเรียงตามรายการใน quests.json");
    seen[topic] = (seen[topic] ?? 0) + 1;
    assert.equal(await page.getByTestId("choice-unknown").count(), 0, "แบบทดสอบไม่มีตัวเลือกยังไม่รู้");
    const options = await page.getByTestId("choice-option").allInnerTexts();
    const right = options.indexOf(assessmentAnswer(id));
    assert.notEqual(right, -1, `ข้อ ${id}: ไม่พบตัวเลือกที่ถูก "${assessmentAnswer(id)}" ใน ${JSON.stringify(options)}`);
    await press(page.getByTestId("choice-option").nth(shouldAnswer(topic, seen[topic]) ? right : (right + 1) % options.length));
    await page.waitForTimeout(40);
  }
  assert.doesNotMatch(await root.innerText(), /คะแนน \d|ถูก \d|\d ข้อ/, "แบบทดสอบต้องไม่เฉลยหรือบอกคะแนนรายข้อ");
  await press(page.getByTestId("assessment-finish"));
  return form;
}

/** ขั้นเริ่มเกม: ตั้งชื่อ (ทุกคนเริ่มที่แมพ 1 ไม่มีตัวเลือกระดับความยาก) ทำแบบทดสอบก่อนเรียนโดยให้หัวข้อ 1 ถูกตามจำนวนที่ระบุ หัวข้ออื่นตอบผิด */
async function onboard(page, { name, topic1Correct, tap = false, shots = false, started = false, avatar = null }) {
  const difficulty = "easy";
  const press = (locator) => (tap ? locator.tap() : locator.click());
  if (shots) {
    // หน้าเมนูอธิบายเกมแบบย่อ
    await page.getByTestId("menu-about").waitFor();
    assert.equal(await page.locator('[data-testid="menu-about"] li').count(), 5);
    assert.match(await page.getByTestId("menu-about").innerText(), /เกมนี้เล่นอย่างไร[\s\S]*แกน AI[\s\S]*สู้ไคจู[\s\S]*คู่มือรูปในเกม/);
    await shot(page, "00-menu");
  }
  if (!started) await press(page.getByRole("button", { name: "เริ่มเกมใหม่" }));
  await page.getByTestId("player-name").fill(name);
  assert.equal(await page.getByTestId("avatar-a").getAttribute("aria-checked"), "true");
  if (avatar) await press(page.getByTestId(`avatar-${avatar}`));
  assert.equal(await page.locator('[data-testid^="difficulty-"], [data-testid^="style-"]').count(), 0, "ไม่มีตัวเลือกระดับความยากหรือสไตล์การเรียน ทุกคนเริ่มที่แมพ 1");
  assert.match(await page.getByTestId("onboarding-journey").innerText(), /เกมมี 3 แมพ[\s\S]*เริ่มที่ Pixel AI Lab/, "หน้าลงทะเบียนบอกเส้นทาง 3 แมพ");
  assert.equal(await page.getByTestId("class-code").count(), 0, "ยังไม่ตั้งค่าฐานข้อมูลกลาง: ไม่ถามรหัสห้องเรียน");
  if (shots) await shot(page, "00-onboarding");
  await press(page.getByTestId("onboarding-next"));
  await page.getByTestId("pretest").waitFor();
  if (shots) await shot(page, "00-pretest");
  const form = await takeAssessment(page, "pretest", (topic, nth) => topic === 1 && nth <= topic1Correct, press);
  await inHall(page);
  // บทนำของเนื้อเรื่องแสดงครั้งแรกที่เข้าแล็บ
  if (shots) {
    await page.getByTestId("story").waitFor();
    await shot(page, "00-story-prologue");
  }
  if (shots) {
    // เพลงเปลี่ยนตามอารมณ์ของช่อง: ช่องแรกตึงเครียด ช่องที่สามสงบ ช่องสุดท้ายสดใส
    assert.deepEqual([await page.getByTestId("story").getAttribute("data-mood"), await playing(page)], ["tense", "tension:0"]);
    await press(page.getByTestId("story-next"));
    await press(page.getByTestId("story-next"));
    assert.deepEqual([await page.getByTestId("story").getAttribute("data-mood"), await playing(page)], ["calm", "story:0"]);
    await press(page.getByTestId("story-next"));
    await press(page.getByTestId("story-next"));
    assert.deepEqual([await page.getByTestId("story").getAttribute("data-mood"), await playing(page)], ["bright", "victory:0"]);
    await press(page.getByTestId("story-next"));
    await page.waitForTimeout(300);
    assert.deepEqual((await snap(page)).store.story, ["prologue"]);
    assert.equal(await playing(page), "lab:0", "จบฉากเนื้อเรื่อง: กลับเป็นเพลงของโถง");
    // ชุดนี้ตรวจเพลงของแต่ละช่อง ข้อความและภาพของบทนำตรวจในชุดที่ไม่ถ่ายภาพ (ทางด้านล่าง)
    const { profile, pretest } = (await snap(page)).store;
    assert.deepEqual([profile.name, profile.avatar, profile.difficulty, pretest.form], [name, avatar ?? "a", difficulty, form]);
    assert.deepEqual(pretest.correctByTopic, { 1: topic1Correct, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
    return form;
  }
  const story = await readStory(page, press);
  assert.equal(story?.beat, "prologue", "เข้าแล็บครั้งแรกต้องเห็นบทนำของเนื้อเรื่อง");
  assert.equal(story.lines.length, 5);
  assert.deepEqual(story.art, ["st_prologue_1", "st_prologue_2", "st_prologue_3", "st_prologue_4", "st_prologue_5"], "บทนำเป็นช่องการ์ตูน 5 ช่อง ภาพไม่ซ้ำกัน");
  assert.ok(story.lines.some((line) => line.startsWith("ศาสตราจารย์วินสตัน:") && line.includes(name)), "ศาสตราจารย์วินสตันเรียกชื่อผู้เล่น");
  assert.ok(story.lines.at(-1).startsWith("พี่บิต:"));
  const { profile, pretest, story: seen } = (await snap(page)).store;
  assert.deepEqual(seen, ["prologue"], "ดูบทนำจบแล้วถูกบันทึก ไม่แสดงซ้ำ");
  assert.equal(profile.name, name);
  assert.equal(profile.avatar, avatar ?? "a");
  assert.equal(profile.difficulty, difficulty);
  assert.equal(pretest.form, form);
  assert.deepEqual(pretest.correctByTopic, { 1: topic1Correct, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
  assert.deepEqual(pretest.items.map((item) => item.id), quests.assessment[form].map((item) => item.id));
  return form;
}

/** ฟังสถานีหนึ่งจนจบ ถ้า check: ข้อความและตารางทุกหน้ารวมกันต้องเท่ากับ course.json */
async function listenStation(page, room, index, { check = false, shots = false } = {}) {
  const topic = topicOf(room);
  const sectionIndex = index - (topic.intro ? 1 : 0);
  const title = sectionIndex < 0 ? topic.title : topic.sections[sectionIndex].heading;
  const source = sectionIndex < 0 ? topic.intro : topic.sections[sectionIndex].body;
  const table = topic.tables.find((t) => t.sectionIndex === sectionIndex);

  await walkTo(page, `station-${index}`);
  await act(page);
  await page.getByTestId("dialogue").waitFor();
  if (check) assert.equal(await page.getByTestId("dialogue-title").innerText(), title);
  const texts = [];
  let tables = 0;
  for (;;) {
    const body = page.getByTestId("dialogue-body");
    if (await body.locator("table").count()) {
      tables++;
      if (check) assert.deepEqual(await body.locator("th, td").allInnerTexts(), [...table.headers, ...table.rows.flat()]);
      if (shots) await shot(page, "03-dialogue-table");
    } else {
      texts.push(await body.innerText());
      if (shots && index === 0 && texts.length === 1) await shot(page, "03-dialogue-text");
    }
    const next = page.getByTestId("dialogue-next");
    const last = (await next.innerText()) === "เข้าใจแล้ว";
    // สลับวิธีพลิกหน้า: ปุ่มบนจอและคีย์บอร์ด
    if (index % 2 === 0) await next.click();
    else await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    if (last) break;
  }
  if (check) {
    assert.equal(texts.join(" "), source.replaceAll("\n\n", " "), `ห้อง ${room} สถานี ${index + 1}: ข้อความไม่ตรงกับ course.json`);
    assert.equal(tables, table ? 1 : 0, `ห้อง ${room} สถานี ${index + 1}: จำนวนตารางไม่ตรง`);
  }
}

async function listenAll(page, room, options) {
  const topic = topicOf(room);
  const count = topic.sections.length + (topic.intro ? 1 : 0);
  for (let i = 0; i < count; i++) {
    await listenStation(page, room, i, options);
    assert.equal((await snap(page)).store.progress[room].stationsSeen, i + 1);
  }
  return count;
}

const card = (page, label) => page.locator(`[data-testid="match-card"][data-label=${attr(label)}]`);
const slot = (page, label) => page.locator(`[data-testid="match-slot"][data-label=${attr(label)}]`);
const definitionOf = (term) => terms.find((t) => t.term === term).definition;

/** เฉลยของมินิเกมของห้อง คำนวณจาก course.json + quests.json */
function solutionOf(room) {
  const topic = topicOf(room);
  const match = new Map();
  const sort = new Map();
  let accuracy = null;
  for (const game of questOf(room).minigames) {
    if (game.kind === "match-terms") for (const t of topic.sections[game.section].terms) match.set(t.term, t.definition);
    if (game.kind === "order-steps") topic.sections.forEach((s, i) => match.set(strip(s.heading), `ขั้นที่ ${i + 1}`));
    if (game.kind === "match-table") for (const column of game.columns) for (const row of topic.tables[game.table].rows) match.set(row[column], row[0]);
    if (game.kind === "sort-cases") topic.reviewQuestions.forEach((q, i) => sort.set(q.question, topic.tables[game.basketTable].rows[game.answerKey[i]][0]));
    if (game.kind === "sort-items") topic.reviewQuestions[game.question].items.forEach((item, i) => sort.set(item, topic.tables[game.binTable].headers[game.answerKey[i]]));
    if (game.kind === "accuracy") {
      const c = topic.reviewQuestions[game.question].accuracyCase;
      accuracy = [c.correct, c.total, (c.correct / c.total) * 100];
    }
  }
  return { match, sort, accuracy };
}

/** เล่นมินิเกมของห้องจนจบโดยตอบถูกทุกชิ้น รองรับทุกระดับ (ทีละชุด ทีละชิ้น หรือส่งทั้งรอบ) และหลายด่าน */
async function solveMinigame(page, room) {
  const { match, sort, accuracy } = solutionOf(room);
  const result = page.getByTestId("minigame-result");
  const submit = page.getByTestId("submit-round");
  const kinds = new Set();
  for (let guard = 0; guard < 300 && !(await result.count()); guard++) {
    kinds.add(await page.getByTestId("minigame").getAttribute("data-kind"));
    if (await page.getByTestId("accuracy-board").count()) {
      const input = page.locator('[data-testid="accuracy-input"]:not([disabled])').first();
      await input.fill(String(accuracy[Number(await input.getAttribute("data-field"))]));
      await page.locator('[data-testid="accuracy-check"], [data-testid="submit-round"]').click();
    } else if (await page.getByTestId("match-card").count()) {
      const label = await page.getByTestId("match-card").first().getAttribute("data-label");
      assert.ok(match.has(label), `ไม่มีเฉลยของการ์ด "${label}"`);
      await card(page, label).click();
      await slot(page, match.get(label)).click();
    } else if (await page.getByTestId("sort-card").count()) {
      const label = await page.getByTestId("sort-card").first().getAttribute("data-label");
      assert.ok(sort.has(label), `ไม่มีเฉลยของการ์ด "${label}"`);
      await page.locator(`[data-testid="sort-card"][data-label=${attr(label)}]`).click();
      await page.locator(`[data-testid="sort-bin"][data-label=${attr(sort.get(label))}]`).click();
    } else if ((await submit.count()) && (await submit.isEnabled())) {
      await submit.click();
    }
    await page.waitForTimeout(40);
  }
  await result.waitFor();
  return [...kinds];
}

/** เฉลยที่เป็นไปได้ทั้งหมดของบัตรใบหนึ่งในคำถามทบทวน: กิจกรรมทบทวนของหัวข้อ (เฉลยจากมินิเกม) และชุดโจทย์ของด่านต่อสู้ คิดจาก course.json */
function reviewCandidates(room, cardText) {
  const topic = topicOf(room);
  const candidates = [];
  for (const game of questOf(room).minigames) {
    if (game.kind === "sort-cases") {
      const index = topic.reviewQuestions.findIndex((q) => q.question === cardText);
      if (index >= 0) candidates.push(topic.tables[game.basketTable].rows[game.answerKey[index]][0]);
    }
    if (game.kind === "sort-items") {
      const index = topic.reviewQuestions[game.question].items.indexOf(cardText);
      if (index >= 0) candidates.push(topic.tables[game.binTable].headers[game.answerKey[index]]);
    }
  }
  return [...candidates, ...poolCandidates(room, battlePools(room), cardText, null)];
}

/**
 * ตอบคำถามทบทวนแบบเลือกตอบ (จับคู่ เชื่อมโยง ถูกหรือผิด) จนครบทุกข้อ ตอบผิด miss ข้อแรกในครั้งแรกที่เจอ (ข้อที่ผิดต้องวนกลับมาถามอีก)
 * คืนจำนวนข้อ แบบของโจทย์ที่เจอ และคะแนนที่หน้าจอสรุป (ยังไม่กดปิด)
 */
async function answerReview(page, room, { miss = 0, press = (locator) => locator.click() } = {}) {
  const root = page.getByTestId("review");
  await root.waitFor();
  assert.equal(await page.locator('[data-testid="review"] textarea, [data-testid="review"] input, [data-testid="review-answer"]').count(), 0, "คำถามทบทวนไม่มีช่องให้เขียนตอบ");
  const total = Number(await root.getAttribute("data-total"));
  const kinds = new Set();
  let asked = 0;
  let missed = 0;
  for (let guard = 0; guard < 40 && !(await page.getByTestId("review-finished").count()); guard++) {
    const kind = await root.getAttribute("data-kind");
    const left = Number(await root.getAttribute("data-left"));
    kinds.add(kind);
    const wrong = missed < miss;
    if (kind === "truth") {
      const cardText = await page.getByTestId("review-truth-card").innerText();
      const candidate = await page.getByTestId("review-truth-candidate").innerText();
      const truth = reviewCandidates(room, cardText).includes(candidate);
      await press(page.getByTestId(truth !== wrong ? "review-true" : "review-false"));
    } else {
      const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
      const options = await page.getByTestId("choice-option").allInnerTexts();
      const candidates = cardText ? reviewCandidates(room, cardText) : [poolAnswer(room, battlePools(room), cardText, options)];
      const right = options.findIndex((option) => candidates.includes(option));
      assert.notEqual(right, -1, `คำถามทบทวนเรื่องที่ ${room}: ไม่พบตัวเลือกที่ถูกของ "${cardText}" ใน ${JSON.stringify(options)}`);
      await press(page.getByTestId("choice-option").nth(wrong ? (right + 1) % options.length : right));
    }
    assert.match(await page.getByTestId("review-feedback").innerText(), wrong ? /ยังไม่ถูก/ : /ถูกต้อง/, `คำถามทบทวนเรื่องที่ ${room} ข้อแบบ ${kind}`);
    if (wrong) missed += 1;
    asked += 1;
    await press(page.getByTestId("review-next"));
    await page.waitForTimeout(40);
    if (!(await page.getByTestId("review-finished").count())) assert.equal(Number(await root.getAttribute("data-left")), wrong ? left : left - 1, "ตอบผิด: ข้อนั้นวนกลับมาท้ายแถว ตอบถูก: เหลือน้อยลงหนึ่งข้อ");
  }
  await page.getByTestId("review-finished").waitFor();
  assert.equal(asked, total + miss, "ข้อที่ตอบผิดถูกถามซ้ำจนตอบถูก");
  // คำถามทบทวนของต้นฉบับแสดงครบตามเดิมเป็นคำถามชวนคิด (ไม่ต้องเขียนส่ง)
  const think = await page.getByTestId("review-think").innerText();
  const source = topicOf(room);
  assert.ok(think.includes(source.reviewHeading) && source.reviewQuestions.every((q) => think.includes(q.question.trim())), `เรื่องที่ ${room}: คำถามทบทวนของต้นฉบับต้องแสดงครบทุกข้อ`);
  assert.equal(await page.getByTestId("review-think").locator("textarea, input").count(), 0);
  const score = page.getByTestId("review-score");
  assert.deepEqual([Number(await score.getAttribute("data-correct")), Number(await score.getAttribute("data-total"))], [total - miss, total], "คะแนน = จำนวนข้อที่ตอบถูกตั้งแต่ครั้งแรก");
  return { total, kinds: [...kinds], correct: total - miss };
}

async function takeCore(page, room) {
  await walkTo(page, "core");
  await act(page);
  await page.getByTestId("reward").waitFor();
  assert.match(await page.getByTestId("reward-title").innerText(), new RegExp(`ได้รับแกน AI ชิ้นที่ ${room}`));
  assert.ok((await page.getByTestId("reward").innerText()).includes(topicOf(room).objective), "หน้ารางวัลต้องแสดงสมรรถนะจาก course.json");
  assert.ok((await page.getByTestId("reward-next").innerText()).includes(KAIJU[room - 1]), "หน้ารางวัลบอกภารกิจต่อไป: ออกสู้กับไคจูของห้องนี้");
  await page.getByRole("button", { name: "อยู่ในห้องต่อ" }).click();
  assert.equal((await snap(page)).store.progress[room].core, true);
  assert.match(await page.getByTestId("objective").innerText(), new RegExp(`โรงเก็บหุ่น.*${KAIJU[room - 1]}`));
}

// ---------------------------------------------------------------- โรงเก็บหุ่นและด่านต่อสู้ไคจู

/** คำตอบที่ถูกของโจทย์เลือกตอบจากชุดโจทย์ใน quests.json (ห้องซ่อมและด่านต่อสู้) คิดจาก course.json */
function poolCandidates(room, pools, cardText, options) {
  const topic = topicOf(room);
  const earliest = (order) => [...options].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const next = (steps) => steps[steps.indexOf(cardText) + 1];
  const candidates = [];
  for (const pool of pools) {
    const table = pool.table === undefined ? null : topic.tables[pool.table];
    if (pool.kind === "term-definitions") candidates.push(topic.sections[pool.section].terms.find((t) => t.definition === cardText)?.term);
    if (pool.kind === "match-table-cells") candidates.push(table.rows.find((r) => pool.columns.some((column) => r[column] === cardText))?.[0]);
    if (pool.kind === "sort-table-cells") {
      for (const row of table.rows) for (const column of pool.columns) if (row[column] === cardText) candidates.push(table.headers[column]);
    }
    if (pool.kind === "review-cases") {
      const index = topic.reviewQuestions.findIndex((q) => q.question === cardText);
      if (index >= 0) candidates.push(topic.tables[pool.basketTable].rows[pool.answerKey[index]][0]);
    }
    if (pool.kind === "step-pairs" && !cardText && options) candidates.push(earliest(topic.sections.map((section) => strip(section.heading))));
    if (pool.kind === "quest-step-pairs" && !cardText && options) candidates.push(earliest(course.finalQuest.steps));
    if (pool.kind === "step-next" && cardText) candidates.push(next(topic.sections.map((section) => strip(section.heading))));
    if (pool.kind === "quest-step-next" && cardText) candidates.push(next(course.finalQuest.steps));
  }
  return candidates.filter((candidate) => candidate !== undefined);
}

function poolAnswer(room, pools, cardText, options) {
  // ชุดโจทย์ต่างชนิดใช้บัตรใบเดียวกันได้ (เช่น ถามแถว กับถามคอลัมน์) คำตอบคือชิ้นที่อยู่ในตัวเลือกของข้อนี้
  const answer = poolCandidates(room, pools, cardText, options).find((candidate) => options.includes(candidate));
  if (answer === undefined) throw new Error(`หัวข้อ ${room}: ไม่พบเฉลยของโจทย์ "${cardText}" ${JSON.stringify(options)}`);
  return answer;
}

/** ชุดโจทย์ทั้งหมดของด่านต่อสู้ของหัวข้อ (ชุดพื้นฐานและชุดยาก) */
const battlePools = (topic) => {
  const entry = quests.battles.find((b) => b.room === topic);
  return [...entry.pools, ...entry.hard];
};

const click = (locator) => locator.click();

/** ออกจากห้อง (หรือโถง) ไปโรงเก็บหุ่น */
async function goToHangar(page) {
  if ((await snap(page)).store.screen === "room") {
    await walkTo(page, "door-entry");
    await act(page);
    await inHall(page);
    await page.waitForTimeout(300);
  }
  await walkTo(page, "gate");
  assert.match((await snap(page)).store.prompt, /ประตูโรงเก็บหุ่น/);
  await act(page);
  await inHangar(page);
}

/** เดินกลับโถง (จากห้องหรือโรงเก็บหุ่น) แล้วเปิดร้านสหกรณ์ */
async function openHallShop(page) {
  if ((await snap(page)).store.screen !== "hall") {
    await walkTo(page, "door-entry");
    await act(page);
    await inHall(page);
    await page.waitForTimeout(300);
  }
  await walkTo(page, "shop");
  await act(page);
  await page.getByTestId("shop").waitFor();
}

async function backToHall(page) {
  await walkTo(page, "door-entry");
  await act(page);
  await inHall(page);
  await page.waitForTimeout(300);
}

/** ตอบโจทย์ของด่านต่อสู้หนึ่งข้อ (ถูกหรือผิดตามที่สั่ง) คืนข้อความบันทึกเหตุการณ์และพลังของทั้งสองฝ่ายหลังตอบ */
async function battleTurn(page, correctly, press = click) {
  const source = Number(await page.getByTestId("battle").getAttribute("data-source"));
  const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
  const options = await page.getByTestId("choice-option").allInnerTexts();
  const right = options.indexOf(poolAnswer(source, battlePools(source), cardText, options));
  assert.notEqual(right, -1, `ด่านต่อสู้: ไม่พบตัวเลือกที่ถูกของ "${cardText}" ใน ${JSON.stringify(options)}`);
  /** ตัวเลือกที่จะกด: ข้อที่ถูก หรือข้อที่ผิดข้อแรกที่ยังกดได้ (ชิปวิเคราะห์และชิปคิดทบทวนตัดตัวเลือกออกได้) ถ้าไม่เหลือข้อผิดให้ตอบถูก */
  const pick = async () => {
    if (correctly) return right;
    const enabled = await page.getByTestId("choice-option").evaluateAll((buttons) => buttons.map((button) => !button.disabled));
    const wrong = options.findIndex((_, i) => i !== right && enabled[i]);
    return wrong === -1 ? right : wrong;
  };
  await press(page.getByTestId("choice-option").nth(await pick()));
  // ชิปคิดทบทวนทำงาน: ตายังไม่จบ ต้องตอบข้อเดิมอีกครั้ง
  const retried = (await page.getByTestId("battle-next").count()) === 0;
  if (retried) await press(page.getByTestId("choice-option").nth(await pick()));
  const turn = {
    retried,
    source,
    form: Number(await page.getByTestId("battle").getAttribute("data-form")),
    log: (await page.getByTestId("battle-log").innerText()).replace(/\s+/g, " "),
    robot: Number(await page.getByTestId("hp-left").getAttribute("data-hp")),
    kaiju: Number(await page.getByTestId("hp-right").getAttribute("data-hp")),
  };
  await press(page.getByTestId("battle-next"));
  await page.waitForTimeout(60);
  return turn;
}

/** เปิดแผงสั่งปฏิบัติการในโรงเก็บหุ่น */
async function openMissions(page) {
  await walkTo(page, "console");
  assert.match((await snap(page)).store.prompt, /แผงสั่งปฏิบัติการ/);
  await act(page);
  await page.getByTestId("missions").waitFor();
}

/** สถานะของทุกด่านบนแผงสั่งปฏิบัติการ เช่น { k1: "won", k2: "ready", k3: "locked" } */
const missionStatus = (page) => page.locator('[data-testid="missions"] li').evaluateAll((rows) => Object.fromEntries(rows.map((row) => [row.dataset.testid.replace("mission-", ""), row.dataset.status])));

/** เปิดด่านต่อสู้จากแผงสั่งปฏิบัติการ (ด่านถัดไปที่ยังไม่ชนะ หรือซ้อมรบกับด่านที่ชนะแล้ว) คืนหน้าต่างด่านต่อสู้ที่อยู่หน้าเริ่มด่าน */
async function startBattle(page, id, name, { training = false } = {}) {
  await openMissions(page);
  assert.equal((await missionStatus(page))[id], training ? "won" : "ready", `สถานะของด่าน ${id} บนแผงสั่งปฏิบัติการ`);
  await page.getByTestId(`mission-${training ? "train" : "go"}-${id}`).click();
  const battle = page.getByTestId("battle");
  await battle.waitFor();
  assert.equal(await battle.getAttribute("data-battle"), id);
  assert.ok((await page.getByTestId("battle-title").innerText()).includes(name), `ชื่อด่านต้องมี ${name}`);
  return battle;
}

/** ตอบถูกจนชนะ แล้วกลับโรงเก็บหุ่น คืนรายการผลของแต่ละตา */
async function winBattle(page, id, press = click) {
  const turns = [];
  for (let guard = 0; guard < 60 && (await page.getByTestId("battle").getAttribute("data-stage")) === "fight"; guard++) turns.push(await battleTurn(page, true, press));
  await page.getByTestId("battle-won").waitFor();
  const credits = (await page.getByTestId("battle-credits").count()) ? await page.getByTestId("battle-credits").innerText() : "";
  const won = await page.getByTestId("battle-won").innerText();
  assert.equal(await playing(page), "victory:0", "ชนะแล้วเพลงเปลี่ยนเป็นเพลงมีชัย");
  await press(page.getByTestId("battle-finish"));
  await page.waitForTimeout(350);
  const record = (await snap(page)).store.battles[id];
  assert.equal(record.won, true);
  // ชนะไคจูประจำห้องครั้งแรก: ฉากเนื้อเรื่องหลังชนะ (บอส: บทส่งท้าย) ซ้อมรบซ้ำไม่มีฉาก
  const story = await readStory(page, press);
  return { turns, credits, record, won, story };
}

/** ด่านต่อสู้ของห้องในระดับง่ายแบบตอบถูกทุกข้อ: ไปโรงเก็บหุ่น สู้ ชนะ กลับโถง */
async function clearBattle(page, room) {
  await goToHangar(page);
  await startBattle(page, easyBattle(room), KAIJU[room - 1]);
  await page.getByTestId("battle-start").click();
  const result = await winBattle(page, easyBattle(room));
  assert.ok(result.won.includes(KAIJU[room - 1]));
  await backToHall(page);
  return result;
}

// ---------------------------------------------------------------- NPC ประจำห้อง (GDD ข้อ 16)

/**
 * เดินไปคุยกับ NPC ครั้งแรกที่คุย NPC เล่าเรื่องราวของตัวเองก่อน (ฟังจนจบ) ร้านพิเศษ: ครั้งแรกกดเข้าร้านจากหน้าต่างคุย ครั้งถัดไปเปิดร้านเลย
 * คืนบรรทัดของเรื่องราวที่ได้ฟัง (คุยซ้ำ = [])
 */
async function talkTo(page, id) {
  await walkTo(page, `npc-${id}`);
  assert.ok((await snap(page)).store.prompt.includes(NPC[id].name), `คำแนะนำหน้า NPC ต้องบอกชื่อ ${NPC[id].name}`);
  const met = (await snap(page)).store.npcs[id]?.met ?? false;
  await act(page);
  await page.waitForTimeout(150);
  const lines = [];
  for (let guard = 0; guard < 8 && (await page.getByTestId("npc-story").count()); guard++) {
    lines.push(await page.getByTestId("npc-story-line").innerText());
    await page.getByTestId("npc-story-next").click();
    await page.waitForTimeout(60);
  }
  assert.equal(lines.length > 0, !met, `${NPC[id].name}: เล่าเรื่องราวของตัวเองเฉพาะครั้งแรกที่คุย`);
  if (!met) {
    assert.ok(lines.length >= 2 && new Set(lines).size === lines.length, `${NPC[id].name}: เรื่องราวมีหลายบรรทัดไม่ซ้ำกัน`);
    assert.equal((await snap(page)).store.npcs[id].met, true, "ฟังเรื่องราวจบแล้วถูกบันทึก");
  }
  if (await page.getByTestId("npc-open-shop").count()) await page.getByTestId("npc-open-shop").click();
  await page.waitForTimeout(150);
  return lines;
}

/** เควสเสริม: รับเควส เดินเก็บของทุกชิ้น แล้วกลับมาส่ง คืนเครดิตที่ได้ */
async function doSideQuest(page, id) {
  const total = NPC[id].pickups;
  const visible = async () => (await snap(page)).interactables.filter((i) => i.id.startsWith(`pickup-${id}-`) && i.enabled).length;
  assert.equal(await visible(), 0, "ยังไม่รับเควส: ของยังไม่ปรากฏ");
  await talkTo(page, id);
  assert.equal(await page.getByTestId("npc-quest").getAttribute("data-stage"), "intro");
  assert.equal(await page.getByTestId("npc-name").innerText(), NPC[id].name);
  await page.getByTestId("npc-accept").click();
  await page.waitForTimeout(350);
  assert.equal(await visible(), total, "รับเควสแล้ว: ของทุกชิ้นปรากฏในห้อง");
  for (let index = 0; index < total; index++) {
    await walkTo(page, `pickup-${id}-${index}`);
    await act(page);
    const found = (await snap(page)).store.npcs[id].found.length;
    assert.equal(found, index + 1, `เก็บชิ้นที่ ${index + 1}`);
    assert.match((await snap(page)).store.toast, index + 1 < total ? new RegExp(`${index + 1}/${total}`) : new RegExp(`ครบแล้ว กลับไปหา${NPC[id].name}`));
    if (index === 0) {
      // คุยระหว่างทาง: บอกความคืบหน้า ยังส่งไม่ได้
      await talkTo(page, id);
      assert.equal(await page.getByTestId("npc-quest").getAttribute("data-stage"), "progress");
      await page.getByTestId("npc-close").click();
      await page.waitForTimeout(350);
    }
  }
  assert.equal(await visible(), 0, "เก็บครบแล้ว: ไม่มีของเหลือในห้อง");
  const before = Number(await page.getByTestId("credits").getAttribute("data-credits"));
  await talkTo(page, id);
  assert.equal(await page.getByTestId("npc-quest").getAttribute("data-stage"), "ready");
  await page.getByTestId("npc-hand-in").click();
  const reward = Number(await page.getByTestId("npc-reward").getAttribute("data-credits"));
  await page.getByTestId("npc-close").click();
  await page.waitForTimeout(350);
  assert.equal(Number(await page.getByTestId("credits").getAttribute("data-credits")), before + reward);
  assert.equal((await snap(page)).store.npcs[id].done, true);
  // ทำแล้วคุยซ้ำได้ แต่ไม่ได้เครดิตซ้ำ
  await talkTo(page, id);
  assert.equal(await page.getByTestId("npc-quest").getAttribute("data-stage"), "done");
  assert.equal(await page.getByTestId("npc-reward").count(), 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  return reward;
}

/** ถามตอบพิเศษหนึ่งรอบ: ตอบถูกตามจำนวนที่กำหนด ข้อที่เหลือตอบผิด คืนเครดิตที่ได้เพิ่ม */
async function doQuiz(page, id, correctCount) {
  const total = NPC[id].questions;
  await talkTo(page, id);
  await page.getByTestId("npc-quiz-start").click();
  for (let n = 1; n <= total; n++) {
    assert.match(await page.getByTestId("npc-quiz-progress").innerText(), new RegExp(`${n}/${total}`));
    const topic = Number(await page.getByTestId("choice").getAttribute("data-topic"));
    assert.ok((NPC[id].topics ?? [NPC[id].topic]).includes(topic), "โจทย์ของถามตอบพิเศษมาจากหัวข้อของ NPC คนนั้น");
    const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
    const options = await page.getByTestId("choice-option").allInnerTexts();
    const right = options.indexOf(poolAnswer(topic, battlePools(topic), cardText, options));
    assert.notEqual(right, -1);
    await page.getByTestId("choice-option").nth(n <= correctCount ? right : (right + 1) % options.length).click();
    await page.getByTestId("npc-quiz-next").click();
  }
  assert.equal(await page.getByTestId("npc-quiz-result").getAttribute("data-correct"), String(correctCount));
  const reward = (await page.getByTestId("npc-reward").count()) ? Number(await page.getByTestId("npc-reward").getAttribute("data-credits")) : 0;
  await page.getByTestId("npc-close").click();
  await page.waitForTimeout(350);
  return reward;
}

// ---------------------------------------------------------------- ห้อง 1: ระดับปกติ + ห้องซ่อม + ติวเตอร์ + สไตล์

async function playRoom1(page) {
  await page.goto(BASE_URL);
  // รอให้เกมพร้อมก่อน: dev server อาจสั่งโหลดหน้าใหม่หนึ่งครั้งหลังไฟล์ต้นทางเปลี่ยน
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  const form = await onboard(page, { name: "นักทดสอบ", topic1Correct: 1, shots: true, avatar: "b" });
  log(`ขั้นเริ่มเกม: ตั้งชื่อ เลือกตัวละคร (ทุกคนเริ่มที่แมพ 1 ไม่มีตัวเลือกระดับความยาก) แบบทดสอบก่อนเรียนชุด ${form} 12 ข้อ (สมรรถนะละ 2 ข้อ ไม่มีตัวเลือกยังไม่รู้) ไม่เฉลย เก็บผลรายข้อและรายสมรรถนะ (หัวข้อ 1 ถูก 1/2) แล้วเห็นบทนำของเนื้อเรื่องเป็นช่องการ์ตูน 5 ช่อง`);

  assert.equal((await snap(page)).interactables.filter((i) => i.id.startsWith("door-")).length, 6);
  assert.deepEqual((await snap(page)).interactables.map((i) => i.id).filter((id) => ["travel", "decorboard", "shop", "storage", "gate"].includes(id)).sort(), ["decorboard", "gate", "shop", "storage", "travel"], "โถงมีกระดานแผนที่ กระดานตกแต่ง ร้าน กล่องเก็บไอเทม และประตูโรงเก็บหุ่น");
  assert.match(await page.getByTestId("hud-map").innerText(), /แมพ 1/, "HUD บอกแมพที่อยู่");
  assert.deepEqual((await snap(page)).store.shop.decor, STARTER_DECOR, "โถงของแมพ 1 เริ่มด้วยของตกแต่ง 2 ชิ้น");
  assert.equal((await snap(page)).avatar.texture, "ch_b_lab", "ตัวละครในฉากเป็นแบบที่เลือกตอนลงทะเบียน");
  assert.equal((await snap(page)).companion.texture, "ch_mentor_south", "พี่บิตเริ่มที่รูปมาตรฐาน");
  await assertCanvasFits(page, "โถงทางเดิน");
  await shot(page, "01-hall");

  // --- เสียง: เพลงของโถงเล่นหลังผู้ใช้กดปุ่มครั้งแรก ปิดเปิดได้จากปุ่มบน HUD และจำค่าไว้ในเครื่อง
  let audio = (await snap(page)).audio;
  assert.deepEqual([audio.state, audio.playing, audio.settings], ["running", "lab:0", { music: true, sfx: true }], `สถานะเสียงในโถง: ${JSON.stringify(audio)}`);
  assert.ok(audio.sfxCount > 0, "ปุ่มที่กดมาแล้วมีเสียงประกอบ");
  await page.getByTestId("hud-sound").click();
  audio = (await snap(page)).audio;
  assert.deepEqual([audio.playing, audio.settings], [null, { music: false, sfx: false }], "ปิดเสียง: เพลงหยุด");
  assert.equal(await page.getByTestId("hud-sound").getAttribute("aria-pressed"), "false");
  const muted = audio.sfxCount;
  await page.getByTestId("hud-questlog").click();
  assert.equal((await snap(page)).audio.sfxCount, muted, "ปิดเสียง: ไม่มีเสียงประกอบ");
  await page.getByTestId("sound-music").click();
  assert.deepEqual((await snap(page)).audio.settings, { music: true, sfx: false }, "สมุดเควสเปิดปิดดนตรีและเสียงประกอบแยกกันได้");
  await page.getByTestId("sound-sfx").click();
  // คู่มือรูปในเกม: รูปของแต่ละจุดคืออะไร ใช้ทำอะไร
  await page.locator('[data-testid="questlog-guide"] summary').click();
  assert.equal(await page.locator('[data-testid^="guide-"]').count(), 19, "คู่มือรูป: โถง 6 โรงเก็บหุ่น 6 ห้องเรียน 4 และบนจอ 3");
  assert.match(await page.getByTestId("guide-shop").innerText(), /ร้านสหกรณ์แล็บ[\s\S]*ซื้อ/);
  assert.match(await page.getByTestId("guide-travel").innerText(), /กระดานแผนที่[\s\S]*เดินทางไปแมพอื่น/);
  await page.getByTestId("guide-travel").scrollIntoViewIfNeeded();
  await shot(page, "01-questlog-guide");
  await page.getByRole("button", { name: "ปิด", exact: true }).click();
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("ai-trainer-quest-settings"))), { music: true, sfx: true });
  assert.equal((await snap(page)).audio.playing, "lab:0");
  log("เสียง: เพลงของโถงเล่นหลังกดปุ่มครั้งแรก ปุ่มทุกปุ่มมีเสียงประกอบ ปิดเปิดได้จาก HUD และสมุดเควส จำค่าไว้ในเครื่อง");

  // --- เดิน: มีแอนิเมชันเดิน และพี่บิตตามผู้เล่น
  const startAt = (await snap(page)).player;
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(350);
  const moving = await snap(page);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1300);
  const walking = await snap(page);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(700);
  const resting = await snap(page);
  assert.equal(moving.avatar.walking && walking.avatar.walking, true, "ระหว่างเดินต้องเล่นแอนิเมชันเดิน");
  assert.notEqual(moving.avatar.frame, walking.avatar.frame, "เดินคนละทิศใช้เฟรมคนละแถว");
  assert.equal(resting.avatar.walking, false, "หยุดเดิน: กลับท่ายืน");
  assert.ok(resting.player.x - startAt.x > 120, "ผู้เล่นเดินไปทางขวา");
  const gap = Math.hypot(resting.companion.x - resting.player.x, resting.companion.y - resting.player.y);
  assert.ok(gap < 60, `พี่บิตต้องตามผู้เล่นมาอยู่ใกล้ ๆ (ห่าง ${Math.round(gap)} px)`);
  log("การเดิน: ตัวละครมีแอนิเมชันเดินตามทิศ หยุดแล้วกลับท่ายืน พี่บิตลอยตามผู้เล่น");
  await walkTo(page, "door-2");
  assert.match((await snap(page)).store.prompt, /ห้อง 2 ล็อกอยู่/);
  await act(page);
  assert.match((await snap(page)).store.toast, /ห้อง 2 ยังล็อก/);
  assert.equal((await snap(page)).store.screen, "hall");
  log("โถงทางเดิน: มีประตู 6 บาน ห้อง 2 ล็อกและเข้าไม่ได้ (แบบทดสอบก่อนเรียนไม่ปลดล็อกห้อง)");

  await walkTo(page, "door-1");
  assert.ok((await snap(page)).store.prompt.includes(topic1.title), "คำแนะนำหน้าประตูต้องแสดงชื่อหัวข้อจาก course.json");
  await act(page);
  const briefing = await inRoom(page, 1);
  assert.equal(briefing?.beat, "room-1", "เข้าห้องครั้งแรก: พี่บิตบรรยายสรุปภารกิจของห้อง");
  assert.ok(briefing.lines[0].includes(KAIJU[0]));
  assert.deepEqual(briefing.art, ["st_kaiju_1"], "บรรยายสรุปของห้องมีภาพไคจูของห้องนั้น");
  assert.equal((await snap(page)).audio.playing, "study:1", "ในห้องเรียนเปลี่ยนเป็นเพลงของห้องนั้น");
  await assertCanvasFits(page, "ห้อง 1");
  await shot(page, "02-room1");

  await walkTo(page, "station-2");
  await act(page);
  assert.equal((await snap(page)).store.overlay, null);
  assert.match((await snap(page)).store.toast, /ต้องฟังสถานี 1 ก่อน/);
  await walkTo(page, "minigame");
  await act(page);
  assert.equal((await snap(page)).store.overlay, null);
  log("ห้อง 1: ข้ามลำดับไม่ได้ (สถานี 3 และเครื่องฝึกยังล็อก)");

  const stations = await listenAll(page, 1, { check: true, shots: true });
  log(`ห้อง 1 บทสนทนา ${stations} สถานี: ข้อความและตารางตรงกับ course.json ทุกหน้า`);

  // --- ติวเตอร์: ถ้าไม่มีคีย์ Claude ต้องได้คำใบ้สำเร็จรูปจาก course.json
  const tutorResponse = page.waitForResponse((r) => r.url().endsWith("/api/tutor"));
  await page.getByTestId("hud-tutor").click();
  // พิมพ์ด้วยคีย์บอร์ดจริง รวมตัว e, w, a, s, d และเว้นวรรค ซึ่งเป็นปุ่มควบคุมเกม
  await page.getByTestId("tutor-input").pressSequentially("weeds and seas e", { delay: 5 });
  assert.equal(await page.getByTestId("tutor-input").inputValue(), "weeds and seas e");
  assert.equal((await snap(page)).store.overlay, null, "ปุ่มที่พิมพ์ในช่องข้อความต้องไม่ไปเปิดหน้าต่างในเกม");
  await page.getByTestId("tutor-input").fill("โมเดลคืออะไร");
  await page.getByTestId("tutor-send").click();
  const tutorBody = await (await tutorResponse).json();
  if (tutorBody.fallback) {
    await page.getByTestId("tutor-hint").waitFor();
    const hintText = await page.getByTestId("tutor-hint").innerText();
    assert.ok(hintText.includes(topic1.sections[1].heading) && hintText.includes(topic1.sections[1].body), "คำใบ้สำเร็จรูปต้องเป็นแผงอ้างอิงของมินิเกมจาก course.json");
    assert.match(await page.getByTestId("tutor-remaining").innerText(), /ถามได้อีก 8 ครั้ง/, "คำใบ้สำเร็จรูปไม่นับโควตา");
    log(`ติวเตอร์: API ตอบ fallback (${tutorBody.reason}) เกมแสดงคำใบ้สำเร็จรูปจาก course.json และไม่หักโควตา`);
  } else {
    await page.getByTestId("tutor-reply").waitFor();
    assert.match(await page.getByTestId("tutor-remaining").innerText(), /ถามได้อีก 7 ครั้ง/);
    log("ติวเตอร์: ได้คำตอบจาก Claude และหักโควตา 1 ครั้ง");
  }
  await page.keyboard.press("Escape");
  assert.equal((await snap(page)).store.tutorOpen, false);

  // --- มินิเกมระดับปกติ: ผิด 2 ครั้งติดต่อกัน -> ลดเป็นประคอง + เสนอห้องซ่อม
  await walkTo(page, "minigame");
  assert.match((await snap(page)).store.prompt, /จับคู่บัตรคำศัพท์/);
  await act(page);
  const game = page.getByTestId("minigame");
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), "standard", "หัวข้อ 1 ถูก 1/2 ต้องเริ่มที่ระดับปกติ");
  assert.equal(await page.getByTestId("match-card").count(), terms.length);
  assert.match(await page.getByTestId("peek-button").innerText(), /เหลือ 2/);

  await card(page, terms[0].term).click();
  await slot(page, terms[1].definition).click();
  assert.equal(await page.getByTestId("feedback").getAttribute("data-state"), "wrong");
  assert.equal(await page.getByTestId("match-card").count(), terms.length, "วางผิด บัตรต้องกลับถาด");
  assert.match(await page.getByTestId("misses").innerText(), /ผิด 1 ครั้ง/);
  assert.equal(await page.getByTestId("repair-prompt").count(), 0, "ผิดครั้งเดียวยังไม่เสนอห้องซ่อม");

  await page.getByTestId("peek-button").click();
  assert.ok((await page.getByTestId("peek").innerText()).includes(topic1.sections[1].body), "แผงอ้างอิงต้องเป็นข้อความเดิมจาก course.json");
  await page.getByTestId("peek").getByRole("button", { name: "ปิด", exact: true }).click();
  assert.match(await page.getByTestId("peek-button").innerText(), /เหลือ 1/);

  await card(page, terms[0].term).click();
  await slot(page, terms[2].definition).click();
  assert.equal(await game.getAttribute("data-tier"), "assist", "ผิด 2 ครั้งติดต่อกันต้องลดระดับ 1 ขั้น");
  assert.equal(await page.getByTestId("repair-prompt").getAttribute("data-required"), "false");
  assert.equal(await page.getByTestId("repair-decline").count(), 1, "ห้องซ่อมที่ถูกเสนอต้องปฏิเสธได้");
  await shot(page, "04-minigame-repair-offer");
  log("มินิเกมห้อง 1: เริ่มระดับปกติ ผิด 2 ครั้งติดต่อกันลดเป็นประคองและเสนอห้องซ่อมที่ปฏิเสธได้");

  await page.getByTestId("repair-go").click();
  const repair = page.getByTestId("repair");
  await repair.waitFor();
  assert.match(await repair.innerText(), /1\. ทบทวน/);
  assert.ok((await page.getByTestId("repair-review").innerText()).includes(topic1.sections[1].body));
  assert.ok((await repair.locator(".term-mark").count()) >= 4, "ห้องซ่อมทบทวนแบบเน้นคำภาษาอังกฤษในวงเล็บ");
  await page.getByTestId("repair-to-practice").click();
  for (const correctly of [true, false, true]) {
    await answerChoice(page, correctly);
    assert.equal(await page.getByTestId("repair-back").count(), 0, "ยังไม่ถูก 2 ข้อติดต่อกัน ต้องยังออกไม่ได้");
    await page.getByTestId("repair-next").click();
  }
  await answerChoice(page, true);
  assert.match(await page.getByTestId("repair-streak").innerText(), /2\/2/);
  await page.waitForTimeout(300);
  await shot(page, "05-repair");
  await page.getByTestId("repair-back").click();
  assert.equal(await repair.count(), 0);
  log("ห้องซ่อม: ทบทวนแบบเน้นคำสำคัญ ฝึก ถูก-ผิด-ถูก-ถูก จึงออกได้ (ต้องถูก 2 ข้อติดต่อกัน)");

  assert.equal(await game.getAttribute("data-tier"), "assist");
  assert.match(await page.getByTestId("peek-button").innerText(), /ไม่จำกัด/);
  assert.equal(await page.getByTestId("match-card").count(), 2, "ระดับประคองแสดงทีละ 2 คู่");
  const firstTerm = await page.getByTestId("match-card").first().getAttribute("data-label");
  await card(page, firstTerm).dragTo(slot(page, definitionOf(firstTerm)));
  assert.equal(await slot(page, definitionOf(firstTerm)).getAttribute("data-filled"), "true", "ลากไปวางต้องใช้ได้");
  await solveMinigame(page, 1);
  await page.getByTestId("minigame-finish").click();
  const room = (await snap(page)).store.progress[1];
  assert.equal(room.stars, 2, "ผิด 2 ครั้งต้องได้ 2 ดาว");
  assert.deepEqual(room.outcome, { totalMisses: 2, requiredRepair: false });
  assert.equal(room.summary.repairVisits, 1);
  log("มินิเกมระดับประคอง: ทีละ 2 คู่ วางได้ทั้งลากและแตะ จบด้วย 2 ดาว (ผิดสะสม 2 ครั้ง ไม่รีเซ็ตหลังห้องซ่อม)");

  // --- คำถามทบทวน
  await page.waitForTimeout(300);
  await walkTo(page, "core");
  await act(page);
  assert.match((await snap(page)).store.toast, /ต้องตอบคำถามทบทวน/);
  await walkTo(page, "review");
  await act(page);
  await page.getByTestId("review").waitFor();
  assert.match(await page.getByTestId("review").innerText(), /คำถามทบทวน เรื่องที่ 1/);
  await shot(page, "06-review");
  // ปิดกลางคัน: ยังไม่ผ่าน ต้องตอบใหม่ทั้งชุด
  await page.getByTestId("review-close").click();
  await page.waitForTimeout(350);
  assert.equal((await snap(page)).store.progress[1].reviewDone, false, "ปิดก่อนตอบครบ: คำถามทบทวนยังไม่ผ่าน");
  await act(page);
  const review1 = await answerReview(page, 1, { miss: 1 });
  assert.equal(review1.total, 6, "คำถามทบทวนเรื่องละ 6 ข้อ");
  assert.ok(review1.kinds.includes("truth") && review1.kinds.some((kind) => kind !== "truth"), `คำถามทบทวนมีทั้งแบบถูกหรือผิดและแบบเลือกคู่: ${review1.kinds}`);
  await shot(page, "06-review-done");
  await page.getByTestId("review-save").click();
  await page.waitForTimeout(350);
  assert.equal((await snap(page)).store.progress[1].reviewDone, true);
  assert.deepEqual((await snap(page)).store.progress[1].review, { correct: 5, total: 6 }, "บันทึกเฉพาะจำนวนข้อที่ตอบถูกตั้งแต่ครั้งแรก ไม่มีข้อความที่ผู้เรียนเขียน");
  assert.equal((await snap(page)).store.overlay, null);
  await takeCore(page, 1);
  await shot(page, "06-room1-done");
  log("ห้อง 1: คำถามทบทวนเป็นโจทย์เลือกตอบ 6 ข้อ (จับคู่ เชื่อมโยง ถูกหรือผิด) จาก course.json ข้อที่ผิดวนกลับมาถามซ้ำ ไม่มีการเขียนตอบ ได้แกน AI ชิ้นที่ 1");

  // --- สมุดเควส: แสดงแมพที่อยู่ (เดินทางที่กระดานแผนที่) ไม่มีตัวเลือกระดับความยากหรือสไตล์การเรียน
  await page.getByRole("button", { name: "สมุดเควส" }).click();
  assert.equal(await page.getByTestId("profile-difficulty").getAttribute("data-difficulty"), "easy");
  assert.match(await page.getByTestId("profile-difficulty").innerText(), /แมพ 1: Pixel AI Lab[\s\S]*กระดานแผนที่/);
  assert.equal(await page.getByTestId("questlog").locator('[data-testid^="style-"], [data-testid^="difficulty-"]').count(), 0);
  await page.getByRole("button", { name: "ปิด", exact: true }).click();
  // สถานีที่ฟังแล้วฟังซ้ำได้ ข้อความเดิมจาก course.json
  await walkTo(page, "station-0");
  await act(page);
  assert.ok(topic1.intro.startsWith(await page.getByTestId("dialogue-body").innerText()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  log("สมุดเควส: แสดงแมพที่อยู่ (แมพ 1) ไม่มีตัวเลือกระดับความยาก สถานีที่ฟังแล้วฟังซ้ำได้");

  // --- กลับโถง: ได้แกนแล้วแต่ยังไม่ชนะไคจู ห้อง 2 ยังล็อก
  await walkTo(page, "door-entry");
  await act(page);
  await inHall(page);
  await page.waitForTimeout(300);
  assert.match(await page.getByTestId("cores").innerText(), /1\/6/);
  assert.match(await page.getByTestId("objective").innerText(), /โรงเก็บหุ่น.*กลิตช์/);
  await walkTo(page, "door-3");
  await act(page);
  assert.match((await snap(page)).store.toast, /ห้อง 3 ยังล็อก ต้องได้แกน AI/);
  await walkTo(page, "door-2");
  await act(page);
  assert.match((await snap(page)).store.toast, /ห้อง 2 ยังล็อก.*กลิตช์/);
  assert.equal((await snap(page)).store.screen, "hall");
  log("เส้นทาง 1→6: ได้แกนห้อง 1 แล้ว ห้อง 2 ยังล็อกจนกว่าจะชนะไคจูของห้อง 1");

  // --- ร้านสหกรณ์แล็บ: เครดิตมาจากความคืบหน้า (สถานี 5 ดาว 2 ทบทวน แกน) = 25 + 20 + 10 + 20
  await walkTo(page, "shop");
  await act(page);
  await page.getByTestId("shop").waitFor();
  assert.equal(await page.getByTestId("shop-balance").getAttribute("data-balance"), "75");
  assert.equal(await page.getByTestId("shop-buy-outfit-engineer").isDisabled(), true, "เครดิตไม่พอ: ซื้อไม่ได้");
  await shot(page, "07-shop");
  await page.getByTestId("shop-close").click();

  // --- โรงเก็บหุ่น: ด่านต่อสู้ที่ 1
  await goToHangar(page);
  await assertCanvasFits(page, "โรงเก็บหุ่น");
  await shot(page, "07-hangar");
  // ตู้กระจกเก็บแกน AI: แกนที่เก็บได้ตั้งอยู่ในตู้ ไม่ได้วางเรียงบนพื้น
  assert.equal((await snap(page)).bay.cores, 1, "ตู้กระจกแสดงแกนที่เก็บได้ 1 ชิ้น");
  await walkTo(page, "corecase");
  await act(page);
  assert.match((await snap(page)).store.toast, /แกน AI ในตู้กระจก 1\/6 ชิ้น/);
  // แท่นการ์เดียน: หุ่นที่จอดอยู่แสดงอาวุธและเกราะที่ใส่ บอกว่าอาวุธชนะทาง พอใช้ได้ หรือแพ้ทางไคจูของด่านถัดไป
  assert.deepEqual((await snap(page)).bay, { texture: "gd_plate_fist", tint: null, chip: false, cores: 1 }, "หุ่นบนแท่นใส่เกราะมาตรฐานและกำหมัด");
  await walkTo(page, "robot");
  assert.match((await snap(page)).store.prompt, /แท่นการ์เดียน/);
  await act(page);
  await page.getByTestId("guardian-bay").waitFor();
  assert.equal(await page.getByTestId("guardian-power").getAttribute("data-power"), "80", "ค่าพลังรวม 60 + หมัดชนะทางกลิตช์ 20");
  assert.deepEqual(await page.getByTestId("guardian-model").evaluate((el) => [el.dataset.weapon, el.dataset.armor, el.dataset.chip]), ["fist", "plate", "none"]);
  assert.deepEqual(await page.getByTestId("guardian-bay").getByTestId("matchup").evaluateAll((rows) => rows.map((row) => row.dataset.matchup)), ["strong"]);
  assert.match(await page.getByTestId("guardian-vs-fist").innerText(), /กับกลิตช์: ชนะทาง/);
  assert.deepEqual(await page.getByTestId("guardian-bay").locator("[role=radio]").evaluateAll((radios) => radios.map((r) => r.dataset.testid)), ["guardian-weapon-fist", "guardian-armor-plate", "guardian-chip-none", "guardian-paint-standard"], "ยังไม่ได้ซื้ออะไร: มีแต่อุปกรณ์เริ่มต้น");
  await shot(page, "07-guardian-bay");
  await page.getByTestId("guardian-close").click();
  await page.waitForTimeout(300);
  await openMissions(page);
  assert.deepEqual(await missionStatus(page), { k1: "ready", k2: "locked", k3: "locked", k4: "locked", k5: "locked", omega: "locked" }, "แมพ 1: ไคจูประจำห้อง 5 ตัว และบอส 1 ตัว");
  assert.match(await page.getByTestId("mission-k2").innerText(), /ต้องได้แกน AI ชิ้นที่ 2 ก่อน/);
  // ค่าพลังรวมของการ์เดียนเทียบกับพลังที่แนะนำของแต่ละด่าน (คำแนะนำ ไม่ใช่เงื่อนไข)
  assert.equal(await page.getByTestId("missions-power").getAttribute("data-power"), "60", "อุปกรณ์เริ่มต้น: พลังสูงสุด 6 × 10");
  const recommended = await page.locator('[data-testid^="mission-power-"]').evaluateAll((rows) => rows.map((row) => [Number(row.dataset.recommended), row.dataset.ok]));
  // ด่านแรก: หมัดการ์เดียนชนะทางกลิตช์ (+20) พลัง 60 + 20 จึงถึงพลังที่แนะนำ ด่านอื่นยังไม่ถึง
  assert.deepEqual(recommended, CAMPAIGN.easy.battles.map((battle, i) => [battle.power, String(i === 0)]), "พลังที่แนะนำของแต่ละด่านตรงกับโครงของแมพ ด่านแรกใช้อุปกรณ์เริ่มต้นได้");
  assert.deepEqual(CAMPAIGN.easy.battles.map((battle) => battle.power), [80, 100, 110, 110, 140, 160]);
  assert.match(await page.getByTestId("mission-k1").innerText(), /จุดอ่อน: แรงกระแทก \(หมัด ค้อน\)/, "แผงสั่งปฏิบัติการบอกจุดอ่อนของไคจูแต่ละด่าน");
  await shot(page, "08-missions");
  await page.getByTestId("missions-close").click();
  await page.waitForTimeout(300);
  assert.equal(await playing(page), "hangar:0", "โรงเก็บหุ่นมีเพลงของตัวเอง");
  await startBattle(page, "k1", KAIJU[0]);
  assert.equal(await playing(page), "tension:0", "หน้าเตรียมออกปฏิบัติการใช้เพลงตึงเครียด");
  const intro1 = await page.getByTestId("battle-intro").innerText();
  assert.ok(intro1.includes("ตอบถูก การ์เดียนโจมตี"), "หน้าเริ่มด่านอธิบายลักษณะของไคจู");
  assert.match(intro1, /ขอข้อมูลจากพี่บิตได้ 2 ครั้ง/, "ระดับง่ายขอข้อมูลระหว่างสู้ได้ 2 ครั้ง");
  // หน้าเตรียมออกปฏิบัติการ: ค่าพลังรวมเทียบกับพลังที่แนะนำ อุปกรณ์ที่ใส่ กระเป๋า และคำแนะนำของพี่บิต
  const power1 = page.getByTestId("battle-power");
  assert.deepEqual([await power1.getAttribute("data-power"), await power1.getAttribute("data-recommended"), await power1.getAttribute("data-ok")], ["80", "80", "true"], "ค่าพลังรวม 60 + อาวุธชนะทาง 20");
  // พี่บิตบอกจุดอ่อนของไคจูและอาวุธที่ชนะทาง
  const advice1 = page.getByTestId("weapon-advice");
  assert.deepEqual([await advice1.getAttribute("data-weak"), await advice1.getAttribute("data-advantaged"), await advice1.getAttribute("data-better")], ["strike", "true", ""], "กลิตช์แพ้ทางแรงกระแทก หมัดที่ใส่อยู่ชนะทาง");
  assert.match(await advice1.innerText(), /กลิตช์ แพ้ทางแรงกระแทก/);
  assert.deepEqual([await page.getByTestId("battle-weak").getAttribute("data-weak"), await page.getByTestId("battle-weak").getAttribute("data-matchup"), await page.getByTestId("battle-weak").innerText()], ["strike", "strong", "▲ อาวุธชนะทาง · จุดอ่อน: แรงกระแทก (หมัด ค้อน)"], "ป้ายบนฉากบอกว่าอาวุธที่ใส่อยู่ชนะทาง");
  assert.equal(await page.getByTestId("battle-robot").getAttribute("data-armor"), "plate", "การ์เดียนในฉากต่อสู้ใส่เกราะที่ใส่ไว้จริง");
  assert.match(await page.getByTestId("battle-gear-note").innerText(), /หมัดการ์เดียน · เกราะมาตรฐาน · ไม่ใส่ชิป/);
  assert.equal(await page.getByTestId("bag-picker").getAttribute("data-bag"), "", "ยังไม่มีของใช้: กระเป๋าว่าง");
  assert.equal(await page.getByTestId("bag-box-empty").count(), 1);
  assert.match(await page.getByTestId("bag-missing").innerText(), /ยังไม่มีในกล่อง: ชุดซ่อมฉุกเฉิน · โล่พลังงาน · ชิปวิเคราะห์/, "พี่บิตบอกของที่ควรมีสำหรับด่านนี้");
  await shot(page, "08-battle-intro");
  await page.getByTestId("battle-start").click();
  assert.equal((await snap(page)).audio.playing, "battle:0", "ด่านต่อสู้ใช้เพลงต่อสู้");
  // แผงคำสั่งของตา: บอกล่วงหน้าว่าตอบถูกการ์เดียนใช้ท่าอะไร ตอบผิดไคจูใช้สกิลอะไร
  assert.match(await page.getByTestId("battle-turn").innerText(), /ตาที่ 1/);
  const command = page.getByTestId("battle-command");
  assert.deepEqual(await command.evaluate((el) => [el.dataset.move, el.dataset.damage, el.dataset.skill, el.dataset.threat]), ["punch", "1", "claw", "1"]);
  assert.match((await command.innerText()).replace(/\s+/g, " "), /ตอบถูก การ์เดียนใช้หมัดการ์เดียน -1.*ตอบผิด กลิตช์ใช้กรงเล็บ -1/);
  let turn = await battleTurn(page, false);
  assert.deepEqual([turn.robot, turn.kaiju], [5, 8], "ตอบผิด: ไคจูโจมตี การ์เดียนเสียพลัง 1");
  assert.match(turn.log, /ยังไม่ถูก.*กลิตช์ใช้กรงเล็บ -1/);
  assert.match(await page.getByTestId("battle-turn").innerText(), /ตาที่ 2/);
  // เอฟเฟกต์ของสกิล: กลิตช์พุ่งเข้ามาตะกุยเป็นรอยกรงเล็บบนการ์เดียน ชื่อสกิลขึ้นกลางฉาก ภาพเอฟเฟกต์โหลดได้จริง
  const effects = page.getByTestId("battle-fx");
  assert.equal(await effects.getAttribute("data-sparks"), "slash:robot");
  assert.equal(await effects.getAttribute("data-banners"), "กลิตช์: กรงเล็บ!");
  assert.equal(await effects.getAttribute("aria-hidden"), "true", "เอฟเฟกต์เป็นของประกอบ ผลของตาอ่านได้จากบันทึกเหตุการณ์");
  assert.ok(await effects.locator("img").first().evaluate(async (img) => (img.complete || (await new Promise((done) => img.addEventListener("load", done, { once: true })))) && img.naturalWidth > 0));
  // ขอข้อมูลจากพี่บิต: เนื้อหาเดิมจาก course.json จำกัดจำนวนครั้ง
  await page.getByTestId("battle-hint").click();
  const hint = await page.getByTestId("battle-hint-panel").innerText();
  assert.ok(hint.includes(topic1.sections[1].body) && hint.includes(topic1.tables[0].rows[0][1]), "ข้อมูลจากพี่บิตคือเนื้อหาที่โจทย์ใช้ จาก course.json");
  await page.getByTestId("battle-hint-close").click();
  assert.match(await page.getByTestId("battle-hint").innerText(), /เหลือ 1/);
  // ถามพี่บิต (ติวเตอร์ AI) ระหว่างสู้ได้ ขอบเขตคือห้องของโจทย์
  await page.getByTestId("battle-tutor").click();
  await page.getByTestId("tutor").waitFor();
  assert.equal((await snap(page)).store.tutorOpen, true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.equal((await snap(page)).store.overlay, "battle", "ปิดหน้าต่างถามพี่บิตแล้วยังอยู่ในด่านต่อสู้");
  turn = await battleTurn(page, true);
  assert.deepEqual([turn.robot, turn.kaiju], [5, 7]);
  assert.equal(await effects.getAttribute("data-sparks"), "impact:kaiju", "ตอบถูก (ยังไม่มีอาวุธ): การ์เดียนพุ่งเข้าไปต่อย");
  assert.equal(await effects.getAttribute("data-banners"), "การ์เดียน: หมัดการ์เดียน!");
  assert.equal(await page.getByTestId("battle-robot").getAttribute("data-weapon"), "fist");
  // ตอบถูกสองข้อติดกัน: อาวุธที่ชนะทางเริ่มแรงขึ้น (+1) และพี่บิตยิงเสริมอีก 1
  assert.deepEqual(await command.evaluate((el) => [el.dataset.move, el.dataset.damage]), ["punch", "2"], "แผงคำสั่งบอกล่วงหน้าว่าข้อถัดไปชนะทาง");
  turn = await battleTurn(page, true);
  assert.equal(turn.kaiju, 4, "ตอบถูกสองข้อติดกัน: ชนะทาง -2 และพี่บิตยิงเสริม -1");
  assert.equal(await effects.getAttribute("data-sparks"), "impact:kaiju,bolt:kaiju,impact:kaiju", "พี่บิตยิงเสริมมีเอฟเฟกต์ของตัวเอง");
  assert.match(turn.log, /การ์เดียนใช้หมัดการ์เดียน -2 \(ชนะทาง\).*พี่บิตยิงเสริม -1/);
  await shot(page, "08-battle-fight");
  while ((await page.getByTestId("battle").getAttribute("data-stage")) === "fight") await battleTurn(page, true);
  await page.getByTestId("battle-won").waitFor();
  assert.match(await page.getByTestId("battle-credits").innerText(), /\+40/, "ชนะในการออกปฏิบัติการครั้งแรก: 30 + 10 เครดิต");
  assert.match(await page.getByTestId("battle-won").innerText(), /ประตูห้อง 2 เปิดแล้ว/);
  await shot(page, "08-battle-won");
  await page.getByTestId("battle-finish").click();
  await page.getByTestId("story").waitFor();
  await shot(page, "08-story-win");
  const winStory = await readStory(page);
  assert.deepEqual([winStory?.beat, winStory.art], ["win-k1", ["st_win_kaiju_1", "st_upgrade"]], "ชนะไคจูประจำห้อง: เห็นฉากเนื้อเรื่องหลังชนะพร้อมภาพ");
  const battle1 = (await snap(page)).store.battles.k1;
  assert.deepEqual([battle1.won, battle1.wins, battle1.sorties, battle1.asked - battle1.correct], [true, 1, 1, 1]);
  await openMissions(page);
  assert.deepEqual(await missionStatus(page), { k1: "won", k2: "locked", k3: "locked", k4: "locked", k5: "locked", omega: "locked" }, "ชนะแล้ว: ด่านถัดไปยังล็อกจนกว่าจะได้แกน AI ชิ้นถัดไป");
  await page.getByTestId("missions-close").click();
  await page.waitForTimeout(300);
  log("ด่านต่อสู้ที่ 1 กลิตช์: ตอบผิดเสียพลัง ตอบถูกสองข้อติดพี่บิตยิงเสริม ขอข้อมูลและถามพี่บิตระหว่างสู้ได้ แผงคำสั่งบอกท่าล่วงหน้า ชนะแล้วได้ 40 เครดิต และห้อง 2 เปิด");

  // --- ตู้เสื้อผ้าในโรงเก็บหุ่น: ใส่ได้เฉพาะชุดที่มี (ซื้อชุดที่ร้านในโถง) เปลี่ยนตัวละครได้
  await walkTo(page, "wardrobe");
  await act(page);
  await page.getByTestId("wardrobe").waitFor();
  assert.deepEqual(await page.getByTestId("wardrobe").locator('[data-testid^="wardrobe-outfit-"]').evaluateAll((rows) => rows.map((row) => row.dataset.testid)), ["wardrobe-outfit-lab"], "ยังไม่ได้ซื้อชุด: ตู้มีแต่ชุดเริ่มต้น");
  await page.getByTestId("wardrobe-close").click();
  await page.waitForTimeout(300);

  // --- ร้านสหกรณ์ในโถง: ร้านขายอย่างเดียว ของที่ซื้อแล้วไปใส่ที่จุดปรับแต่งในโรงเก็บหุ่น
  await backToHall(page);
  await walkTo(page, "shop");
  await act(page);
  await page.getByTestId("shop").waitFor();
  assert.equal(await page.getByTestId("shop-balance").getAttribute("data-balance"), "115");
  assert.match(await page.getByTestId("shop-item-outfit-engineer").innerText(), /ในการต่อสู้: ชุดซ่อมฉุกเฉินฟื้นพลังเพิ่ม \+1/, "เครื่องแบบบอกสิทธิพิเศษในการต่อสู้");
  assert.equal(await page.locator('[data-testid^="shop-item-outfit-"]').count(), 8, "ร้านมีชุด 8 แบบ (ชุดเริ่มต้นไม่ขาย ชุดของแมพ 2 และ 3 ยังล็อก)");
  assert.deepEqual(await page.locator('[data-testid^="shop-item-outfit-"][data-locked="true"]').evaluateAll((rows) => rows.map((row) => row.dataset.testid.replace("shop-item-outfit-", "")).sort()), ["astronaut", "commander", "hero", "ninja"], "ชุดของแมพถัดไปยังซื้อไม่ได้");
  assert.match(await page.getByTestId("shop-locked-outfit-ninja").innerText(), /วางขายที่แมพ 2/);
  assert.equal(await page.locator('[data-testid^="shop-item-bit-"]').count(), 4, "ร้านมีคอสตูมของพี่บิต 4 แบบ (รูปมาตรฐานไม่ขาย ของร้านพิเศษไม่แสดงจนกว่าจะซื้อ)");
  assert.equal(await page.locator('[data-testid^="shop-item-module-"]').count(), 5, "ร้านมีโมดูลของพี่บิต 5 อย่าง");
  // อุปกรณ์ของการ์เดียน: 3 ช่อง (ของแมพ 1 และของแมพถัดไปที่ยังล็อก ของเริ่มต้นและของร้านพิเศษไม่แสดง) แต่ละชิ้นบอกค่าพลังที่เพิ่ม
  for (const [slot, count, locked] of [["weapon", 4, ["cannon", "hammer"]], ["armor", 3, ["guard", "spike"]], ["chip", 4, ["regen", "retry"]]]) {
    assert.equal(await page.locator(`[data-testid^="shop-item-${slot}-"]`).count(), count, `ร้านมี${slot} ${count} แบบ`);
    assert.deepEqual(await page.locator(`[data-testid^="shop-item-${slot}-"][data-locked="true"]`).evaluateAll((rows, prefix) => rows.map((row) => row.dataset.testid.replace(prefix, "")).sort(), `shop-item-${slot}-`), locked, `${slot} ของแมพถัดไปยังล็อก`);
  }
  assert.equal(await page.getByTestId("shop-buy-weapon-hammer").count(), 0, "ของที่ยังล็อกไม่มีปุ่มซื้อ");
  assert.match(await page.getByTestId("shop-power-weapon-sword").innerText(), /ค่าพลัง \+30/);
  assert.match(await page.getByTestId("shop-power-armor-heavy").innerText(), /ค่าพลัง \+20/);
  assert.equal(await page.getByTestId("shop-power").getAttribute("data-power"), "60");
  assert.equal((await snap(page)).audio.playing, "shop:0", "ร้านค้ามีเพลงของตัวเอง");
  assert.equal(await page.locator('[data-testid^="shop-item-supply-"]').count(), 5, "ร้านมีของใช้ในการต่อสู้ 5 อย่าง");
  assert.deepEqual(await page.locator('[data-testid^="shop-item-supply-"]').evaluateAll((rows) => rows.map((row) => Number(row.dataset.stock))), [3, 3, 2, 2, 1], "ของใช้มีจำนวนจำกัดต่อแมพ");
  await page.getByTestId("shop-buy-outfit-engineer").click();
  assert.equal(await page.getByTestId("shop-balance").getAttribute("data-balance"), "15");
  assert.match(await page.getByTestId("shop-owned-outfit-engineer").innerText(), /มีแล้ว · ใส่ที่ตู้เสื้อผ้าในโรงเก็บหุ่น/, "ซื้อแล้วร้านบอกว่าไปใส่ที่ไหน");
  assert.equal((await snap(page)).avatar.texture, "ch_b_lab", "ซื้อแล้วยังไม่สวมให้เอง");
  assert.equal(await page.getByTestId("shop-buy-supply-shield").isDisabled(), true, "เครดิตเหลือ 15: ซื้อโล่ (20) ไม่ได้");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  await goToHangar(page);
  await walkTo(page, "wardrobe");
  await act(page);
  await page.getByTestId("wardrobe").waitFor();
  assert.match(await page.getByTestId("wardrobe-outfit-engineer").innerText(), /ชุดซ่อมฉุกเฉินฟื้นพลังเพิ่ม \+1/, "ตู้เสื้อผ้าบอกสิทธิพิเศษของเครื่องแบบ");
  await page.getByTestId("wardrobe-outfit-engineer").click();
  assert.equal(await page.getByTestId("wardrobe-outfit-engineer").getAttribute("aria-checked"), "true");
  assert.equal((await snap(page)).avatar.texture, "ch_b_engineer", "สวมชุดที่ตู้แล้วตัวละครในฉากเปลี่ยนชุดทันที");
  await page.getByTestId("wardrobe-avatar-a").click();
  assert.equal((await snap(page)).avatar.texture, "ch_a_engineer");
  await page.getByTestId("wardrobe-outfit-lab").click();
  assert.equal((await snap(page)).avatar.texture, "ch_a_lab");
  await page.getByTestId("wardrobe-outfit-engineer").click();
  await page.getByTestId("wardrobe-avatar-b").click();
  await shot(page, "07-wardrobe");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  assert.deepEqual((await snap(page)).store.shop, { spent: 100, owned: ["outfit-engineer"], supplies: NO_SUPPLIES, outfit: "engineer", paint: "standard", bit: "classic", modules: [], weapon: "fist", armor: "plate", chip: "none", loadout: [], bought: {}, decor: STARTER_DECOR, layout: {}, theme: {} });
  log("ร้านขายอย่างเดียว ใส่ที่โรงเก็บหุ่น: เครดิต 75 + 40 ซื้อชุดช่าง 100 ไปสวมที่ตู้เสื้อผ้า เครื่องแบบบอกสิทธิพิเศษ สลับชุดและตัวละครได้ เครดิตไม่พอซื้อไม่ได้");

  // --- ซ้อมรบ: ด่านที่ชนะแล้วสู้ซ้ำได้เพื่อฟาร์มเครดิต ชนะไคจูแล้วการ์เดียนไม่ได้เก่งขึ้นเอง (ต้องซื้ออุปกรณ์)
  await startBattle(page, "k1", KAIJU[0], { training: true });
  assert.match(await page.getByTestId("battle-title").innerText(), /ซ้อมรบ/);
  assert.match(await page.getByTestId("battle-training").innerText(), /ครั้งละ \+5 อีก 5 ครั้ง/);
  assert.match(await page.getByTestId("battle-perk").innerText(), /ชุดช่าง/);
  assert.equal(await page.getByTestId("battle-power").getAttribute("data-power"), "85");
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("hp-left").getAttribute("data-max"), "6", "พลังสูงสุดยังเท่าเดิม: แกน AI ให้พลังงานออกรบ ไม่ได้อัปเกรดการ์เดียน");
  const replay = await winBattle(page, "k1");
  assert.deepEqual([replay.record.wins, replay.record.sorties, replay.credits, replay.story], [2, 2, "เครดิตวิจัย +5", null], "ซ้อมรบซ้ำ: ได้เครดิต ไม่มีฉากเนื้อเรื่องซ้ำ");
  assert.equal(await page.getByTestId("credits").getAttribute("data-credits"), "20");
  assert.equal((await snap(page)).store.overlay, null, "ซ้อมรบชนะแล้วไม่เปิดเนื้อเรื่องหรือประตูซ้ำ");
  log("ซ้อมรบ: สู้กับกลิตช์ซ้ำได้ ได้เครดิต +5 ต่อครั้ง พลังสูงสุดของการ์เดียนเท่าเดิมจนกว่าจะซื้ออุปกรณ์");

  await backToHall(page);
  await walkTo(page, "door-3");
  await act(page);
  assert.match((await snap(page)).store.toast, /ห้อง 3 ยังล็อก/);
  await walkTo(page, "door-2");
  await act(page);
  assert.equal((await inRoom(page, 2))?.beat, "room-2");
  log("เส้นทาง 1→6: ชนะไคจูของห้อง 1 แล้วประตูห้อง 2 เปิด ห้อง 3 ยังล็อก");
}

// ---------------------------------------------------------------- ห้อง 2–5: ขั้นตอนเดียวกับห้อง 1

// ระดับเริ่มต้นที่คาดไว้: แบบทดสอบก่อนเรียนของหัวข้อ 2–5 ถูก 0 ข้อ (ประคอง)
// ห้อง 2 ตามหลังห้อง 1 ที่ผิด 2 ครั้ง จึงไม่ปรับ ห้อง 3–5 ตามหลังห้องที่ผ่านโดยไม่ผิด จึงสูงขึ้น 1 ขั้น (GDD ข้อ 7.2)
const EXPECTED = {
  2: { tier: "assist", kinds: ["sort-cases"] },
  3: { tier: "standard", kinds: ["sort-items"] },
  4: { tier: "standard", kinds: ["order-steps", "accuracy"] },
  5: { tier: "standard", kinds: ["match-table"] },
};

async function playRoom(page, room) {
  const topic = topicOf(room);
  const expected = EXPECTED[room];
  await assertCanvasFits(page, `ห้อง ${room}`);
  const stations = await listenAll(page, room, { check: true });

  await walkTo(page, "minigame");
  await act(page);
  const game = page.getByTestId("minigame");
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), expected.tier, `ห้อง ${room}: ระดับเริ่มต้น`);
  if (room === 2) assert.ok((await game.innerText()).includes(topic.reviewInstruction), "ห้อง 2: แสดงคำสั่งของกิจกรรมจาก course.json");
  if (room === 4) {
    // หน้าการ์ดต้องไม่มีเลขนำหน้า และพลิกอ่านหลังการ์ดได้โดยใช้สิทธิ์เปิดอ่าน
    for (const label of await page.getByTestId("match-card").evaluateAll((els) => els.map((el) => el.dataset.label))) assert.doesNotMatch(label, /^\d/);
    const before = await page.getByTestId("peek-button").innerText();
    await page.getByTestId("flip-card").first().click();
    const firstLabel = await page.getByTestId("match-card").first().getAttribute("data-label");
    assert.equal(await page.getByTestId("card-back").first().innerText(), topic.sections.find((s) => strip(s.heading) === firstLabel).body, "หลังการ์ดต้องเป็น body ของขั้นตอนนั้น");
    assert.notEqual(await page.getByTestId("peek-button").innerText(), before, "การพลิกการ์ดใช้สิทธิ์เปิดอ่าน 1 ครั้ง");
  }
  await shot(page, `1${room}-room${room}-minigame`);
  const kinds = await solveMinigame(page, room);
  assert.deepEqual(kinds, expected.kinds, `ห้อง ${room}: ชนิดมินิเกม`);
  await page.getByTestId("minigame-finish").click();
  const progress = (await snap(page)).store.progress[room];
  assert.deepEqual(progress.outcome, { totalMisses: 0, requiredRepair: false });
  assert.equal(progress.stars, 3);

  await page.waitForTimeout(300);
  await walkTo(page, "review");
  await act(page);
  const review = await answerReview(page, room);
  assert.equal(review.total, 6, `ห้อง ${room}: คำถามทบทวน 6 ข้อ`);
  await shot(page, `1${room}-room${room}-review`);
  await page.getByTestId("review-save").click();
  await page.waitForTimeout(350);
  assert.deepEqual((await snap(page)).store.progress[room].review, { correct: review.total, total: review.total });
  if (room === 2) {
    // ถามตอบพิเศษยังล็อกจนกว่าจะได้แกน AI ของเรื่องนี้
    assert.deepEqual(await npcIds(page), ["coach"]);
    await talkTo(page, "coach");
    assert.equal(await page.getByTestId("npc-quiz").getAttribute("data-stage"), "locked");
    await page.getByTestId("npc-close").click();
    await page.waitForTimeout(350);
  }
  await takeCore(page, room);
  log(`ห้อง ${room} ${topic.title}: ${stations} สถานีตรงกับ course.json, เควส ${kinds.join(" + ")} (ระดับ${expected.tier}) 3 ดาว, คำถามทบทวนแบบเลือกตอบ ${review.total} ข้อ (${review.kinds.join(" ")}) ถูกทุกข้อ, ได้แกน AI ชิ้นที่ ${room}`);
  if (room === 2) {
    // ถามตอบพิเศษ: รอบแรกถูก 2 จาก 4 ได้ 10 เครดิต รอบสองถูกหมดได้เพิ่มอีก 10 (นับรอบที่ดีที่สุด) รอบสามไม่ได้เพิ่ม
    await page.waitForTimeout(300);
    const first = await doQuiz(page, "coach", 2);
    await shot(page, "12-npc-quiz-done");
    const second = await doQuiz(page, "coach", 4);
    const third = await doQuiz(page, "coach", 1);
    assert.deepEqual([first, second, third], [10, 10, 0]);
    assert.deepEqual((await snap(page)).store.npcs.coach, { met: true, accepted: false, found: [], done: false, best: 4, tries: 3, gifted: false });
    assert.deepEqual((await snap(page)).store.progress[2].outcome, { totalMisses: 0, requiredRepair: false }, "ถามตอบพิเศษไม่กระทบผลของเควส");
    log("NPC โค้ชแดเนียล (ถามตอบพิเศษ): ล็อกจนกว่าจะได้แกน AI โจทย์มาจากเนื้อหาของเรื่องที่ 2 นับรอบที่ดีที่สุด ได้เครดิต 10 + 10");
  }
  if (room === 3) {
    // ร้านพิเศษของป้ามาร์ธา: ขายของที่ร้านสหกรณ์ไม่มี ซื้อคอสตูมของพี่บิตแล้วพี่บิตในฉากเปลี่ยนทันที
    await page.waitForTimeout(300);
    await talkTo(page, "archivist");
    const shop = page.getByTestId("shop");
    await shop.waitFor();
    assert.equal(await shop.getAttribute("data-vendor"), "archivist");
    assert.ok((await page.getByTestId("shop-vendor").innerText()).includes(NPC.archivist.name));
    assert.deepEqual(await shop.locator('[data-testid^="shop-item-"]').evaluateAll((items) => items.map((item) => item.dataset.testid.replace("shop-item-", "")).sort()), ["bit-explorer", "paint-emerald"], "ร้านพิเศษมีเฉพาะของของร้านนี้");
    await shot(page, "13-npc-shop");
    await page.getByTestId("shop-buy-bit-explorer").click();
    assert.match(await page.getByTestId("shop-owned-bit-explorer").innerText(), /ใช้ที่แท่นชาร์จพี่บิตในโรงเก็บหุ่น/);
    assert.equal((await snap(page)).companion.texture, "ch_mentor_south", "ซื้อแล้วยังไม่เปลี่ยนชุดให้เอง");
    await page.getByTestId("shop-close").click();
    await page.waitForTimeout(350);
    log("NPC ป้ามาร์ธา (ร้านพิเศษ): ขายเฉพาะของของร้าน ซื้อคอสตูมนักสำรวจแล้วไปเปลี่ยนที่แท่นชาร์จพี่บิต");
  }
  if (room === 4) {
    await page.waitForTimeout(300);
    const reward = await doSideQuest(page, "foreman");
    assert.equal(reward, 25);
    await shot(page, "14-npc-quest-done");
    log("NPC หัวหน้าฮันส์ (เควสเสริม): รับเควส เก็บเฟือง 4 ชิ้นที่ปรากฏในห้อง กลับมาส่ง ได้ 25 เครดิตครั้งเดียว");
  }

  // --- ด่านต่อสู้ของห้อง: ไคจูแต่ละตัวมีลักษณะต่างกัน
  if (room === 3) {
    // ซื้อของใช้ในการต่อสู้ที่ร้านในโถงก่อนออกปฏิบัติการ
    await openHallShop(page);
    await page.getByTestId("shop-buy-supply-shield").click();
    await page.getByTestId("shop-buy-supply-repair-kit").click();
    assert.match(await page.getByTestId("shop-notice").innerText(), /ซื้อชุดซ่อมฉุกเฉินแล้ว/);
    await page.getByTestId("shop-close").click();
    await page.waitForTimeout(350);
    assert.deepEqual((await snap(page)).store.shop.supplies, { ...NO_SUPPLIES, "repair-kit": 1, shield: 1 });
  }
  if (room === 4) {
    await openHallShop(page);
    var swordBefore = Number(await page.getByTestId("shop-balance").getAttribute("data-balance"));
    assert.ok(swordBefore >= 120, `เครดิตก่อนด่านที่ 4 ต้องพอซื้ออาวุธหนึ่งชิ้น: ${swordBefore}`);
    await shot(page, "14-shop-gear");
    await page.getByTestId("shop-buy-weapon-sword").click();
    assert.equal(await page.getByTestId("shop-balance").getAttribute("data-balance"), String(swordBefore - 120), "ดาบ 120 เครดิต");
    assert.match(await page.getByTestId("shop-owned-weapon-sword").innerText(), /ใส่ที่แท่นการ์เดียนในโรงเก็บหุ่น/);
    assert.equal((await snap(page)).store.shop.weapon, "fist", "ซื้อแล้วยังไม่ใส่ให้เอง");
    await page.getByTestId("shop-close").click();
    await page.waitForTimeout(350);
  }
  await goToHangar(page);
  if (room === 3) {
    // แท่นชาร์จพี่บิต: เปลี่ยนคอสตูมที่ซื้อจากร้านพิเศษ
    await walkTo(page, "bitpad");
    assert.match((await snap(page)).store.prompt, /พี่บิต/);
    await act(page);
    await page.getByTestId("bitpad").waitFor();
    assert.equal(await page.getByTestId("bitpad-skin-classic").getAttribute("aria-checked"), "true");
    await page.getByTestId("bitpad-skin-explorer").click();
    assert.equal((await snap(page)).companion.texture, "ch_mentor_explorer_south", "เปลี่ยนคอสตูมที่แท่นแล้วพี่บิตในฉากเปลี่ยนทันที");
    await page.getByTestId("bitpad-skin-classic").click();
    assert.equal((await snap(page)).companion.texture, "ch_mentor_south");
    await page.getByTestId("bitpad-skin-explorer").click();
    assert.equal(await page.getByTestId("bitpad-module-laser").getAttribute("data-owned"), "false", "โมดูลที่ยังไม่ได้ซื้อแสดงว่ายังไม่มี");
    await shot(page, "13-bitpad");
    await page.getByTestId("bitpad-close").click();
    await page.waitForTimeout(350);
  }
  if (room === 4) {
    // แท่นการ์เดียน: เกียร์แครบแพ้ทางแรงกระแทก ทนคมอาวุธ หมัดชนะทาง ดาบแพ้ทาง
    await walkTo(page, "robot");
    await act(page);
    await page.getByTestId("guardian-bay").waitFor();
    assert.match(await page.getByTestId("guardian-vs-fist").innerText(), /กับเกียร์แครบ: ชนะทาง/);
    assert.match(await page.getByTestId("guardian-vs-sword").innerText(), /กับเกียร์แครบ: แพ้ทาง/);
    assert.equal(await page.getByTestId("guardian-power").getAttribute("data-power"), "85", "หมัดชนะทาง: 65 + 20");
    // ลองถือดาบที่แพ้ทาง: ค่าพลังรวมลดลง 20 แม้ดาบแรงกว่าหมัด (65 + 30 − 20)
    await page.getByTestId("guardian-weapon-sword").click();
    assert.deepEqual([await page.getByTestId("guardian-power").getAttribute("data-power"), await page.getByTestId("guardian-model").getAttribute("data-weapon")], ["75", "sword"]);
    assert.deepEqual(await page.getByTestId("guardian-bay").getByTestId("matchup").evaluateAll((rows) => rows.map((row) => row.dataset.matchup)), ["weak"]);
    assert.match(await page.getByTestId("guardian-bay").getByTestId("matchup").innerText(), /ความสามารถพิเศษของอาวุธไม่ทำงาน/);
    await page.getByTestId("guardian-close").click();
    await page.waitForTimeout(400);
    assert.equal((await snap(page)).bay.texture, "gd_plate_sword", "หุ่นที่จอดอยู่ถือดาบที่เพิ่งใส่");
    await walkTo(page, "storage");
    assert.match((await snap(page)).store.prompt, /กล่องเก็บไอเทม/);
    await act(page);
    await page.getByTestId("storage").waitFor();
    assert.equal(await playing(page), "shop:0");
    assert.equal(await page.getByTestId("storage-power").getAttribute("data-power"), "75");
    assert.equal(await page.getByTestId("storage-recommended").getAttribute("data-ok"), "false", "ด่านที่ 4 แนะนำพลัง 110: ยังไม่ถึง แต่ออกปฏิบัติการได้");
    // พี่บิตเตือนว่าดาบแพ้ทาง และแนะนำหมัด
    const weaponAdvice = page.getByTestId("weapon-advice");
    assert.deepEqual([await weaponAdvice.getAttribute("data-weak"), await weaponAdvice.getAttribute("data-advantaged"), await weaponAdvice.getAttribute("data-better"), await weaponAdvice.getAttribute("data-matchups")], ["strike", "false", "fist", "weak"]);
    assert.match(await weaponAdvice.innerText(), /เปลี่ยนเป็นหมัดการ์เดียนจะชนะทาง/);
    assert.match(await weaponAdvice.innerText(), /แท่นการ์เดียน/, "บอกว่าเปลี่ยนอาวุธได้ที่แท่นการ์เดียน");
    await shot(page, "14-storage");
    await page.getByTestId("storage-close").click();
    await page.waitForTimeout(350);
    log(`อุปกรณ์ของการ์เดียน: ซื้อดาบพลังงาน 120 เครดิต (เหลือ ${swordBefore - 120}) ใส่ที่แท่นการ์เดียน หุ่นที่จอดอยู่ถือดาบ ดาบแพ้ทางเกียร์แครบ ค่าพลังรวม 85 → 75 พี่บิตแนะนำหมัดที่ชนะทาง`);
  }
  if (room === 5) {
    // กระเป๋า: ซื้อของใช้ 4 ชิ้น ลงกระเป๋าให้ 3 ชิ้น ชิ้นที่ 4 อยู่ในกล่อง จัดใหม่ตามคำแนะนำของพี่บิตที่กล่องเก็บไอเทมในโถง
    await backToHall(page);
    await walkTo(page, "shop");
    await act(page);
    await page.getByTestId("shop").waitFor();
    for (const id of ["supply-overcharge", "supply-overcharge", "supply-shield", "supply-repair-kit"]) await page.getByTestId(`shop-buy-${id}`).click();
    assert.match(await page.getByTestId("shop-item-supply-repair-kit").innerText(), /มีอยู่ 1\/3 · ในกระเป๋า 0/, "กระเป๋าเต็ม 3 ชิ้นแล้ว: ชิ้นที่ 4 เก็บไว้ในกล่อง");
    await page.getByTestId("shop-close").click();
    await page.waitForTimeout(350);
    assert.deepEqual((await snap(page)).store.shop.loadout, ["overcharge", "overcharge", "shield"]);
    await walkTo(page, "storage");
    await act(page);
    await page.getByTestId("storage").waitFor();
    assert.equal(await page.getByTestId("bag-picker").getAttribute("data-bag"), "overcharge,overcharge,shield");
    assert.equal(await page.getByTestId("storage-power").getAttribute("data-power"), "110", "65 + ดาบ 30 + ของใช้ในกระเป๋า 3 × 5");
    assert.equal(await page.getByTestId("bag-add-repair-kit").isDisabled(), true, "กระเป๋าเต็ม: ใส่เพิ่มไม่ได้");
    // พี่บิตแนะนำของสำหรับฝูงมิมิก: โล่ ชุดซ่อม (ชิปวิเคราะห์ยังไม่มี จึงเติมด้วยของที่มี)
    const advice = page.getByTestId("bag-advice");
    assert.match(await advice.innerText(), /ด่านถัดไป: ฝูงมิมิก[\s\S]*ฝูงนี้โจมตีหนักตอนที่ยังเหลือเยอะ[\s\S]*ควรพก: โล่พลังงาน · ชุดซ่อมฉุกเฉิน · แบตเตอรี่เสริม/);
    assert.match(await page.getByTestId("bag-missing").innerText(), /ชิปวิเคราะห์/);
    await shot(page, "15-storage-bag");
    await page.getByTestId("bag-apply-advice").click();
    assert.equal(await page.getByTestId("bag-picker").getAttribute("data-bag"), "shield,repair-kit,overcharge");
    assert.equal(await page.getByTestId("bag-apply-advice").isDisabled(), true);
    // เอาของออกและใส่กลับเองได้
    await page.getByTestId("bag-slot-2").click();
    assert.deepEqual([await page.getByTestId("bag-picker").getAttribute("data-bag"), await page.getByTestId("storage-power").getAttribute("data-power")], ["shield,repair-kit", "105"]);
    await page.getByTestId("bag-add-overcharge").click();
    assert.equal(await page.getByTestId("bag-picker").getAttribute("data-bag"), "shield,repair-kit,overcharge");
    await page.getByTestId("storage-close").click();
    await page.waitForTimeout(350);
    assert.deepEqual((await snap(page)).store.shop.supplies, { ...NO_SUPPLIES, overcharge: 2, shield: 1, "repair-kit": 1 }, "จัดกระเป๋าไม่ได้ทำให้ของหาย");
    await goToHangar(page);
    log("กระเป๋าและกล่องเก็บไอเทม: ซื้อของ 4 ชิ้น พกได้ 3 ชิ้น ที่เหลืออยู่ในกล่อง พี่บิตแนะนำของตามลักษณะของไคจู กดจัดตามคำแนะนำได้");
  }
  const battle = await startBattle(page, easyBattle(room), KAIJU[room - 1]);
  const intro = await page.getByTestId("battle-intro").innerText();
  await page.getByTestId("battle-start").click();
  let detail = "";
  if (room === 2) {
    assert.match(intro, /ชาร์จพลัง/);
    await battleTurn(page, true);
    await battleTurn(page, false);
    await page.getByTestId("battle-charging").waitFor();
    const counter = await battleTurn(page, true);
    assert.match(counter.log, /การ์เดียนใช้หมัดจรวด -2 \(สวนกลับ\)/, "ตาที่ไคจูชาร์จพลัง ตอบถูกสวนกลับ 2 ด้วยท่าแรง");
    assert.equal(await page.getByTestId("battle-fx").getAttribute("data-sparks"), "fist:kaiju,impact:kaiju", "การโจมตีที่แรงตั้งแต่ 2 ขึ้นไปเป็นท่าแรงของอาวุธ: หมัดจรวด");
    detail = "ตาที่สามไคจูชาร์จพลัง ตอบถูกสวนกลับ 2";
  }
  if (room === 3) {
    assert.match(intro, /ฟื้นพลัง/);
    assert.equal(await page.getByTestId("battle-supply-repair-kit").isDisabled(), true, "พลังเต็ม: ใช้ชุดซ่อมไม่ได้");
    await battleTurn(page, true);
    await page.getByTestId("battle-supply-shield").click();
    const blocked = await battleTurn(page, false);
    assert.match(blocked.log, /โล่กันก้อนเศษเหล็กไว้ได้.*สแครปฟื้นพลัง \+1/);
    assert.deepEqual([blocked.robot, blocked.kaiju], [6, specOf("k3").forms[0].hp], "โล่กันการโจมตี แต่ไคจูฟื้นพลังกลับมาเต็ม");
    assert.equal(await page.getByTestId("battle-bag").getAttribute("data-bag"), "repair-kit", "ของที่ใช้แล้วออกจากกระเป๋า");
    const hit = await battleTurn(page, false);
    assert.equal(hit.robot, 5);
    assert.match(hit.log, /สแครปใช้ก้อนเศษเหล็ก -1/);
    assert.equal(await page.getByTestId("battle-fx").getAttribute("data-sparks"), "scrap:robot,impact:robot", "สกิลของสแครป: ขว้างก้อนเศษเหล็ก (พลังเต็มอยู่แล้วจึงไม่ฟื้น)");
    await page.getByTestId("battle-supply-repair-kit").click();
    assert.equal(await page.getByTestId("hp-left").getAttribute("data-hp"), "6", "ชุดซ่อมฟื้นพลังไม่เกินพลังเต็ม");
    assert.deepEqual((await snap(page)).store.shop.supplies, NO_SUPPLIES, "ของใช้แล้วหมดไป");
    detail = "ตอบผิดแล้วไคจูฟื้นพลัง ใช้โล่และชุดซ่อมจากร้านได้";
  }
  if (room === 4) {
    assert.match(intro, /ยิ่งโจมตีแรง/);
    const hits = [];
    assert.equal(await page.getByTestId("battle-robot").getAttribute("data-weapon"), "sword", "การ์เดียนถือดาบที่ซื้อมา");
    assert.deepEqual([await page.getByTestId("battle-weak").getAttribute("data-matchup"), await page.getByTestId("battle-weak").innerText()], ["weak", "▼ อาวุธแพ้ทาง · จุดอ่อน: แรงกระแทก (หมัด ค้อน)"]);
    assert.match(intro, /พลังยังไม่ถึงที่แนะนำ ออกปฏิบัติการได้เลย/, "พลังไม่ถึงที่แนะนำก็ออกปฏิบัติการได้");
    const fx = page.getByTestId("battle-fx");
    const sparks = [];
    for (let i = 0; i < 3; i++) {
      const struck = await battleTurn(page, true);
      hits.push(struck.log.match(/การ์เดียนใช้(\S+) -(\d)/).slice(1).join(" "));
      sparks.push(await fx.getAttribute("data-sparks"));
      assert.doesNotMatch(struck.log, /คริติคอล!/, "ดาบแพ้ทาง: ไม่ติดคริติคอล");
    }
    // คอมโบ 1, 2, 3 แต่ดาบแพ้ทางเกียร์แครบ ความสามารถพิเศษ (คริติคอลในข้อที่สาม) จึงไม่ทำงาน
    assert.deepEqual(hits.map((hit) => hit.split(" ")[1]), ["1", "2", "3"], "คอมโบ: ถูกติดต่อกันโจมตีแรงขึ้น แต่ไม่คูณสองเพราะแพ้ทาง");
    assert.equal(sparks[0], "sword:kaiju", "ท่าของดาบต่างจากหมัด");
    await shot(page, "14-battle-sword");
    detail = "ถือดาบที่แพ้ทาง ตอบถูกติดต่อกันโจมตีแรงขึ้น 1, 2, 3 แต่ไม่ติดคริติคอล";
  }
  if (room === 5) {
    assert.match(intro, /ฝูง/);
    const swarm = await battleTurn(page, false);
    assert.match(swarm.log, /ฝูงมิมิกใช้ฝูงถล่ม โจมตีหนัก -2/);
    assert.equal(await page.getByTestId("battle-bag").getAttribute("data-bag"), "shield,repair-kit,overcharge", "เข้าด่านพร้อมของในกระเป๋า 3 ชิ้น");
    assert.equal(await page.getByTestId("battle-supply-analyzer").count(), 0);
    // โล่กันสกิลหนักของฝูงได้
    await page.getByTestId("battle-supply-shield").click();
    assert.equal(await page.getByTestId("battle-command").getAttribute("data-saved"), "shield");
    const saved = await battleTurn(page, false);
    assert.match(saved.log, /โล่กันฝูงถล่มไว้ได้/);
    assert.equal(saved.robot, swarm.robot);
    detail = "ฝูงเหลือเยอะใช้สกิลฝูงถล่ม โจมตีหนัก 2 พกของเข้าด่านได้ 3 ชิ้น";
  }
  if (room === 2) await shot(page, `1${room}-battle${room}`);
  const fight = await winBattle(page, easyBattle(room));
  assert.ok(fight.won.includes(KAIJU[room - 1]));
  assert.equal(fight.story?.beat, `win-${easyBattle(room)}`, "ชนะไคจูประจำห้อง: เห็นฉากเนื้อเรื่องหลังชนะ");
  assert.equal(fight.story.art[0], `st_win_kaiju_${room}`);
  assert.equal(await battle.count(), 0);
  log(`ด่านต่อสู้ที่ ${room} ${KAIJU[room - 1]}: ${detail} ชนะแล้ว ${fight.credits}`);

  await backToHall(page);
  await walkTo(page, `door-${room + 1}`);
  await act(page);
  assert.equal((await inRoom(page, room + 1))?.beat, `room-${room + 1}`);
}

// ---------------------------------------------------------------- ห้อง 6: ภารกิจภาคสนาม + ใบประกาศ

async function playField(page) {
  const topic = topicOf(6);
  const quest = course.finalQuest;
  await assertCanvasFits(page, "ห้อง 6");
  assert.equal((await snap(page)).interactables.filter((i) => i.id.startsWith("station-")).length, 0);
  await walkTo(page, "core");
  await act(page);
  assert.match((await snap(page)).store.toast, /ต้องทำภารกิจภาคสนาม/);
  assert.equal((await snap(page)).store.progress[6].core, false);

  await walkTo(page, "field");
  await act(page);
  const field = page.getByTestId("field");
  await field.waitFor();
  const text = await field.innerText();
  assert.ok(text.includes(topic.intro), "หน้าแนะนำแสดง intro ของหัวข้อ 6");
  const link = page.getByTestId("field-link");
  assert.equal(await link.getAttribute("href"), quest.url);
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.match(await link.getAttribute("rel"), /noopener/);
  await page.getByTestId("field-ready").check();

  const steps = page.getByTestId("field-step");
  assert.equal(await steps.count(), 6);
  for (const step of quest.steps) assert.ok(text.includes(step), `ไม่พบขั้นตอน: ${step}`);
  assert.equal(await steps.nth(1).isDisabled(), true, "ต้องติ๊กขั้นตอนตามลำดับ");
  for (let i = 0; i < 6; i++) {
    if (i === 3) assert.equal(await page.getByTestId("field-preview-note").count(), 0);
    await steps.nth(i).check();
  }
  assert.ok((await page.getByTestId("field-preview-note").innerText()).includes(topic.sections[0].body.split("\n\n")[1]), "หลังขั้นที่ 4 แสดงข้อควรระวังเรื่อง Preview จาก course.json");

  // ตารางบันทึกผล: หัวคอลัมน์และชื่อคลาสจาก course.json, Accuracy = (ถูก ÷ ทดสอบ) × 100
  assert.deepEqual(await page.getByTestId("field-table").locator("thead th").allInnerTexts(), topic.tables[0].headers);
  assert.deepEqual(await page.getByTestId("field-row").locator("th").allInnerTexts(), quest.resultTable.classes);
  const images = page.getByTestId("field-images");
  const correct = page.getByTestId("field-correct");
  await images.nth(0).fill("29");
  assert.match(await field.innerText(), /ต้องเป็นจำนวนเต็มอย่างน้อย 30/);
  await correct.nth(0).fill("11");
  assert.match(await field.innerText(), /ต้องเป็นจำนวนเต็ม 0 ถึง 10/);
  assert.equal(await page.getByTestId("field-total-accuracy").innerText(), "—");
  const results = [[30, 8], [35, 10], [32, 7]];
  for (const [i, [img, ok]] of results.entries()) {
    await images.nth(i).fill(String(img));
    await correct.nth(i).fill(String(ok));
  }
  assert.deepEqual(await page.getByTestId("field-accuracy").allInnerTexts(), ["80%", "100%", "70%"]);
  assert.deepEqual(await page.getByTestId("field-total").locator("th, td").allInnerTexts(), ["รวม", "97", "30", "25", "83.3%"]);
  assert.ok((await field.innerText()).includes(quest.accuracyFormula));

  const notes = page.getByTestId("field-note");
  assert.equal(await notes.count(), quest.notes.prompts.length);
  for (const prompt of quest.notes.prompts) assert.ok((await field.innerText()).includes(prompt));
  // บันทึกเพิ่มเติม: ติ๊กว่าคิดทบทวนแล้ว ไม่มีช่องให้เขียนตอบ
  assert.equal(await field.locator("textarea").count(), 0, "ภารกิจภาคสนามไม่มีช่องให้เขียนตอบ");
  for (let i = 0; i < 3; i++) await notes.nth(i).check();
  assert.equal(await page.getByTestId("field-status").getAttribute("data-complete"), "false", "ยังไม่มีหลักฐาน ภารกิจยังไม่ครบ");
  await page.getByTestId("field-attach").setInputFiles(new URL("../public/assets/cores/core_6.png", import.meta.url).pathname);
  await page.getByTestId("field-evidence-image").waitFor();
  assert.equal(await page.getByTestId("field-status").getAttribute("data-complete"), "true");
  await shot(page, "16-room6-field");
  await page.getByTestId("field-close").click();
  log("ห้อง 6 ภารกิจภาคสนาม: ลิงก์เปิดแท็บใหม่ เช็คลิสต์ 6 ขั้นตามลำดับ ฟอร์มตรวจค่าและคำนวณ Accuracy รายคลาส 80/100/70% รวม 83.3% ข้อคิดทบทวน 3 ข้อเป็นการติ๊ก (ไม่เขียนตอบ) แนบภาพหลักฐานได้");

  // --- ใบประกาศ
  await page.waitForTimeout(300);
  assert.match(await page.getByTestId("objective").innerText(), /ด่านสแกนออก/);
  await walkTo(page, "core");
  await act(page);
  // --- แบบทดสอบหลังเรียน: เลื่อนไปทำทีหลังได้ ใช้ชุดคู่ขนานคนละชุดกับก่อนเรียน ทำเสร็จจึงได้แกนชิ้นสุดท้าย
  await page.getByTestId("posttest").waitFor();
  await shot(page, "16-posttest");
  await page.getByTestId("assessment-cancel").click();
  let state = (await snap(page)).store;
  assert.deepEqual([state.overlay, state.posttest, state.progress[6].core], [null, null, false], "เลื่อนแบบทดสอบหลังเรียน: ยังไม่ได้แกนและใบประกาศ");
  await page.waitForTimeout(400);
  await act(page);
  const preForm = state.pretest.form;
  const postForm = await takeAssessment(page, "posttest", (topic, nth) => topic !== 6 || nth === 1);
  assert.notEqual(postForm, preForm, "หลังเรียนต้องเป็นชุดคู่ขนานคนละชุดกับก่อนเรียน");
  // ทำเสร็จได้แกนชิ้นสุดท้าย: หน้ารับแกนบอกภารกิจสุดท้าย และเปิดใบประกาศได้เลย
  await page.getByTestId("reward").waitFor();
  assert.match(await page.getByTestId("reward-title").innerText(), /ได้รับแกน AI ชิ้นที่ 6/);
  assert.ok((await page.getByTestId("reward-next").innerText()).includes(KAIJU[5]));
  await shot(page, "16-reward-final");
  await page.getByTestId("reward-certificate").click();
  const certificate = page.getByTestId("certificate");
  await certificate.waitFor();
  assert.equal((await snap(page)).audio.playing, "victory:0");
  assert.match(await page.getByTestId("certificate-guardian").innerText(), /แมพ 1: Pixel AI Lab ปราบไคจู 5\/6 ด่าน/);
  assert.equal(await page.getByTestId("certificate-guardian").locator("[data-map]").count(), 1, "ใบประกาศแสดงเฉพาะแมพที่ไปถึงแล้ว");
  state = (await snap(page)).store;
  assert.deepEqual(state.posttest.correctByTopic, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 });
  assert.deepEqual(
    [await page.getByTestId("growth-pre").innerText(), await page.getByTestId("growth-post").innerText(), await page.getByTestId("growth-gain").innerText()],
    ["1/12", "11/12", "+10"],
    "ใบประกาศแสดงคะแนนก่อนเรียน หลังเรียน และพัฒนาการ",
  );
  assert.equal(await page.getByTestId("certificate-growth").locator("tbody tr").count(), 7, "พัฒนาการรายสมรรถนะ 6 ข้อ + รวม");
  log(`แบบทดสอบหลังเรียน: ชุด ${postForm} (ก่อนเรียนชุด ${preForm}) เลื่อนได้ก่อนเริ่มตอบ ทำเสร็จได้แกนชิ้นที่ 6 ใบประกาศแสดงพัฒนาการ 1/12 → 11/12 (+10)`);
  assert.equal(await page.getByTestId("certificate-name").innerText(), "นักทดสอบ");
  const competencies = page.getByTestId("certificate-competency");
  assert.equal(await competencies.count(), 6);
  assert.equal(await certificate.locator('[data-testid="certificate-competency"][data-passed="true"]').count(), 6, "สมรรถนะต้องผ่านครบ 6 ข้อ");
  assert.deepEqual((await competencies.allInnerTexts()).map((t, i) => t.includes(course.topics[i].objective)), Array(6).fill(true), "สมรรถนะต้องเป็น objective จาก course.json ตามลำดับ");
  assert.equal(await page.getByTestId("certificate-accuracy").innerText(), "83.3%");
  const certText = await certificate.innerText();
  for (const c of quest.gradingCriteria) assert.ok(certText.includes(c.criterion) && certText.includes(`${c.weightPercent}%`));
  assert.ok(certText.includes(course.course.code) && certText.includes(topic.sections[3].heading));
  assert.equal(await page.getByTestId("certificate-download").count(), 0, "ไม่มีสมุดบันทึกคำตอบให้ดาวน์โหลดแล้ว (เกมไม่มีการเขียนตอบ)");
  await page.setViewportSize({ width: 1280, height: 1500 });
  await shot(page, "17-certificate");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId("certificate-back").click();
  const store = (await snap(page)).store;
  assert.equal(store.progress[6].core, true);
  assert.match(await page.getByTestId("cores").innerText(), /6\/6/);
  log("ใบประกาศนักฝึก AI: ชื่อผู้เล่น สมรรถนะ 6 ข้อจาก course.json ผ่านครบ Accuracy รวม 83.3% เกณฑ์ประเมิน 4 ข้อ");

  // --- ความคืบหน้าทั้งหมดอยู่รอดหลังโหลดหน้าใหม่
  await page.reload();
  await page.locator('[data-testid="menu-continue"]:not([disabled])').waitFor();
  assert.match(await page.getByTestId("menu-continue").innerText(), /เล่นต่อ \(นักทดสอบ\)/, "เมนูบอกว่าความคืบหน้าในเครื่องเป็นของใคร");
  await page.getByTestId("menu-continue").click();
  await inHall(page);
  const saved = (await snap(page)).store;
  assert.deepEqual(Object.values(saved.progress).map((p) => p.core), Array(6).fill(true));
  assert.deepEqual([saved.pretest.items.length, saved.posttest.items.length], [12, 12], "ผลรายข้อของทั้งสองครั้งถูกบันทึก");
  // ข้อมูลสำหรับครู: ชิ้นที่ตอบผิดในเควสห้อง 1 จำนวนครั้งที่ถามพี่บิต และเวลาในห้อง
  const room1 = saved.progress[1];
  assert.equal(Object.values(room1.missed).reduce((sum, n) => sum + n, 0), 2, "ห้อง 1 ตอบผิด 2 ครั้ง ต้องบันทึกว่าผิดที่ชิ้นไหน");
  for (const label of Object.keys(room1.missed)) assert.ok(terms.some((t) => t.term === label), `ชิ้นที่ผิดต้องเป็นข้อความบนการ์ด: ${label}`);
  assert.equal(room1.tutor.ai + room1.tutor.hints, 1, "ถามพี่บิต 1 ครั้งในห้อง 1");
  assert.ok(Object.values(saved.progress).every((p) => p.timeMs > 0), "ทุกห้องมีเวลาที่บันทึกไว้");
  assert.ok(saved.progress[6].field.evidence.image.startsWith("data:image/jpeg"));
  assert.match(await page.getByTestId("objective").innerText(), /โรงเก็บหุ่น.*โอเมก้า/);
  await page.getByRole("button", { name: "สมุดเควส" }).click();
  const profile = page.getByTestId("questlog");
  assert.match(await page.getByTestId("profile-cores").innerText(), /6\/6/);
  assert.ok(Number(await page.getByTestId("profile-power").getAttribute("data-power")) >= 95, "สมุดเควสแสดงค่าพลังรวมของการ์เดียน");
  assert.equal(await profile.locator('[data-collected="true"]').count(), 6);
  assert.equal(await profile.locator('li[data-passed="true"]').count(), 6);
  await shot(page, "18-profile-complete");
  await page.getByRole("button", { name: "ปิด", exact: true }).click();
  await assertCanvasFits(page, "โถงทางเดินหลังจบเกม");
  log("โหลดหน้าใหม่แล้วความคืบหน้าทั้ง 6 ห้องยังอยู่ หน้าโปรไฟล์แสดงแกน 6/6 และสมรรถนะผ่าน 6 ข้อ ข้อมูลสำหรับครู (ชิ้นที่ผิด ติวเตอร์ เวลา) ถูกบันทึก");

  // --- ด่านสุดท้าย: โอเมก้า 6 เฟส แต่ละเฟสใช้โจทย์ของห้อง 1 ถึง 6 ตามลำดับ ชนะแล้วเห็นบทส่งท้ายและใบประกาศ
  await goToHangar(page);
  await startBattle(page, "omega", KAIJU[5]);
  assert.match(await page.getByTestId("battle-intro").innerText(), /หลายเฟส/);
  await page.getByTestId("battle-start").click();
  assert.equal((await snap(page)).audio.playing, "boss:0", "ด่านสุดท้ายใช้เพลงของตัวเอง");
  assert.match(await page.getByTestId("battle-phase").innerText(), /เฟส 1\/6/);
  await shot(page, "18-battle-final");
  const boss = [];
  let furious = 0;
  while ((await page.getByTestId("battle").getAttribute("data-stage")) === "fight") {
    // เฟสที่ 3 เป็นต้นไป: โอเมก้าโกรธจัด สกิลเปลี่ยนเป็นลมหายใจเพลิง (โจมตีหนัก)
    if (await page.getByTestId("battle-furious").count()) {
      furious += 1;
      assert.deepEqual(await page.getByTestId("battle-command").evaluate((el) => [el.dataset.skill, el.dataset.threat]), ["flame", "1"], "ลมหายใจเพลิงแรง 2 แต่ดาบชนะทางโอเมก้า โดนเบาลง 1");
    } else assert.equal(await page.getByTestId("battle-command").getAttribute("data-skill"), "dragon-claw");
    boss.push(await battleTurn(page, true));
  }
  assert.ok(furious > 0, "ครึ่งหลังของด่านสุดท้ายโอเมก้าโกรธจัด");
  assert.match(boss.at(-1).log, /ลำแสงแกน AI|พี่บิตยิงเสริม/, "ปิดฉากด้วยลำแสงแกน AI (หรือพี่บิตยิงเสริมเป็นคนปิด)");
  const sources = boss.map((turn) => turn.source);
  assert.deepEqual(sources, [...sources].sort((a, b) => a - b), `เฟสไล่จากห้อง 1 ไปห้อง 6: ${sources}`);
  // ดาบชนะทางโอเมก้าและติดคริติคอล การโจมตีแรงครั้งเดียวจึงข้ามเฟสสุดท้ายได้ (เฟสนับจากพลังที่เหลือ)
  assert.equal(sources[0], 1);
  assert.ok(sources.at(-1) >= 5, `ด่านจบที่เฟสท้าย ๆ: ${sources}`);
  assert.ok(boss.some((turn) => /ผ่านเฟสแล้ว/.test(turn.log)));
  await page.getByTestId("battle-won").waitFor();
  assert.match(await page.getByTestId("battle-won").innerText(), /เมืองปลอดภัยแล้ว/);
  assert.match(await page.getByTestId("battle-credits").innerText(), /\+70/, "บอสให้ 60 เครดิต + ชนะในครั้งแรก 10");
  await page.getByTestId("battle-finish").click();
  await page.getByTestId("story").waitFor();
  await shot(page, "18-story-ending");
  const ending = await readStory(page);
  assert.equal(ending?.beat, "ending", "ชนะครบทุกด่าน: เห็นบทส่งท้าย");
  assert.deepEqual(ending.art, ["st_ending_1", "st_ending_2", "st_ending_3", "st_map2"], "บทส่งท้ายของแมพ 1 มี 4 ช่อง ช่องสุดท้ายเปิดเส้นทางไปแมพ 2");
  assert.match(ending.lines.at(-1), /กระดานแผนที่ในโถงเปิดเส้นทางไปแมพ 2/);
  assert.ok(ending.lines.some((line) => line.includes("นักทดสอบ")));
  await page.getByTestId("certificate").waitFor();
  assert.match(await page.getByTestId("certificate-guardian").innerText(), /ปราบไคจู 6\/6/);
  await page.getByTestId("certificate-back").click();
  await page.waitForTimeout(350);
  assert.equal((await readStory(page)), null, "บทส่งท้ายไม่แสดงซ้ำ");
  assert.match(await page.getByTestId("objective").innerText(), /ปกป้องเมืองสำเร็จแล้ว/);
  await backToHall(page);
  assert.match(await page.getByTestId("objective").innerText(), /ชนะไคจูของแมพนี้ครบแล้ว ไปที่กระดานแผนที่เพื่อเดินทางไปแมพ 2/, "จบแมพ 1 แล้ว: เป้าหมายถัดไปคือเดินทางไปแมพ 2");
  log(`ด่านสุดท้าย โอเมก้า: ${boss.length} ตา ไล่โจทย์ห้อง ${[...new Set(sources)].join(", ")} ชนะแล้วเห็นบทส่งท้าย ใบประกาศแสดงปราบไคจู 6/6`);

  // ร้านพิเศษของน้องมีอาในห้อง 5: ของเฉพาะร้าน ซื้อสีพิเศษของการ์เดียนได้
  await walkTo(page, "door-5");
  await act(page);
  await inRoom(page, 5);
  await talkTo(page, "vendor");
  await page.getByTestId("shop").waitFor();
  assert.deepEqual(await page.getByTestId("shop").locator('[data-testid^="shop-item-"]').evaluateAll((items) => items.map((item) => item.dataset.testid.replace("shop-item-", "")).sort()), ["bit-star", "paint-sakura"]);
  await page.getByTestId("shop-buy-paint-sakura").click();
  assert.equal((await snap(page)).store.shop.paint, "standard", "ซื้อสีแล้วไปย้อมที่แท่นการ์เดียน");
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(350);
  await walkTo(page, "door-entry");
  await act(page);
  await inHall(page);
  await page.waitForTimeout(300);

  // แท่นห้อง 6 หลังจบเกม: เปิดใบประกาศได้ทันที ไม่ต้องทำแบบทดสอบซ้ำ
  await walkTo(page, "door-6");
  await act(page);
  assert.equal(await inRoom(page, 6), null, "บรรยายสรุปของห้องแสดงครั้งเดียว");
  // ถามตอบพิเศษของพี่ลูคัส: เปิดหลังได้แกน AI ชิ้นสุดท้าย (จึงอยู่หลังแบบทดสอบหลังเรียนเสมอ) โจทย์จากขั้นตอนของภารกิจภาคสนาม
  assert.equal(await doQuiz(page, "director", 4), 20);
  await page.getByRole("button", { name: "สมุดเควส" }).click();
  assert.match(await page.getByTestId("questlog-side").innerText(), /กิจกรรมเสริมกับคนในแล็บ \(ไม่บังคับ\) 3\/4/);
  await page.getByRole("button", { name: "ปิด", exact: true }).click();
  await page.waitForTimeout(350);
  log("NPC น้องมีอา (ร้านพิเศษ) และพี่ลูคัส (ถามตอบพิเศษหลังได้แกนชิ้นสุดท้าย): ซื้อสีพิเศษได้ ตอบถูก 4 ข้อได้ 20 เครดิต สมุดเควสแสดงกิจกรรมเสริม 3/4");
  await walkTo(page, "core");
  await act(page);
  await page.getByTestId("certificate").waitFor();
  await page.keyboard.press("Escape");
  assert.equal((await snap(page)).store.overlay, null, "ปิดใบประกาศด้วย Esc ได้");
  await page.waitForTimeout(400);
  // ย้อมสีที่ซื้อมาที่แท่นการ์เดียน: หุ่นที่จอดอยู่เปลี่ยนสีตาม
  await goToHangar(page);
  await walkTo(page, "robot");
  await act(page);
  await page.getByTestId("guardian-bay").waitFor();
  await page.getByTestId("guardian-paint-sakura").click();
  await page.getByTestId("guardian-close").click();
  await page.waitForTimeout(400);
  const bay = (await snap(page)).bay;
  assert.deepEqual([(await snap(page)).store.shop.paint, bay.texture, bay.tint !== null], ["sakura", "gd_plate_sword", true], "หุ่นที่จอดอยู่ย้อมสีซากุระ");
  await backToHall(page);
}

// ---------------------------------------------------------------- แดชบอร์ดผู้สอน

async function playTeacher(page) {
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("ai-trainer-quest-save")));
  await page.goto(new URL("teacher", BASE_URL).href);
  await page.getByTestId("teacher").waitFor();
  assert.equal(await page.locator("canvas").count(), 0, "หน้าแดชบอร์ดไม่โหลดตัวเกม");
  await shot(page, "21-teacher-login");

  // เซิร์ฟเวอร์ dev ยังไม่ได้ตั้ง TEACHER_PASSWORD: ฟังก์ชันจริงต้องปิดไว้ และเสนอให้ดูตัวอย่างจากข้อมูลในเครื่อง
  await page.getByTestId("teacher-password").fill("อะไรก็ได้");
  await page.getByTestId("teacher-login").click();
  const real = await page.getByTestId("teacher-error").innerText();
  if (/TEACHER_PASSWORD/.test(real)) {
    await page.getByTestId("teacher-demo").click();
    assert.match(await page.getByTestId("teacher-notice").innerText(), /ตัวอย่าง/);
    assert.equal(await page.getByTestId("teacher-student").count(), 1);
    assert.equal(await page.getByTestId("teacher-accuracy").innerText(), "83.3%");
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    log("แดชบอร์ด: ฟังก์ชัน /api/teacher จริงปิดไว้เมื่อยังไม่ตั้งรหัสผ่าน และดูตัวอย่างจากข้อมูลในเครื่องได้");
  } else {
    assert.match(real, /รหัสผ่านไม่ถูกต้อง/);
    log("แดชบอร์ด: ฟังก์ชัน /api/teacher จริงปฏิเสธรหัสผ่านที่ผิด");
  }

  // จำลองฐานข้อมูลกลาง: ผู้เรียน 3 คนในห้อง PVC1 (คนหนึ่งคือผู้เล่นที่เพิ่งเล่นจบ) และ 1 คนในห้องอื่น
  const record = (id, name, classCode, data, archived = null) => ({ id, class_code: classCode, display_name: name, data: { ...data, profile: { ...data.profile, name, classCode } }, resume_code: `CODE00000${id}`, created_at: "2026-10-01T02:00:00Z", updated_at: `2026-10-02T0${id}:00:00Z`, archived_at: archived });
  const started = { ...save, posttest: null, battles: {}, rooms: { 1: { ...save.rooms[1], core: false, reviewDone: false, review: null, missed: { [terms[0].term]: 3 }, timeMs: 240000 } } };
  const players = [record(1, "นักทดสอบ", "PVC1", save), record(2, "=เพิ่งเริ่ม", "PVC1", started), record(3, "เริ่มใหม่", "PVC1", started, "2026-10-02T05:00:00Z"), record(4, "ห้องอื่น", "PVC2", started)];
  let deleted = null;
  await page.route("**/api/teacher", async (route) => {
    const body = route.request().postDataJSON();
    if (body.password !== "รหัสครู-2567") return route.fulfill({ status: 401, json: { error: "wrong_password" } });
    if (body.action === "delete-class") {
      deleted = body.classCode;
      return route.fulfill({ json: { deleted: players.filter((p) => p.class_code === body.classCode).length } });
    }
    return route.fulfill({ json: { players: players.filter((p) => p.class_code !== deleted) } });
  });
  await page.getByTestId("teacher-password").fill("ผิด");
  await page.getByTestId("teacher-login").click();
  assert.match(await page.getByTestId("teacher-error").innerText(), /รหัสผ่านไม่ถูกต้อง/);
  await page.getByTestId("teacher-password").fill("รหัสครู-2567");
  await page.getByTestId("teacher-login").click();
  await page.getByTestId("teacher-students").waitFor();

  // ตารางนักเรียน: ไม่รวมข้อมูลเก็บถาวรจนกว่าจะเลือก กรองตามห้องได้
  assert.equal(await page.getByTestId("teacher-student").count(), 3);
  await page.getByTestId("teacher-class").selectOption("PVC1");
  assert.deepEqual(await page.getByTestId("teacher-student").evaluateAll((rows) => rows.map((row) => row.dataset.name)), ["=เพิ่งเริ่ม", "นักทดสอบ"]);
  const done = page.locator('[data-testid="teacher-student"][data-name="นักทดสอบ"]');
  const cells = await done.locator("th, td").allInnerTexts();
  assert.deepEqual(cells.slice(1, 12), ["PVC1", "แมพ 1", "6", "6/6", "14/15", "5/5", "6/6", "83.3%", "1/12", "11/12", "+10"], `แถวของผู้เรียนที่เล่นจบ: ${cells.join(" | ")}`);
  await done.getByTestId("teacher-details").click();
  // รายละเอียด: ผลคำถามทบทวนแบบเลือกตอบรายห้อง (ห้อง 1 ตอบผิดครั้งแรก 1 ข้อ) ไม่มีข้อความที่ผู้เรียนเขียน
  const answers = (await page.getByTestId("teacher-answers").innerText()).replace(/\s+/g, " ");
  assert.match(answers, /ห้อง 1: 5\/6.*ห้อง 2: 6\/6.*ห้อง 3: 6\/6.*ห้อง 4: 6\/6.*ห้อง 5: 6\/6/, `ครูเห็นผลคำถามทบทวนรายห้อง: ${answers}`);
  assert.equal(await page.getByTestId("teacher").locator("textarea").count(), 0);
  await shot(page, "22-teacher-students");
  const cards = await page.getByTestId("teacher-cards").innerText();
  assert.match(cards.replace(/\s+/g, " "), /ผู้เรียน 2 จบครบ 6 ห้อง 1 ก่อนเรียน \(เฉลี่ย\) 1\.0\/12 .* หลังเรียน \(เฉลี่ย\) 11\.0\/12 พัฒนาการ \(เฉลี่ย\) \+10\.0/);

  // สรุปรายห้อง: ชิ้นที่ตอบผิดมากที่สุด เวลาเฉลี่ย จำนวนครั้งที่ใช้ติวเตอร์
  await page.getByTestId("teacher-tab-rooms").click();
  const room1 = await page.getByTestId("teacher-rooms").locator("tbody tr").first().locator("th, td").allInnerTexts();
  assert.deepEqual([room1[1], room1[2]], ["2", "1"], "ห้อง 1: เข้าแล้ว 2 คน ได้แกน 1 คน");
  assert.ok(Number(room1[3]) > 0, "เวลาเฉลี่ยของห้อง 1");
  const missed = await page.getByTestId("teacher-missed").first().innerText();
  assert.ok(missed.includes(terms[0].term) && /\d+ ครั้ง · \d+ คน/.test(missed), `ชิ้นที่ตอบผิดมากที่สุดของห้อง 1: ${missed}`);
  await shot(page, "23-teacher-rooms");

  // ก่อนเรียน–หลังเรียน รายสมรรถนะและรายข้อ
  await page.getByTestId("teacher-tab-gain").click();
  assert.equal(await page.getByTestId("teacher-gain-topics").locator("tbody tr").count(), 7);
  assert.equal(await page.getByTestId("teacher-gain-items").locator("tbody tr").count(), 24);
  const topicRows = await page.getByTestId("teacher-gain-topics").locator("tbody tr").allInnerTexts();
  assert.ok(topicRows[0].includes(course.topics[0].objective), "สมรรถนะมาจาก objective ใน course.json");
  await shot(page, "24-teacher-gain");

  // ส่งออก CSV: มี BOM ภาษาไทยอ่านได้ และข้อความที่ขึ้นต้นเหมือนสูตรถูกทำให้เป็นข้อความ
  const download = async (testId) => {
    const downloading = page.waitForEvent("download");
    await page.getByTestId(testId).click();
    const file = await downloading;
    return { name: file.suggestedFilename(), text: readFileSync(await file.path(), "utf8") };
  };
  const studentsFile = await download("teacher-export-students");
  assert.match(studentsFile.name, /^students-PVC1-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(studentsFile.text.charCodeAt(0), 0xfeff, "CSV ต้องขึ้นต้นด้วย BOM ให้ Excel อ่านภาษาไทยได้");
  const lines = studentsFile.text.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines.some((line) => line.startsWith("PVC1,นักทดสอบ,false,")) && lines.some((line) => line.startsWith("PVC1,'=เพิ่งเริ่ม,false,")), "ชื่อที่ขึ้นต้นด้วย = ต้องไม่ถูก Excel ตีความเป็นสูตร");
  assert.ok(lines.find((line) => line.includes("นักทดสอบ")).includes(",1,6,6,14,5,83.3,true,"), "CSV มีแมพที่อยู่ (1–3) เรื่องที่ถึง แกน ดาว ทบทวน Accuracy ภาคสนาม");
  assert.equal(lines[0].replace("\ufeff", "").split(",")[4], "map");
  const column = lines[0].replace("\ufeff", "").split(",").indexOf("kaiju_defeated");
  assert.equal(lines.find((line) => line.includes("นักทดสอบ")).split(",")[column], "6", "CSV มีจำนวนไคจูที่ปราบได้");
  assert.equal(lines.find((line) => line.includes("นักทดสอบ")).split(",")[lines[0].replace("\ufeff", "").split(",").indexOf("side_activities_done")], "3", "CSV มีจำนวนกิจกรรมเสริมที่ทำ");
  assert.equal(await page.getByTestId("teacher-export-answers").count(), 0, "ไม่มีไฟล์คำตอบแบบพิมพ์แล้ว (เกมไม่มีการเขียนตอบ)");
  assert.doesNotMatch(studentsFile.text, /คำตอบ/);
  assert.equal((await download("teacher-export-items")).text.trim().split("\r\n").length, 25);

  // ลบข้อมูลของห้อง: ต้องพิมพ์รหัสห้องเรียนยืนยัน
  page.once("dialog", (dialog) => dialog.accept("ผิดห้อง"));
  await page.getByTestId("teacher-delete").click();
  assert.equal(deleted, null, "พิมพ์รหัสไม่ตรง: ไม่ลบ");
  page.once("dialog", (dialog) => dialog.accept("pvc1"));
  await page.getByTestId("teacher-delete").click();
  await page.waitForFunction(() => /ลบแล้ว 3 รายการ/.test(document.querySelector('[data-testid="teacher-notice"]')?.textContent ?? ""));
  assert.equal(deleted, "PVC1");
  await page.getByTestId("teacher-tab-students").click();
  assert.deepEqual(await page.getByTestId("teacher-student").evaluateAll((rows) => rows.map((row) => row.dataset.name)), ["ห้องอื่น"]);
  await page.unroute("**/api/teacher");
  log("แดชบอร์ดผู้สอน: รหัสผ่านผิดเข้าไม่ได้ ตารางนักเรียน (แมพ เรื่องที่ถึง แกน ดาว ทบทวน ปราบไคจู Accuracy ก่อน–หลัง) ผลคำถามทบทวนรายห้อง สรุปรายห้อง พัฒนาการรายสมรรถนะและรายข้อ ส่งออก CSV 2 ไฟล์ ลบข้อมูลรายห้องแบบยืนยัน");
}

// ---------------------------------------------------------------- ระดับท้าทาย: ตรวจทั้งรอบ

async function playChallenge(page) {
  // เริ่มเกมใหม่บนเครื่องที่มีความคืบหน้าอยู่: ต้องยืนยัน บอกชื่อเจ้าของ และยกเลิกได้
  await page.goto(BASE_URL);
  await page.getByTestId("menu-new").click();
  const confirm = page.getByTestId("reset-confirm");
  assert.match(await confirm.innerText(), /นักทดสอบ/);
  assert.equal(await page.getByTestId("reset-switch").count(), 0, "เก็บในเครื่องอย่างเดียว: ไม่มีตัวเลือกผู้เล่นใหม่แบบเก็บข้อมูลเดิม");
  await shot(page, "26-reset-confirm");
  await confirm.getByRole("button", { name: "ยกเลิก" }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("ai-trainer-quest-save")).profile.name), "นักทดสอบ", "ยกเลิก: ความคืบหน้ายังอยู่");
  await page.getByTestId("menu-new").click();
  await page.getByTestId("reset-restart").click();
  await page.getByTestId("onboarding").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("ai-trainer-quest-save")), null, "ยืนยันเริ่มใหม่: ลบความคืบหน้าเดิม");
  await onboard(page, { name: "ท้าทาย", topic1Correct: 2, started: true });
  const fresh = (await snap(page)).store;
  assert.deepEqual([fresh.shop.owned, fresh.shop.outfit, fresh.story], [[], "lab", ["prologue"]], "เริ่มใหม่: ร้านค้าและเนื้อเรื่องเริ่มใหม่ด้วย");
  await walkTo(page, "door-1");
  await act(page);
  await inRoom(page, 1);
  await listenAll(page, 1);
  await walkTo(page, "minigame");
  await act(page);
  const game = page.getByTestId("minigame");
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), "challenge", "หัวข้อ 1 ถูก 2/2 ต้องเริ่มที่ระดับท้าทาย");
  assert.equal(await game.getAttribute("data-mode"), "round");
  assert.equal(await page.getByTestId("peek-button").isDisabled(), true, "ระดับท้าทายเปิดอ่านไม่ได้");
  assert.equal(await page.getByTestId("submit-round").isDisabled(), true, "ต้องวางครบทุกช่องก่อนส่ง");

  // วางสลับกัน 2 คู่ อีก 2 คู่ถูก แล้วส่ง: นับผิด 1 ครั้ง คู่ที่ถูกล็อก คู่ที่ผิดกลับถาด
  const order = [terms[1], terms[0], terms[2], terms[3]];
  for (let i = 0; i < terms.length; i++) {
    await card(page, terms[i].term).click();
    await slot(page, order[i].definition).click();
    assert.equal(await slot(page, order[i].definition).getAttribute("data-filled"), "false", "ยังไม่ตรวจจนกว่าจะกดส่ง");
  }
  assert.equal(await page.getByTestId("match-card").count(), 0);
  await page.getByTestId("submit-round").click();
  assert.match(await page.getByTestId("misses").innerText(), /ผิด 1 ครั้ง/);
  assert.equal(await page.locator('[data-testid="match-slot"][data-filled="true"]').count(), 2);
  assert.equal(await page.getByTestId("match-card").count(), 2);
  await solveMinigame(page, 1);
  await page.getByTestId("minigame-finish").click();
  const room = (await snap(page)).store.progress[1];
  assert.deepEqual(room.outcome, { totalMisses: 1, requiredRepair: false });
  assert.equal(room.summary.checks, 2);
  log("ระดับท้าทาย: เปิดอ่านไม่ได้ ตรวจเมื่อกดส่งทั้งรอบ ส่งผิด 1 รอบนับผิด 1 ครั้ง คู่ที่ถูกล็อก คู่ที่ผิดกลับถาด");
}

// ---------------------------------------------------------------- ผู้เรียนที่ตอบผิดมาก: ห้องซ่อมแบบบังคับในห้อง 2–3 และโจทย์คำนวณห้อง 4

/** คำตอบที่ถูกของโจทย์ฝึกในห้องซ่อม คิดจากชุดสำรองใน quests.json และ course.json */
const repairAnswer = (room, cardText, options) => poolAnswer(room, questOf(room).backup, cardText, options);

/** เข้าห้องซ่อมจากปุ่มในมินิเกม ทบทวน แล้วฝึกจนถูก 2 ข้อติดต่อกัน */
async function passRepair(page, room) {
  await page.getByTestId("repair-go").click();
  await page.getByTestId("repair").waitFor();
  await page.getByTestId("repair-to-practice").click();
  for (let guard = 0; guard < 10; guard++) {
    const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
    const options = await page.getByTestId("choice-option").allInnerTexts();
    const right = options.indexOf(repairAnswer(room, cardText, options));
    assert.notEqual(right, -1);
    await page.getByTestId("choice-option").nth(right).click();
    if (await page.getByTestId("repair-back").count()) break;
    await page.getByTestId("repair-next").click();
  }
  await page.getByTestId("repair-back").click();
  assert.equal(await page.getByTestId("repair").count(), 0);
}

/** วางการ์ดคัดแยกใบแรกในถาดลงที่เก็บที่ผิด */
async function missSort(page, room) {
  const { sort } = solutionOf(room);
  const label = await page.getByTestId("sort-card").first().getAttribute("data-label");
  const bins = await page.getByTestId("sort-bin").evaluateAll((els) => els.map((el) => el.dataset.label));
  await page.locator(`[data-testid="sort-card"][data-label=${attr(label)}]`).click();
  await page.locator(`[data-testid="sort-bin"][data-label=${attr(bins.find((bin) => bin !== sort.get(label)))}]`).click();
  return label;
}

async function finishRoomAfterQuest(page, room) {
  await page.getByTestId("minigame-finish").click();
  await page.waitForTimeout(400);
}

async function playStruggle(page) {
  const stations = (room) => topicOf(room).sections.length + (topicOf(room).intro ? 1 : 0);
  const blank = (patch) => ({ stationsSeen: 0, minigameDone: false, stars: 0, outcome: null, summary: null, missed: {}, reviewAnswers: [], reviewDone: false, field: null, core: false, coreAt: null, timeMs: 0, tutor: { ai: 0, hints: 0 }, ...patch });
  const now = new Date().toISOString();
  // ผู้เล่นที่จบห้อง 1 แล้วและฟังสถานีของห้อง 2–4 ครบ: หัวข้อ 2 และ 4 ก่อนเรียนถูก 2/2 (ท้าทาย) หัวข้อ 3 ถูก 0/2 (ประคอง)
  const save = {
    version: 5,
    updatedAt: now,
    story: ["prologue", "room-1"],
    shop: { spent: 0, owned: [], supplies: NO_SUPPLIES, outfit: "lab", paint: "standard" },
    battles: { k1: { won: true, wins: 1, sorties: 1, asked: 5, correct: 5 } },
    profile: { name: "ฝึกหนัก", difficulty: "easy", classCode: "", avatar: "a" },
    pretest: { form: "A", correctByTopic: { 1: 1, 2: 2, 3: 0, 4: 2, 5: 1, 6: 0 }, items: [], completedAt: now },
    posttest: null,
    rooms: {
      1: blank({ stationsSeen: stations(1), minigameDone: true, stars: 2, outcome: { totalMisses: 1, requiredRepair: false }, reviewDone: true, core: true, coreAt: now }),
      2: blank({ stationsSeen: stations(2) }),
      3: blank({ stationsSeen: stations(3) }),
      4: blank({ stationsSeen: stations(4) }),
    },
  };
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  await page.evaluate((data) => localStorage.setItem("ai-trainer-quest-save", JSON.stringify(data)), save);
  await page.reload();
  await page.locator('[data-testid="menu-continue"]:not([disabled])').click();
  await inHall(page);
  await page.waitForTimeout(300);
  await walkTo(page, "door-2");
  await act(page);
  await inRoom(page, 2);

  // --- ห้อง 2 ระดับท้าทาย: คัดแยกแบบส่งทั้งรอบ
  await walkTo(page, "minigame");
  await act(page);
  const game = page.getByTestId("minigame");
  await game.waitFor();
  assert.deepEqual([await game.getAttribute("data-tier"), await game.getAttribute("data-mode")], ["challenge", "round"]);
  const total = await page.getByTestId("sort-card").count();
  for (let round = 1; round <= 2; round++) {
    for (let i = 0; i < total; i++) await missSort(page, 2);
    assert.equal(await page.getByTestId("sort-pending").count(), total, "โหมดส่งทั้งรอบ: การ์ดรอในที่เก็บ ยังไม่ตรวจ");
    if (round === 1) {
      // ดึงการ์ดที่วางไว้กลับถาดได้ก่อนส่ง
      await page.getByTestId("sort-pending").first().click();
      assert.equal(await page.getByTestId("sort-card").count(), 1);
      assert.equal(await page.getByTestId("submit-round").isDisabled(), true);
      await missSort(page, 2);
    }
    if (round === 1) await shot(page, "27-sort-round-pending");
    await page.getByTestId("submit-round").click();
    assert.match(await page.getByTestId("misses").innerText(), new RegExp(`ผิด ${round} ครั้ง`));
    assert.equal(await page.getByTestId("sort-card").count(), total, "ส่งผิดทั้งรอบ: การ์ดทุกใบกลับถาด");
  }
  assert.deepEqual([await game.getAttribute("data-tier"), await game.getAttribute("data-mode")], ["standard", "piece"], "ผิด 2 รอบติดกัน: ลดเป็นระดับปกติ ตรวจทีละชิ้น");
  await page.getByTestId("repair-decline").click();
  assert.equal(await page.getByTestId("repair-prompt").count(), 0);
  await missSort(page, 2);
  await missSort(page, 2);
  assert.equal(await page.getByTestId("repair-prompt").getAttribute("data-required"), "true", "ผิดสะสม 4 ครั้ง: ต้องเข้าห้องซ่อม");
  assert.equal(await page.getByTestId("repair-decline").count(), 0, "ห้องซ่อมแบบบังคับปฏิเสธไม่ได้");
  await shot(page, "28-repair-required");
  await passRepair(page, 2);
  await solveMinigame(page, 2);
  await finishRoomAfterQuest(page, 2);
  let room = (await snap(page)).store.progress[2];
  assert.deepEqual([room.outcome, room.stars, room.summary.repairVisits], [{ totalMisses: 4, requiredRepair: true }, 1, 1]);
  const questions = topicOf(2).reviewQuestions.map((q) => q.question);
  assert.ok(Object.keys(room.missed).every((label) => questions.includes(label)) && Object.values(room.missed).reduce((sum, n) => sum + n, 0) === total * 2 + 2, `ชิ้นที่ผิดของห้อง 2: ${JSON.stringify(room.missed)}`);
  assert.equal((await snap(page)).store.overlay, null);
  await walkTo(page, "review");
  await act(page);
  await answerReview(page, 2);
  await page.getByTestId("review-save").click();
  await page.waitForTimeout(350);
  await takeCore(page, 2);
  log("ห้อง 2 ระดับท้าทาย: คัดแยกแบบส่งทั้งรอบ ผิด 2 รอบลดระดับ ผิดสะสม 4 ครั้งถูกบังคับเข้าห้องซ่อม ผ่านด้วย 1 ดาว บันทึกชิ้นที่ผิด");

  // --- ด่านต่อสู้ที่ 2: ตอบผิดจนการ์เดียนพลังหมด ต้องถอยกลับมาซ่อม ออกใหม่แล้วไคจูเหลือพลังเท่าเดิม จึงชนะได้เสมอ
  await goToHangar(page);
  await startBattle(page, "k2", KAIJU[1]);
  await page.getByTestId("battle-start").click();
  const hit = await battleTurn(page, true);
  const left2 = specOf("k2").forms[0].hp - 1;
  assert.equal(hit.kaiju, left2);
  let lastTurn = hit;
  const music = new Set([await playing(page)]);
  for (let guard = 0; guard < 10 && (await page.getByTestId("battle").getAttribute("data-stage")) === "fight"; guard++) {
    lastTurn = await battleTurn(page, false);
    music.add(await playing(page));
    // พลังเหลือไม่เกิน 2: มีป้ายเตือน และเพลงเร่งขึ้น
    if (lastTurn.robot > 0 && lastTurn.robot <= 2) assert.deepEqual([await page.getByTestId("battle-danger").count(), await playing(page)], [1, "danger:0"]);
  }
  await page.getByTestId("battle-lost").waitFor();
  assert.equal(lastTurn.robot, 0);
  assert.equal(await playing(page), "defeat:0", "แพ้: เพลงเปลี่ยนเป็นเพลงถอยกลับมาซ่อม");
  assert.ok(music.has("battle:0") && music.has("danger:0"), `เพลงของด่านเปลี่ยนตามพลังที่เหลือ: ${[...music]}`);
  assert.match(await page.getByTestId("battle-lost").innerText(), new RegExp(`ไตรฮอร์นยังเหลือพลัง ${left2}`));
  // แพ้และพลังยังไม่ถึงที่แนะนำ: หน้าจอบอกให้เพิ่มอุปกรณ์หรือของใช้ และจัดกระเป๋าสำหรับรอบถัดไปได้
  assert.match(await page.getByTestId("battle-lost-power").innerText(), /ค่าพลังรวมของการ์เดียน 60 · พลังที่แนะนำของด่านนี้ 100/);
  assert.equal(await page.getByTestId("battle-lost").getByTestId("bag-picker").count(), 1);
  await shot(page, "28-battle-lost");
  let record = (await snap(page)).store.battles.k2;
  assert.deepEqual([record.won, record.sorties, record.correct], [false, 1, 1]);
  await page.getByTestId("battle-retry").click();
  assert.deepEqual([await page.getByTestId("hp-left").getAttribute("data-hp"), await page.getByTestId("hp-right").getAttribute("data-hp")], ["6", String(left2)], "ออกปฏิบัติการใหม่: การ์เดียนพลังเต็ม ไคจูเหลือพลังเท่าที่ตีไว้");
  const second = await winBattle(page, "k2");
  assert.deepEqual([second.record.sorties, second.credits], [2, "เครดิตวิจัย +30"], "ชนะในครั้งที่สอง: ไม่ได้โบนัสครั้งแรก");
  await backToHall(page);
  await walkTo(page, "door-3");
  await act(page);
  await inRoom(page, 3);
  log("ด่านต่อสู้ที่ 2 ของผู้เรียนที่ตอบผิดมาก: พลังเหลือน้อยเพลงเร่งขึ้น พลังหมดต้องถอยกลับ (เพลงแพ้) ออกใหม่แล้วไคจูเหลือพลังเท่าเดิม ชนะได้ ได้ 30 เครดิต");

  // --- ห้อง 3: เริ่มที่ระดับประคอง (ก่อนเรียน 0/2 และห้องก่อนถูกบังคับเข้าห้องซ่อม) ถูกบังคับเข้าห้องซ่อมอีกห้อง
  await walkTo(page, "minigame");
  await act(page);
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), "assist");
  for (let i = 0; i < 4; i++) {
    await missSort(page, 3);
    if (await page.getByTestId("repair-decline").count()) await page.getByTestId("repair-decline").click();
  }
  assert.equal(await page.getByTestId("repair-prompt").getAttribute("data-required"), "true");
  await passRepair(page, 3);
  await solveMinigame(page, 3);
  await finishRoomAfterQuest(page, 3);
  assert.deepEqual((await snap(page)).store.progress[3].outcome, { totalMisses: 4, requiredRepair: true });
  assert.equal((await snap(page)).store.overlay, null, "ถูกบังคับเข้าห้องซ่อมสองห้องติดกัน: ไม่มีหน้าต่างเสนออะไรเพิ่ม เล่นต่อได้เลย");
  await walkTo(page, "review");
  await act(page);
  await answerReview(page, 3);
  await page.getByTestId("review-save").click();
  await page.waitForTimeout(350);
  await takeCore(page, 3);
  await clearBattle(page, 3);
  await walkTo(page, "door-4");
  await act(page);
  await inRoom(page, 4);
  log("ห้อง 3: เริ่มระดับประคอง ถูกบังคับเข้าห้องซ่อมเป็นห้องที่ 2 ติดกัน ผ่านแล้วเล่นต่อได้ ชนะไคจูของห้อง");

  // --- ห้อง 4: ก่อนเรียน 2/2 แต่ห้องก่อนถูกบังคับเข้าห้องซ่อม จึงเริ่มระดับปกติ โจทย์คำนวณผิด 1 ครั้ง
  await walkTo(page, "minigame");
  await act(page);
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), "standard");
  for (let guard = 0; guard < 40 && !(await page.getByTestId("accuracy-board").count()); guard++) {
    const label = await page.getByTestId("match-card").first().getAttribute("data-label");
    await card(page, label).click();
    await slot(page, solutionOf(4).match.get(label)).click();
    await page.waitForTimeout(40);
  }
  const input = page.locator('[data-testid="accuracy-input"]:not([disabled])').first();
  await input.fill("999");
  await input.press("Enter");
  assert.equal(await page.getByTestId("feedback").getAttribute("data-state"), "wrong");
  await input.fill("  ");
  assert.equal(await page.getByTestId("accuracy-check").isDisabled(), true, "ช่องว่าง: ตรวจไม่ได้");
  await solveMinigame(page, 4);
  await finishRoomAfterQuest(page, 4);
  room = (await snap(page)).store.progress[4];
  assert.deepEqual([room.outcome, room.stars], [{ totalMisses: 1, requiredRepair: false }, 2]);
  assert.deepEqual(room.missed, { [topicOf(4).reviewQuestions[questOf(4).minigames.find((g) => g.kind === "accuracy").question].question]: 1 }, "ชิ้นที่ผิดของโจทย์คำนวณคือตัวโจทย์จาก course.json");
  log("ห้อง 4: เริ่มระดับปกติ (ลดจากท้าทายเพราะห้องก่อนถูกบังคับเข้าห้องซ่อม) โจทย์คำนวณผิด 1 ครั้งได้ 2 ดาว บันทึกโจทย์ที่ผิด");
}

// ---------------------------------------------------------------- ตัวช่วยของชุดแมพ 2 และแมพ 3 (GDD ข้อ 15)

/** เปิดเกมใหม่บนเครื่องที่ไม่มีข้อมูล */
async function freshStart(page) {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
}

/** เปิดเกมด้วยข้อมูลบันทึกที่กำหนด แล้วกดเล่นต่อ */
async function resumeWith(page, save) {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  await page.evaluate((data) => {
    sessionStorage.clear();
    localStorage.setItem("ai-trainer-quest-save", JSON.stringify(data));
  }, save);
  await page.reload();
  await page.locator('[data-testid="menu-continue"]:not([disabled])').click();
  await inHall(page);
  await page.waitForTimeout(300);
}

/** ทำภารกิจภาคสนามให้ครบแบบสั้น (รายละเอียดของฟอร์มตรวจในชุดระดับง่ายแล้ว) */
async function completeField(page) {
  await walkTo(page, "field");
  await act(page);
  await page.getByTestId("field").waitFor();
  await page.getByTestId("field-ready").check();
  for (let i = 0; i < course.finalQuest.steps.length; i++) await page.getByTestId("field-step").nth(i).check();
  for (const [i, [images, correct]] of [[30, 9], [30, 10], [30, 8]].entries()) {
    await page.getByTestId("field-images").nth(i).fill(String(images));
    await page.getByTestId("field-correct").nth(i).fill(String(correct));
  }
  const notes = page.getByTestId("field-note");
  for (let i = 0; i < (await notes.count()); i++) await notes.nth(i).check();
  await page.getByTestId("field-attach").setInputFiles(new URL("../public/assets/cores/core_6.png", import.meta.url).pathname);
  await page.getByTestId("field-evidence-image").waitFor();
  assert.equal(await page.getByTestId("field-status").getAttribute("data-complete"), "true");
  await page.getByTestId("field-close").click();
  await page.waitForTimeout(300);
}

/**
 * ใช้ชิปวิเคราะห์กับโจทย์ข้อแรกที่มีตัวเลือกพอ (ตัดตัวเลือกที่ผิดออก 1 ข้อ) แล้วตอบถูก ข้อที่ใช้ไม่ได้ให้ตอบถูกไปก่อน คืนจำนวนตาที่ใช้
 * โจทย์สองตัวเลือกใช้ชิปไม่ได้ ถ้าคู่ต่อสู้เหลือพลังน้อยจนเจอแต่โจทย์แบบนั้น (ด่านใกล้จบ) คืน null
 */
async function useAnalyzer(page) {
  for (let turns = 1; turns <= 12; turns++) {
    const button = page.getByTestId("battle-supply-analyzer");
    if (Number(await page.getByTestId("hp-right").getAttribute("data-hp")) <= 2) return null;
    if (await button.isEnabled()) {
      const source = Number(await page.getByTestId("battle").getAttribute("data-source"));
      const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
      const options = await page.getByTestId("choice-option").allInnerTexts();
      await button.click();
      const removed = page.locator('[data-testid="choice-option"][data-removed]');
      assert.equal(await removed.count(), 1, "ชิปวิเคราะห์ตัดตัวเลือกออก 1 ข้อ");
      assert.equal(await removed.isDisabled(), true);
      assert.notEqual(await removed.innerText(), poolAnswer(source, battlePools(source), cardText, options), "ตัวเลือกที่ถูกตัดต้องเป็นข้อที่ผิด");
      assert.match(await page.getByTestId("battle-log").innerText(), /ชิปวิเคราะห์ตัดตัวเลือกที่ผิดออก 1 ข้อ/);
      await battleTurn(page, true);
      return turns;
    }
    await battleTurn(page, true);
  }
  throw new Error("ไม่มีโจทย์ที่ใช้ชิปวิเคราะห์ได้ใน 12 ตา");
}

/** จุดโต้ตอบหลักของห้อง (ไม่รวม NPC และของในเควสเสริม) */
const roomIds = async (page) => (await snap(page)).interactables.map((i) => i.id).filter((id) => !/^(npc|pickup)-/.test(id)).sort();
const npcIds = async (page) => (await snap(page)).interactables.map((i) => i.id).filter((id) => id.startsWith("npc-")).map((id) => id.slice(4)).sort();

// ---------------------------------------------------------------- แมพ 2 และแมพ 3: ข้อมูลบันทึกตั้งต้น (รุ่น 9)

const NOW = new Date().toISOString();
const WON = { won: true, wins: 1, sorties: 1, asked: 6, correct: 6 };
const KAIJU2 = { n1: "โวลต์อีล", n2: "ไอรอนเชลล์", n3: "ฝูงสติงเกอร์", "omega-n": "โอเมก้า" };
const BOSS_FORMS = { boss_2: "โอเมก้า ร่างคลั่ง", boss_3: "โอเมก้า ร่างสมบูรณ์", boss_4: "โอเมก้า ร่างจักรพรรดิ" };
/** หัวข้อที่ผ่านแล้ว (ได้แกน AI) ของแมพหนึ่ง: แมพ 1 มีคำถามทบทวน แมพอื่นใช้รูปเดียวกัน */
const doneRoom = (topic) => ({ stationsSeen: 0, minigameDone: topic < 6, stars: topic < 6 ? 3 : 0, outcome: null, summary: null, missed: {}, review: topic < 6 ? { correct: 6, total: 6 } : null, reviewDone: topic < 6, field: null, core: true, coreAt: NOW, timeMs: 1000, tutor: { ai: 0, hints: 0 } });
const doneRooms = (topics) => Object.fromEntries(topics.map((topic) => [topic, doneRoom(topic)]));
const assessmentOf = (form) => ({ form, correctByTopic: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, items: [], completedAt: NOW });
const wonAll = (map) => Object.fromEntries(CAMPAIGN[map].battles.map((battle) => [battle.id, WON]));
const shopOf = (patch = {}) => ({ spent: 0, owned: [], supplies: NO_SUPPLIES, outfit: "lab", paint: "standard", bit: "classic", modules: [], weapon: "fist", armor: "plate", chip: "none", loadout: [], bought: {}, decor: STARTER_DECOR, layout: {}, theme: {}, ...patch });
const MAP1_STORY = ["prologue", "room-1", "room-2", "room-3", "room-4", "room-5", "room-6", "win-k1", "win-k2", "win-k3", "win-k4", "win-k5", "ending"];
/** ผู้เล่นที่ผ่านแมพ 1 ครบแล้ว (ชนะไคจูทุกตัว ทำแบบทดสอบหลังเรียนแล้ว) ยังอยู่ที่แมพ 1 */
const travelerSave = (patch = {}) => ({
  version: 9,
  updatedAt: NOW,
  profile: { name: "นักเดินทาง", difficulty: "easy", classCode: "", avatar: "a" },
  pretest: assessmentOf("A"),
  posttest: assessmentOf("B"),
  rooms: doneRooms([1, 2, 3, 4, 5, 6]),
  maps: { normal: {}, hard: {} },
  battles: wonAll("easy"),
  npcs: {},
  story: MAP1_STORY,
  shop: shopOf(),
  ...patch,
});
const creditsOf = async (page) => Number(await page.getByTestId("credits").getAttribute("data-credits"));
const doorCount = async (page) => (await snap(page)).interactables.filter((i) => i.id.startsWith("door-")).length;
/** สถานะของทุกแมพบนกระดานแผนที่ เช่น { easy: ["here", "true"], normal: ["open", "false"], hard: ["locked", "false"] } */
const travelStatus = (page) => page.locator('[data-testid="travel"] li').evaluateAll((rows) => Object.fromEntries(rows.map((row) => [row.dataset.testid.replace("travel-", ""), [row.dataset.status, row.dataset.cleared]])));

/** จุดบนจอของช่องในผัง (กระดานตกแต่ง): กลางช่อง หรือเลื่อนไปทางซ้าย dx ช่อง (0 = ขอบซ้ายของช่อง) */
async function cellPoint(page, col, row, dx = 0.5) {
  const box = await page.getByTestId("decor-grid").boundingBox();
  const cell = box.width / 20;
  return { x: box.x + (col + dx) * cell, y: box.y + (row + 0.5) * cell };
}
async function clickCell(page, col, row) {
  const point = await cellPoint(page, col, row);
  await page.mouse.click(point.x, point.y);
}
/** เลื่อนกรอบเลือกของกระดานตกแต่งด้วยปุ่มลูกศรไปที่ช่อง */
async function moveCursor(page, col, row) {
  for (let guard = 0; guard < 40; guard++) {
    const [c, r] = (await page.getByTestId("decor-grid").getAttribute("data-cursor")).split(",").map(Number);
    if (c === col && r === row) return;
    await page.keyboard.press(c < col ? "ArrowRight" : c > col ? "ArrowLeft" : r < row ? "ArrowDown" : "ArrowUp");
  }
  throw new Error(`เลื่อนกรอบไปที่ ${col},${row} ไม่ได้`);
}
const decorPlaced = async (page) => (await page.getByTestId("decor").getAttribute("data-placed")).split(";").filter(Boolean).sort();

/** เดินไปที่กระดานแผนที่แล้วเปิด */
async function openTravel(page) {
  await walkTo(page, "travel");
  assert.match((await snap(page)).store.prompt, /กระดานแผนที่การเดินทาง/);
  await act(page);
  await page.getByTestId("travel").waitFor();
}

/** เดินทางไปแมพที่เปิดแล้วจากกระดานแผนที่ รอจนโถงของแมพนั้นพร้อม คืนฉากเนื้อเรื่องตอนมาถึง (มาครั้งแรกเท่านั้น) */
async function travelTo(page, map, doors) {
  await openTravel(page);
  await page.getByTestId(`travel-go-${map}`).click();
  await page.waitForFunction((name) => window.__aitq.snapshot().store.profile.difficulty === name && window.__aitq.snapshot().store.screen === "hall", map);
  const story = await readStory(page);
  await page.waitForFunction((n) => window.__aitq.snapshot().scene === "Hall" && window.__aitq.snapshot().interactables.filter((i) => i.id.startsWith("door-")).length === n, doors);
  await page.waitForTimeout(400);
  assert.match(await page.getByTestId("hud-map").innerText(), new RegExp(`แมพ ${["easy", "normal", "hard"].indexOf(map) + 1}`));
  return story;
}

// ---------------------------------------------------------------- แมพ 2: ศูนย์วิจัยภาคสนาม (GDD ข้อ 15, 16, 17, 19)

async function playNormal(page) {
  // --- จบแมพ 1 แล้ว: ร้านเปิดขายของของแมพ 2 ตกแต่งโถงได้ และกระดานแผนที่เปิดเส้นทางไปแมพ 2
  await resumeWith(page, travelerSave());
  assert.equal(await doorCount(page), 6);
  assert.match(await page.getByTestId("objective").innerText(), /ชนะไคจูของแมพนี้ครบแล้ว ไปที่กระดานแผนที่เพื่อเดินทางไปแมพ 2/);
  const start = await creditsOf(page);
  await walkTo(page, "shop");
  await act(page);
  await page.getByTestId("shop").waitFor();
  assert.deepEqual([await page.getByTestId("shop-item-weapon-hammer").getAttribute("data-locked"), await page.getByTestId("shop-item-weapon-cannon").getAttribute("data-locked")], ["false", "true"], "ชนะไคจูของแมพ 1 ครบ: ของของแมพ 2 วางขาย ของแมพ 3 ยังล็อก");
  assert.match(await page.getByTestId("shop-locked-weapon-cannon").innerText(), /วางขายที่แมพ 3/);
  assert.equal(await page.locator('[data-testid^="shop-item-decor-"]').count(), 22, "ร้านแสดงของตกแต่งห้อง 22 ชิ้น (ของเริ่มต้น 2 ชิ้น และของที่ซื้อได้ 20 ชิ้น)");
  assert.deepEqual(await page.locator('[data-testid^="shop-item-decor-"][data-locked="true"]').evaluateAll((rows) => rows.map((row) => row.dataset.testid.replace("shop-item-decor-", "")).sort()), ["fountain", "statue"]);
  assert.equal(await page.locator('[data-testid^="shop-item-theme-"]').count(), 6, "ร้านขายธีมสีของห้อง 6 แบบ");
  assert.deepEqual(await page.locator('[data-testid^="shop-item-theme-"][data-locked="true"]').evaluateAll((rows) => rows.map((row) => row.dataset.testid.replace("shop-item-theme-", ""))), ["midnight"]);
  await page.getByTestId("shop-buy-decor-sofa").click();
  await page.getByTestId("shop-buy-decor-neon").click();
  assert.equal(await page.getByTestId("shop-balance").getAttribute("data-balance"), String(start - 120), "โซฟา 60 + ป้ายนีออน 60");
  assert.equal(await page.getByTestId("shop-item-decor-sofa").getAttribute("data-owned"), "true");
  await shot(page, "35-shop-decor");

  // --- กระดานตกแต่ง: ลากวางของตกแต่งบนฉากจริงได้อิสระ ไม่มีช่องที่กำหนด จำกัดจำนวนต่อห้อง ไม่บังจุดใช้งาน
  await page.getByTestId("shop-open-decor").click();
  const decor = page.getByTestId("decor");
  await decor.waitFor();
  await page.getByTestId("decor-grid").waitFor();
  assert.deepEqual([await decor.getAttribute("data-map"), await decor.getAttribute("data-room"), await decor.getAttribute("data-count"), await decor.getAttribute("data-limit")], ["easy", "hall", "2", "8"]);
  assert.deepEqual(await decorPlaced(page), ["plant@1,5", "window@3,1"], "โถงของแมพ 1 เริ่มด้วยหน้าต่างและกระถางต้นไม้");
  // แตะของแล้วแตะจุดที่ต้องการ
  await page.getByTestId("decor-pick-sofa").click();
  assert.equal(await decor.getAttribute("data-held"), "sofa");
  await clickCell(page, 12, 5);
  assert.deepEqual(await decorPlaced(page), ["plant@1,5", "sofa@12,5", "window@3,1"]);
  assert.match(await page.getByTestId("decor-notice").innerText(), /วางโซฟา.*3\/8/);
  // ของที่วางแล้วเห็นในฉากทันทีและกันทางเดิน
  let scene = await snap(page);
  assert.deepEqual(scene.decor.find((d) => d.prop === "pr_decor_sofa"), { prop: "pr_decor_sofa", col: 12, row: 5, solid: true });
  assert.ok(scene.map.blocked.includes("12,5") && scene.map.blocked.includes("13,5"));
  // ของติดผนัง: ทับประตูโรงเก็บหุ่นไม่ได้ วางบนผนังที่ว่างได้
  await page.getByTestId("decor-pick-neon").click();
  await clickCell(page, 9, 1);
  assert.match(await page.getByTestId("decor-notice").innerText(), /ของติดผนังต้องวางบนผนังด้านบนตรงที่ว่าง/);
  assert.equal(await decor.getAttribute("data-held"), "neon", "วางไม่ได้: ยังถือของชิ้นนั้นอยู่");
  await clickCell(page, 12, 1);
  assert.ok((await decorPlaced(page)).includes("neon@12,1"));
  // จุดยืนหน้าประตูวางไม่ได้
  await page.getByTestId("decor-pick-plant").click();
  await clickCell(page, 2, 2);
  assert.match(await page.getByTestId("decor-notice").innerText(), /จุดยืนหน้าประตูหรือจุดใช้งาน/);
  await page.getByTestId("decor-pick-plant").click();
  assert.equal(await decor.getAttribute("data-held"), "");
  // ลากของที่วางอยู่ไปที่ใหม่ (โซฟากว้าง 2 ช่อง: จับตรงกลางแล้วปล่อยกลางช่อง 15–16)
  const from = await cellPoint(page, 13, 5, 0);
  const to = await cellPoint(page, 16, 6, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  assert.equal(await decor.getAttribute("data-held"), "sofa", "ลากของที่วางอยู่: ถือชิ้นนั้น");
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  assert.ok((await decorPlaced(page)).includes("sofa@15,6"), `ลากโซฟาไปวางที่ใหม่: ${await decorPlaced(page)}`);
  // ลากจากแถบของตกแต่งไปวางบนฉาก
  const chip = await page.getByTestId("decor-pick-plant").boundingBox();
  const spot = await cellPoint(page, 6, 4);
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.mouse.move(spot.x, spot.y, { steps: 6 });
  await page.mouse.up();
  assert.ok((await decorPlaced(page)).includes("plant@6,4"), `ลากกระถางจากแถบไปวาง: ${await decorPlaced(page)}`);
  await shot(page, "35-decor-board");
  // คีย์บอร์ด: เลื่อนกรอบไปที่กระถาง Enter หยิบ เลื่อน 2 ช่อง Enter วาง แล้ว Delete เอาออก
  await page.getByTestId("decor-grid").focus();
  await moveCursor(page, 6, 4);
  await page.keyboard.press("Enter");
  assert.equal(await decor.getAttribute("data-held"), "plant");
  await moveCursor(page, 8, 4);
  await page.keyboard.press("Enter");
  assert.ok((await decorPlaced(page)).includes("plant@8,4"));
  await page.keyboard.press("Delete");
  assert.deepEqual(await decorPlaced(page), ["neon@12,1", "sofa@15,6", "window@3,1"], "Delete เอาของในกรอบออก");
  assert.match(await page.getByTestId("decor-count").innerText(), /3\/8/);
  // ย้ายแถบของขึ้นบนได้เมื่อบังจุดที่อยากวาง
  await page.getByTestId("decor-flip").click();
  assert.equal(await page.getByTestId("decor-panel").getAttribute("data-top"), "true");
  await page.getByTestId("decor-close").click();
  await page.waitForTimeout(400);
  assert.deepEqual((await snap(page)).store.shop.decor["easy:hall"], [{ decor: "window", col: 3, row: 1 }, { decor: "neon", col: 12, row: 1 }, { decor: "sofa", col: 15, row: 6 }]);
  await shot(page, "35-hall-decorated");
  await walkTo(page, "decorboard");
  assert.match((await snap(page)).store.prompt, /กระดานตกแต่งห้อง/);
  await act(page);
  await decor.waitFor();

  // --- ย้ายจุดใช้งานเริ่มต้นของห้องได้เอง: ปุ่มปรับแต่งอยู่ที่หัวของแถบจัดวาง
  const layoutOf = async () => Object.fromEntries((await decor.getAttribute("data-layout")).split(";").map((entry) => entry.split("@")));
  const spotOf = async (id) => (await snap(page)).interactables.filter((i) => i.id === id).map((i) => Math.round(i.x))[0];
  assert.equal(await decor.getAttribute("data-mode"), "decor");
  await page.getByTestId("decor-mode-station").click();
  assert.equal(await decor.getAttribute("data-mode"), "station");
  assert.deepEqual(await layoutOf(), { shop: "2,8", storage: "5,8", travel: "8,8", decorboard: "11,8" });
  assert.equal(await page.getByTestId("decor-panel").getAttribute("data-top"), "true", "จุดใช้งานของโถงอยู่แถวล่าง: แถบเลื่อนขึ้นบนเองไม่ให้บัง");
  assert.equal(await page.getByTestId("station-reset").isDisabled(), true);
  assert.equal(await page.locator('[data-testid^="station-pick-"]').count(), 4, "โถง: ร้าน กล่องเก็บไอเทม กระดานแผนที่ กระดานตกแต่ง (ประตูย้ายไม่ได้)");
  // แตะชื่อจุดแล้วแตะช่อง: ทับของอื่นไม่ได้ และหน้าจุดต้องมีที่ยืน (โซฟาอยู่ที่ช่อง 15–16 แถว 6)
  await page.getByTestId("station-pick-shop").click();
  assert.equal(await decor.getAttribute("data-held"), "shop");
  await clickCell(page, 5, 8);
  assert.match(await page.getByTestId("decor-notice").innerText(), /ต้องเป็นพื้นที่ว่างและไม่ทับของชิ้นอื่น/);
  await clickCell(page, 15, 5);
  assert.match(await page.getByTestId("decor-notice").innerText(), /บังจุดยืนหน้าประตูหรือจุดใช้งานอื่น/);
  assert.equal((await layoutOf()).shop, "2,8", "ย้ายไม่ได้: ร้านอยู่ที่เดิม และยังถืออยู่");
  assert.equal(await decor.getAttribute("data-held"), "shop");
  await clickCell(page, 6, 5);
  assert.match(await page.getByTestId("decor-notice").innerText(), /ย้ายร้านสหกรณ์แล็บแล้ว/);
  assert.equal((await layoutOf()).shop, "6,5");
  await page.waitForTimeout(500);
  assert.equal(await spotOf("shop"), 224, "ร้านในฉากย้ายไปที่ใหม่ทันที");
  let blocked = (await snap(page)).map.blocked;
  assert.deepEqual([blocked.includes("6,5"), blocked.includes("7,5"), blocked.includes("2,8")], [true, true, false], "ตัวกันชนย้ายตามร้าน ที่เดิมเดินผ่านได้");
  // ลากจุดใช้งานบนฉาก: กล่องเก็บไอเทม (ช่อง 5–6 แถว 8) ไปช่อง 9–10 แถว 6
  const boxFrom = await cellPoint(page, 6, 8, 0);
  const boxTo = await cellPoint(page, 10, 6, 0);
  await page.mouse.move(boxFrom.x, boxFrom.y);
  await page.mouse.down();
  await page.mouse.move((boxFrom.x + boxTo.x) / 2, (boxFrom.y + boxTo.y) / 2, { steps: 4 });
  assert.equal(await decor.getAttribute("data-held"), "storage", "ลากจุดใช้งานบนฉาก: ถือจุดนั้น");
  await page.mouse.move(boxTo.x, boxTo.y, { steps: 4 });
  await page.mouse.up();
  assert.equal((await layoutOf()).storage, "9,6", `ลากกล่องเก็บไอเทมไปวางที่ใหม่: ${await decor.getAttribute("data-layout")}`);
  // คีย์บอร์ด: เลื่อนกรอบไปที่กระดานแผนที่ Enter หยิบ เลื่อนไปช่องใหม่ Enter วาง
  await page.getByTestId("decor-grid").focus();
  await moveCursor(page, 8, 8);
  await page.keyboard.press("Enter");
  assert.equal(await decor.getAttribute("data-held"), "travel");
  await moveCursor(page, 16, 8);
  await page.keyboard.press("Enter");
  assert.equal((await layoutOf()).travel, "16,8");
  await shot(page, "35-station-board");
  // ของตกแต่งตรวจกับผังที่ย้ายแล้ว: ที่เดิมของร้านวางของได้
  await page.getByTestId("decor-mode-decor").click();
  await page.getByTestId("decor-pick-plant").click();
  await clickCell(page, 2, 8);
  assert.ok((await decorPlaced(page)).includes("plant@2,8"), "ที่เดิมของร้านว่างแล้ว วางของตกแต่งได้");
  // ธีมสี: ยังไม่ได้ซื้อ มีแต่ธีมเดิมของแมพ
  await page.getByTestId("decor-mode-theme").click();
  assert.deepEqual([await page.locator('[data-testid^="theme-pick-"]').count(), await page.getByTestId("theme-pick-default").getAttribute("aria-pressed"), await decor.getAttribute("data-theme")], [1, "true", "default"]);
  assert.match(await page.getByTestId("decor-panel").innerText(), /ซื้อธีมสีได้ที่ร้านสหกรณ์แล็บ/);
  await shot(page, "35-theme-board");
  await page.getByTestId("decor-close").click();
  await page.waitForTimeout(400);
  assert.deepEqual((await snap(page)).store.shop.layout, { "easy:hall": { shop: { col: 6, row: 5 }, storage: { col: 9, row: 6 }, travel: { col: 16, row: 8 } } });
  // เดินไปใช้ร้านที่ย้ายแล้วได้ตามปกติ
  await walkTo(page, "shop");
  assert.match((await snap(page)).store.prompt, /ร้านสหกรณ์แล็บ/);
  await act(page);
  await page.getByTestId("shop").waitFor();
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(350);
  await shot(page, "35-hall-rearranged");
  // คืนตำแหน่งเริ่มต้น: ทุกจุดกลับที่เดิม กระถางที่ทับที่เดิมของร้านถูกเก็บออก
  await walkTo(page, "decorboard");
  await act(page);
  await decor.waitFor();
  await page.getByTestId("decor-mode-station").click();
  await page.getByTestId("station-reset").click();
  assert.match(await page.getByTestId("decor-notice").innerText(), /คืนทุกจุดไปตำแหน่งเริ่มต้นแล้ว/);
  assert.deepEqual(await layoutOf(), { shop: "2,8", storage: "5,8", travel: "8,8", decorboard: "11,8" });
  assert.ok(!(await decorPlaced(page)).includes("plant@2,8"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  assert.deepEqual([(await snap(page)).store.shop.layout, await spotOf("shop")], [{}, 96]);
  log("ย้ายจุดใช้งาน: ร้าน กล่องเก็บไอเทม และกระดานแผนที่ย้ายได้ด้วยการแตะ ลาก หรือคีย์บอร์ด ทับของอื่นหรือบังจุดยืนไม่ได้ ฉากและทางเดินเปลี่ยนตามทันที คืนตำแหน่งเริ่มต้นได้");
  // โรงเก็บหุ่นตกแต่งได้เหมือนโถง แยกกัน จำกัด 6 ชิ้น
  await goToHangar(page);
  await walkTo(page, "decorboard");
  await act(page);
  await decor.waitFor();
  await page.getByTestId("decor-grid").waitFor();
  assert.deepEqual([await decor.getAttribute("data-room"), await decor.getAttribute("data-count"), await decor.getAttribute("data-limit")], ["hangar", "0", "6"]);
  await page.getByTestId("decor-pick-sofa").click();
  await clickCell(page, 15, 6);
  assert.deepEqual(await decorPlaced(page), ["sofa@15,6"]);
  await shot(page, "35-hangar-decorated");
  await page.getByTestId("decor-close").click();
  await page.waitForTimeout(350);
  assert.deepEqual((await snap(page)).decor.map((d) => d.prop), ["pr_decor_sofa"]);
  await backToHall(page);
  log("ตกแต่งห้อง: ลากวางของตกแต่งบนฉากจริงได้อิสระ (แตะวาง ลากย้าย ลากจากแถบ คีย์บอร์ด) ของติดผนังเกาะผนังที่ว่าง จุดยืนหน้าประตูวางไม่ได้ จำกัด 8 ชิ้นในโถง 6 ชิ้นในโรงเก็บหุ่น ตกแต่งแยกกันทุกห้อง");

  // --- กระดานแผนที่: แมพ 2 เปิดแล้ว แมพ 3 ยังล็อก เดินทางไปแมพ 2
  await openTravel(page);
  assert.deepEqual(await travelStatus(page), { easy: ["here", "true"], normal: ["open", "false"], hard: ["locked", "false"] });
  assert.match(await page.getByTestId("travel-hard").innerText(), /ต้องชนะไคจูของแมพ 2: ศูนย์วิจัยภาคสนามให้ครบก่อน/);
  assert.equal(await page.getByTestId("travel-go-hard").count(), 0, "แมพที่ยังล็อกเดินทางไปไม่ได้");
  await shot(page, "35-travel");
  await page.getByTestId("travel-close").click();
  await page.waitForTimeout(350);
  const arrival = await travelTo(page, "normal", 3);
  assert.deepEqual([arrival?.beat, arrival.art], ["map-normal", ["st_map2", "st_npc_sage_1", "st_kaiju_7"]], "มาถึงแมพ 2 ครั้งแรก: เห็นฉากเนื้อเรื่องของแมพ");
  assert.match(await page.getByTestId("cores").innerText(), /0\/5/, "แกน AI ของแมพ 2 ต้องเก็บใหม่ 5 ชิ้น (เรื่องที่ 1–5)");
  assert.equal(await creditsOf(page), start - 120, "เครดิต อุปกรณ์ และของใช้ใช้ร่วมกันทุกแมพ");
  let state = (await snap(page)).store;
  assert.deepEqual([state.profile.difficulty, state.progress, state.posttest.form], ["normal", {}, "B"], "ความคืบหน้าของแมพ 2 เริ่มใหม่ ผลการเรียนของแมพ 1 ยังอยู่");
  await assertCanvasFits(page, "โถงของแมพ 2");
  await shot(page, "30-normal-hall");

  // --- ของใช้มีจำนวนจำกัดต่อแมพ: ร้านของแมพ 2 มีของชุดใหม่ ซื้อหมดแล้วซื้อเพิ่มไม่ได้
  await walkTo(page, "shop");
  await act(page);
  await page.getByTestId("shop").waitFor();
  const stockOf = () => page.locator('[data-testid^="shop-item-supply-"]').evaluateAll((rows) => rows.map((row) => Number(row.dataset.stock)));
  assert.deepEqual(await stockOf(), [3, 3, 2, 2, 1]);
  await page.getByTestId("shop-buy-supply-overcharge").click();
  await page.getByTestId("shop-buy-supply-overcharge").click();
  assert.deepEqual(await stockOf(), [3, 3, 0, 2, 1]);
  assert.equal(await page.getByTestId("shop-buy-supply-overcharge").isDisabled(), true, "ของใช้ของแมพนี้หมดแล้ว: ซื้อเพิ่มไม่ได้");
  assert.match(await page.getByTestId("shop-item-supply-overcharge").innerText(), /ร้านของแมพนี้ขายหมดแล้ว/);
  assert.deepEqual((await snap(page)).store.shop.bought, { "normal:overcharge": 2 });
  await shot(page, "30-normal-shop");
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(350);

  // --- กลับไปแมพ 1 ได้เสมอ ความคืบหน้าของแต่ละแมพเก็บแยกกัน กลับมาแมพ 2 ไม่มีฉากมาถึงซ้ำ
  assert.equal(await travelTo(page, "easy", 6), null);
  assert.match(await page.getByTestId("cores").innerText(), /6\/6/);
  assert.equal((await snap(page)).store.progress[6].core, true);
  await openTravel(page);
  assert.deepEqual(await travelStatus(page), { easy: ["here", "true"], normal: ["open", "false"], hard: ["locked", "false"] });
  await page.getByTestId("travel-close").click();
  await page.waitForTimeout(350);
  assert.equal(await travelTo(page, "normal", 3), null, "ฉากมาถึงแมพแสดงครั้งเดียว");
  log("เดินทางข้ามแมพ: ชนะไคจูของแมพ 1 ครบแล้วแมพ 2 เปิด (แมพ 3 ยังล็อก) มาถึงครั้งแรกมีฉากเนื้อเรื่อง ความคืบหน้าแยกรายแมพ เครดิตและของใช้ร่วมกัน ของใช้ในร้านมีจำกัดต่อแมพ กลับแมพ 1 ได้เสมอ");

  // --- ห้อง 1 ของแมพ 2: สองเรื่องในห้องเดียว คลังความรู้อ่านได้แต่ไม่บังคับ
  await walkTo(page, "door-2");
  await act(page);
  assert.match((await snap(page)).store.toast, /ห้อง 2 ยังล็อก ต้องพาการ์เดียนไปชนะโวลต์อีลก่อน/, "แมพ 2: ห้องเปิดด้วยการชนะไคจูอย่างเดียว ไม่ต้องมีแกน AI");
  await walkTo(page, "door-1");
  assert.match((await snap(page)).store.prompt, /เข้าห้อง 1: เรื่องที่ 1–2/);
  await act(page);
  const briefing = await inRoom(page, 1);
  assert.deepEqual([briefing?.beat, briefing.art], ["zone-n1", ["st_kaiju_7"]]);
  assert.deepEqual(await npcIds(page), ["sage", "smith"], "แมพ 2 ห้อง 1: NPC ชุดใหม่ของแมพนี้");
  assert.deepEqual(await roomIds(page), ["archive-t1", "archive-t2", "core-t1", "core-t2", "door-entry", "minigame-t1", "minigame-t2", "review-t1", "review-t2"], "แมพ 2 ห้อง 1: สองหัวข้อ แต่ละหัวข้อมีคลังความรู้ เครื่องฝึก โต๊ะ และแท่น ไม่มีสถานี");
  await assertCanvasFits(page, "แมพ 2 ห้อง 1");
  await shot(page, "30-normal-room");
  assert.match(await page.getByTestId("hud-topic").innerText(), new RegExp(`เรื่องที่ 1: ${topic1.title}`));
  assert.match(await page.getByTestId("objective").innerText(), /เครื่องฝึกของเรื่องที่ 1.*อ่านคลังความรู้ก่อนได้/);

  // ถามตอบของดร.ไอรีนใช้โจทย์ของสองเรื่อง จึงล็อกจนกว่าจะได้แกน AI ของทั้งสองเรื่องในแมพนี้
  const sageStory = await talkTo(page, "sage");
  assert.equal(await page.getByTestId("npc-quiz").getAttribute("data-stage"), "locked");
  await page.getByTestId("npc-close").click();
  await page.waitForTimeout(350);

  // เนื้อหาต่อยอดกัน: หัวข้อ 2 ของห้องยังทำไม่ได้จนกว่าจะได้แกนชิ้นที่ 1
  await walkTo(page, "minigame-t2");
  await act(page);
  assert.match((await snap(page)).store.toast, /ต้องได้แกน AI ชิ้นที่ 1 ก่อน/);
  assert.equal((await snap(page)).store.overlay, null);

  // ตัวช่วยน้อยลง: ถามติวเตอร์ได้ 4 ครั้งต่อรอบ
  await page.getByTestId("hud-tutor").click();
  assert.equal(await page.getByTestId("tutor-remaining").getAttribute("data-limit"), "4");
  assert.match(await page.getByTestId("tutor-remaining").innerText(), /ถามได้อีก 4 ครั้ง/);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // คลังความรู้: บทสอนทั้งหัวข้อต่อกัน เปิดอ่านได้โดยไม่บังคับ ข้อความเดิมจาก course.json
  await walkTo(page, "archive-t1");
  assert.match((await snap(page)).store.prompt, new RegExp(`คลังความรู้: ${topic1.title}`));
  await act(page);
  await page.getByTestId("dialogue").waitFor();
  assert.equal(await page.getByTestId("dialogue").getAttribute("data-archive"), "true");
  const texts = [];
  const titles = new Set();
  for (let guard = 0; guard < 80; guard++) {
    titles.add(await page.getByTestId("dialogue-title").innerText());
    if (!(await page.getByTestId("dialogue-body").locator("table").count())) texts.push(await page.getByTestId("dialogue-body").innerText());
    const last = (await page.getByTestId("dialogue-next").innerText()) === "เข้าใจแล้ว";
    await page.getByTestId("dialogue-next").click();
    await page.waitForTimeout(60);
    if (last) break;
  }
  const lesson = [topic1.intro, ...topic1.sections.map((section) => section.body)].filter(Boolean).map((text) => text.replaceAll("\n\n", " "));
  assert.equal(texts.join(" "), lesson.join(" "), "คลังความรู้ต้องเป็นข้อความของทุกสถานีจาก course.json ครบทุกคำ");
  assert.equal(titles.size, stationsCount(1), "คลังความรู้แสดงชื่อของทุกสถานี");
  assert.equal((await snap(page)).store.progress[1].stationsSeen, stationsCount(1));
  log(`แมพ 2: โถง 3 ประตู ห้อง 1 มี 2 เรื่อง ไม่มีสถานี คลังความรู้ของเรื่องที่ 1 (${texts.length} หน้า) ตรงกับ course.json ถามติวเตอร์ได้ 4 ครั้ง`);

  // เควส: ระดับความช่วยเหลือต่ำสุดคือปกติ ผิดติดกันแล้วก็ไม่ลดเป็นประคอง
  await walkTo(page, "minigame-t1");
  await act(page);
  const game = page.getByTestId("minigame");
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), "standard", "แมพ 2: เริ่มที่ระดับปกติเป็นอย่างต่ำ");
  await card(page, terms[0].term).click();
  await slot(page, terms[1].definition).click();
  await card(page, terms[0].term).click();
  await slot(page, terms[2].definition).click();
  assert.equal(await game.getAttribute("data-tier"), "standard", "ผิด 2 ครั้งติดกัน: ระดับไม่ลดต่ำกว่าปกติ");
  assert.match(await page.getByTestId("peek-button").innerText(), /เหลือ 2/, "ระดับปกติเปิดอ่านได้จำกัดครั้ง");
  assert.equal(await page.getByTestId("repair-prompt").getAttribute("data-required"), "false", "ห้องซ่อมยังถูกเสนอเหมือนเดิม");
  await page.getByTestId("repair-decline").click();
  await solveMinigame(page, 1);
  await page.getByTestId("minigame-finish").click();
  await page.waitForTimeout(300);
  await walkTo(page, "core-t1");
  await act(page);
  assert.match((await snap(page)).store.toast, /ต้องตอบคำถามทบทวน/);
  await walkTo(page, "review-t1");
  await act(page);
  await answerReview(page, 1);
  await page.getByTestId("review-save").click();
  await page.waitForTimeout(350);
  const beforeCore = await creditsOf(page);
  await walkTo(page, "core-t1");
  await act(page);
  await page.getByTestId("reward").waitFor();
  assert.match(await page.getByTestId("reward-title").innerText(), /ได้รับแกน AI ชิ้นที่ 1/);
  // เครดิต ×1.5: (สถานี 5×5 + ดาว 2×10 + ทบทวน 10 + แกน 20) × 1.5 = 112.5 ปัดเป็น 113
  assert.equal(await page.getByTestId("reward-credits").getAttribute("data-credits"), "113");
  assert.match(await page.getByTestId("reward-next-topic").innerText(), /เรื่องที่ 2 ในห้องนี้/);
  assert.ok((await page.getByTestId("reward-next").innerText()).includes(KAIJU2.n1), "แมพ 2 ออกรบได้ทุกเมื่อ ไม่ต้องรอแกนครบ");
  await page.getByTestId("reward-stay").click();
  await page.waitForTimeout(300);
  assert.ok((await creditsOf(page)) > beforeCore, "รับแกน AI ของแมพ 2 ได้เครดิตเพิ่ม");
  assert.match(await page.getByTestId("hud-topic").innerText(), /เรื่องที่ 2/, "รับแกนแล้ว HUD เลื่อนไปเรื่องถัดไปของห้อง");
  assert.equal((await snap(page)).store.progress[1].core, true);

  // เรื่องที่ 2: ข้ามคลังความรู้ไปทำเควสได้เลย
  await walkTo(page, "minigame-t2");
  await act(page);
  await game.waitFor();
  assert.equal(await game.getAttribute("data-tier"), "standard");
  await solveMinigame(page, 2);
  await page.getByTestId("minigame-finish").click();
  await page.waitForTimeout(300);
  assert.equal((await snap(page)).store.progress[2].stationsSeen, 0, "ไม่ได้อ่านคลังความรู้ของเรื่องที่ 2");
  await walkTo(page, "review-t2");
  await act(page);
  await answerReview(page, 2);
  await page.getByTestId("review-save").click();
  await page.waitForTimeout(350);
  await walkTo(page, "core-t2");
  await act(page);
  await page.getByTestId("reward").waitFor();
  assert.ok((await page.getByTestId("reward-next").innerText()).includes(KAIJU2.n1), "ครบสองเรื่องของห้อง: ภารกิจต่อไปคือไคจูของห้องนี้");
  await page.getByTestId("reward-stay").click();
  await page.waitForTimeout(300);
  log("แมพ 2 ห้อง 1: เควสไม่ลดต่ำกว่าระดับปกติ เรื่องที่ 2 ล็อกจนกว่าจะได้แกนชิ้นที่ 1 ข้ามคลังความรู้ได้ คำถามทบทวนแบบเลือกตอบ เครดิต ×1.5");

  // --- NPC ของแมพ 2: ดร.ไอรีน (ถามตอบสองเรื่อง) และลุงบียอร์น (ร้านอาวุธพิเศษ) แต่ละคนมีเรื่องราวของตัวเอง
  const sageBefore = await creditsOf(page);
  const quizReward = await doQuiz(page, "sage", 5);
  assert.deepEqual([(await snap(page)).store.npcs.sage.best, (await creditsOf(page)) - sageBefore], [5, quizReward]);
  assert.ok(quizReward >= 37, `ถามตอบ 5 ข้อ ข้อละ 5 เครดิต × 1.5: ${quizReward}`);
  const smithStory = await talkTo(page, "smith");
  assert.notDeepEqual(smithStory, sageStory, "NPC แต่ละคนมีเรื่องราวของตัวเอง");
  const smithShop = page.getByTestId("shop");
  await smithShop.waitFor();
  assert.equal(await smithShop.getAttribute("data-vendor"), "smith");
  assert.deepEqual(await smithShop.locator('[data-testid^="shop-item-"]').evaluateAll((items) => items.map((item) => item.dataset.testid.replace("shop-item-", ""))), ["weapon-lance"], "ร้านของลุงบียอร์นขายอาวุธพิเศษที่ร้านสหกรณ์ไม่มี");
  await shot(page, "30-normal-npc-shop");
  await page.getByTestId("shop-buy-weapon-lance").click();
  assert.equal((await snap(page)).store.shop.weapon, "fist", "ซื้ออาวุธแล้วไปใส่ที่แท่นการ์เดียน");
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(350);
  // คุยครั้งถัดไป: ไม่เล่าเรื่องซ้ำ เปิดร้านเลย
  assert.deepEqual(await talkTo(page, "smith"), []);
  await page.getByTestId("shop").waitFor();
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(350);
  log(`NPC ของแมพ 2: ดร.ไอรีน (ถามตอบ 5 ข้อจากเรื่องที่ 1–2 เปิดหลังได้แกนทั้งสองเรื่อง ได้ ${quizReward} เครดิต) ลุงบียอร์น (ร้านอาวุธพิเศษ: หอกสายฟ้า) เล่าเรื่องราวของตัวเองครั้งแรกที่คุย`);

  // --- ไคจูประจำห้อง: โจทย์จากทั้งสองเรื่องของห้อง ขอข้อมูลได้ครั้งเดียว หอกชนะทางโวลต์อีล
  await goToHangar(page);
  assert.equal((await snap(page)).bay.cores, 2, "ตู้กระจกของแมพ 2 แสดงแกนที่เก็บได้ในแมพนี้");
  await walkTo(page, "robot");
  await act(page);
  await page.getByTestId("guardian-bay").waitFor();
  assert.match(await page.getByTestId("guardian-vs-lance").innerText(), /กับโวลต์อีล: ชนะทาง/);
  await page.getByTestId("guardian-weapon-lance").click();
  await page.getByTestId("guardian-close").click();
  await page.waitForTimeout(400);
  assert.equal((await snap(page)).bay.texture, "gd_plate_lance", "หุ่นที่จอดอยู่ถือหอกสายฟ้า");
  await openMissions(page);
  assert.deepEqual(await missionStatus(page), { n1: "ready", n2: "locked", n3: "locked", "omega-n": "locked" }, "แมพ 2: ไคจูประจำห้อง 3 ตัว และบอส 1 ตัว");
  assert.match(await page.getByTestId("mission-omega-n").innerText(), /กลายร่างได้ 2 ร่าง/);
  assert.match(await page.getByTestId("mission-n1").innerText(), /จุดอ่อน: คมอาวุธ \(ดาบ หอก\)/);
  assert.match(await page.getByTestId("missions-power").innerText(), /ไม่ต้องมีแกน AI/);
  await shot(page, "31-normal-missions");
  await page.getByTestId("missions-close").click();
  await page.waitForTimeout(300);
  await startBattle(page, "n1", KAIJU2.n1);
  assert.match(await page.getByTestId("battle-hints-note").innerText(), /ขอข้อมูลจากพี่บิตได้ 1 ครั้ง/);
  const advice = page.getByTestId("weapon-advice");
  assert.deepEqual([await advice.getAttribute("data-weak"), await advice.getAttribute("data-advantaged"), await advice.getAttribute("data-better")], ["blade", "true", ""], "หอกสายฟ้าชนะทางโวลต์อีล");
  assert.equal(await page.getByTestId("battle-power").getAttribute("data-recommended"), String(specOf("n1").power));
  assert.equal(await page.getByTestId("battle-core-bonus").getAttribute("data-bonus"), "2", "แกนของเรื่องที่ 1–2 ชาร์จแล้ว: พลังสูงสุด +2");
  await shot(page, "31-normal-battle-intro");
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("hp-left").getAttribute("data-max"), String(CAMPAIGN.normal.robotHp + 2));
  assert.match(await page.getByTestId("battle-hint").innerText(), /เหลือ 1/);
  assert.equal(await page.getByTestId("battle-robot").getAttribute("data-weapon"), "lance");
  const thrust = await battleTurn(page, true);
  assert.match(thrust.log, /การ์เดียนใช้หอกแทง -1/);
  const thunder = await battleTurn(page, true);
  assert.match(thunder.log, /การ์เดียนใช้หอกสายฟ้า -4 \(คริติคอล! ชนะทาง\)/, "หอก: ถูก 2 ข้อติดกันเป็นคริติคอล และชนะทาง (1 + 1) × 2");
  await shot(page, "31-normal-battle-lance");
  const first = await winBattle(page, "n1");
  assert.deepEqual([...new Set([thrust, thunder, ...first.turns].map((turn) => turn.source))].sort(), [1, 2], "โจทย์ของไคจูประจำห้องมาจากทั้งสองเรื่องของห้อง");
  assert.deepEqual([first.story?.beat, first.story.art[0]], ["win-n1", "st_win_kaiju_7"]);
  assert.equal(first.credits, "เครดิตวิจัย +60", "(30 + 10) × 1.5");
  assert.match(first.won, /ประตูห้อง 2 เปิดแล้ว/);
  await backToHall(page);
  await walkTo(page, "door-2");
  await act(page);
  assert.equal((await inRoom(page, 2))?.beat, "zone-n2");
  assert.ok((await roomIds(page)).includes("minigame-t4"));
  assert.deepEqual(await npcIds(page), ["ranger"]);
  log(`แมพ 2 ไคจูประจำห้อง 1 โวลต์อีล: โจทย์จากเรื่องที่ 1 และ 2 หอกสายฟ้าชนะทางและติดคริติคอล ชนะใน ${first.turns.length + 2} ตา ได้ 60 เครดิต ห้อง 2 เปิด`);

  // --- ผู้เล่นที่ได้แกนครบ 5 ชิ้นของแมพ 2 แล้ว: เควสเสริม ของช่วยเหลือ เกราะ อุปกรณ์สามช่อง และบอส 2 ร่าง
  await resumeWith(page, travelerSave({
    profile: { name: "นักเดินทาง", difficulty: "normal", classCode: "", avatar: "a" },
    maps: { normal: doneRooms([1, 2, 3, 4, 5]), hard: {} },
    battles: { ...wonAll("easy"), n1: WON },
    story: [...MAP1_STORY, "map-normal", "zone-n1", "zone-n2", "zone-n3", "win-n1"],
    shop: shopOf({ owned: ["weapon-hammer", "weapon-blaster", "armor-guard", "chip-retry", "outfit-astronaut"], supplies: { ...NO_SUPPLIES, overcharge: 1, analyzer: 1 }, loadout: ["overcharge", "analyzer"] }),
  }));
  assert.equal(await doorCount(page), 3, "เล่นต่อ: กลับมาที่แมพที่อยู่ล่าสุด");
  assert.match(await page.getByTestId("cores").innerText(), /5\/5/);
  await walkTo(page, "door-3");
  await act(page);
  assert.match((await snap(page)).store.toast, /ห้อง 3 ยังล็อก ต้องพาการ์เดียนไปชนะไอรอนเชลล์/);
  // เควสเสริมของพี่ไรลีย์: เก็บเครื่องส่งสัญญาณ 4 เครื่องในห้อง 2 เครดิตคูณ 1.5
  await walkTo(page, "door-2");
  await act(page);
  await inRoom(page, 2);
  const questReward = await doSideQuest(page, "ranger");
  assert.ok(questReward === 37 || questReward === 38, `รางวัลเควสเสริม 25 × 1.5: ${questReward}`);
  await shot(page, "31-normal-npc-quest");
  await walkTo(page, "door-entry");
  await act(page);
  await inHall(page);
  await page.waitForTimeout(300);
  await goToHangar(page);

  // เกราะ: ตอบถูกข้อแรกเกราะแตก ข้อถัดไปจึงโจมตีเข้า ตอบผิดเกราะกลับมา พี่บิตแนะนำค้อนที่ทุบทะลุเกราะ
  await startBattle(page, "n2", KAIJU2.n2);
  assert.match(await page.getByTestId("battle-intro").innerText(), /หุ้มเกราะ/);
  const hammerAdvice = page.getByTestId("weapon-advice");
  assert.deepEqual([await hammerAdvice.getAttribute("data-weak"), await hammerAdvice.getAttribute("data-advantaged"), await hammerAdvice.getAttribute("data-better"), await hammerAdvice.getAttribute("data-stronger")], ["strike", "true", "hammer", "true"]);
  assert.match(await hammerAdvice.innerText(), /ไอรอนเชลล์ แพ้ทางแรงกระแทก[\s\S]*ค้อนพลังงานชนะทางเหมือนกันและแรงกว่า/);
  await page.getByTestId("battle-start").click();
  await page.getByTestId("battle-armored").waitFor();
  const armorHp = specOf("n2").forms[0].hp;
  let turn = await battleTurn(page, true);
  assert.match(turn.log, /เกราะแตกแล้ว ข้อถัดไปโจมตีเข้า/);
  assert.equal(turn.kaiju, armorHp, "ข้อที่ทุบเกราะไม่ลดพลังของไคจู");
  assert.equal(await page.getByTestId("battle-armored").count(), 0);
  turn = await battleTurn(page, false);
  assert.match(turn.log, /ไอรอนเชลล์ใช้กระดองพุ่งชน -1.*ไอรอนเชลล์สร้างเกราะกลับมา/);
  await page.getByTestId("battle-armored").waitFor();
  // แบตเตอรี่เสริม: ไม่เสียไปกับการทุบเกราะ การโจมตีครั้งถัดไปแรง 2 เท่า ใช้ของได้ตาละ 1 ชิ้น
  await page.getByTestId("battle-supply-overcharge").click();
  assert.match(await page.getByTestId("battle-log").innerText(), /ต่อแบตเตอรี่เสริมแล้ว/);
  assert.equal(await page.getByTestId("battle-bag").getAttribute("data-used"), "true");
  assert.equal(await page.getByTestId("battle-supply-analyzer").isDisabled(), true, "ใช้ของไปแล้วในตานี้: ชิ้นถัดไปต้องรอตาหน้า");
  assert.match(await page.getByTestId("battle-bag").innerText(), /ใช้ของได้ตาละ 1 ชิ้น/);
  turn = await battleTurn(page, true);
  assert.match(turn.log, /เกราะแตกแล้ว/);
  assert.equal(await page.getByTestId("battle-bag").getAttribute("data-used"), "false", "ตาใหม่: ใช้ของได้อีกหนึ่งชิ้น");
  turn = await battleTurn(page, true);
  assert.match(turn.log, /การ์เดียนใช้หมัดจรวด -4 \(ชนะทาง เสริมพลัง ×2\)/, "หมัดชนะทาง (1 + 1) และแบตเตอรี่เสริม × 2");
  await shot(page, "31-normal-battle-armor");
  const analyzed = await useAnalyzer(page);
  assert.deepEqual((await snap(page)).store.shop.supplies, analyzed ? NO_SUPPLIES : { ...NO_SUPPLIES, analyzer: 1 }, "ของใช้แล้วหมดไป");
  const second = await winBattle(page, "n2");
  assert.match(second.won, /ประตูห้อง 3 เปิดแล้ว/);
  assert.deepEqual([second.story?.beat, second.story.art[0]], ["win-n2", "st_win_kaiju_8"]);
  log(`แมพ 2 ไอรอนเชลล์ (เกราะ): ตอบถูกข้อแรกเกราะแตก ตอบผิดเกราะกลับมา แบตเตอรี่เสริมโจมตี 2 เท่า ใช้ของได้ตาละ 1 ชิ้น ชิปวิเคราะห์ตัดตัวเลือกผิด (${analyzed ? `ใช้ได้ในตาที่ ${analyzed}` : "รอบนี้เจอแต่โจทย์สองตัวเลือก จึงไม่ได้ใช้"})`);

  // ซ้อมรบกับไอรอนเชลล์ด้วยค้อน: กดใส่ตามคำแนะนำของพี่บิตจากหน้าเตรียมออกปฏิบัติการ ค้อนทุบเกราะแตกและโจมตีเข้าในข้อเดียว
  // ซ้อมรบด้วยค้อนตามคำแนะนำของพี่บิต: เปลี่ยนอาวุธที่แท่นการ์เดียนก่อนออกปฏิบัติการ
  await walkTo(page, "robot");
  await act(page);
  await page.getByTestId("guardian-bay").waitFor();
  await page.getByTestId("guardian-weapon-hammer").click();
  await page.getByTestId("guardian-close").click();
  await page.waitForTimeout(400);
  assert.deepEqual([(await snap(page)).store.shop.weapon, (await snap(page)).bay.texture], ["hammer", "gd_plate_hammer"]);
  await startBattle(page, "n2", KAIJU2.n2, { training: true });
  assert.equal(await page.getByTestId("weapon-advice").getAttribute("data-better"), "");
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("battle-robot").getAttribute("data-weapon"), "hammer");
  turn = await battleTurn(page, true);
  assert.match(turn.log, /ค้อนทุบเกราะแตก โจมตีเข้าทันที.*การ์เดียนใช้ค้อนทุบ -1/);
  assert.equal(turn.kaiju, armorHp - 1, "ค้อนทุบทะลุเกราะ: ลดพลังได้ตั้งแต่ข้อแรก");
  await shot(page, "31-normal-battle-hammer");
  await winBattle(page, "n2");
  log("อาวุธที่ชนะทาง: พี่บิตแนะนำค้อนสำหรับไอรอนเชลล์ เปลี่ยนที่แท่นการ์เดียนแล้วหุ่นที่จอดอยู่ถือค้อน ค้อนทุบเกราะแตกและโจมตีเข้าในข้อเดียว");

  // --- ชุดนักบินอวกาศ: กระเป๋าพกของได้ 4 ชิ้น
  await walkTo(page, "wardrobe");
  await act(page);
  await page.getByTestId("wardrobe").waitFor();
  await page.getByTestId("wardrobe-outfit-astronaut").click();
  assert.equal((await snap(page)).avatar.texture, "ch_a_astronaut", "ชุดใหม่ของแมพ 2 มีภาพตัวละครของตัวเอง");
  await page.getByTestId("wardrobe-close").click();
  await page.waitForTimeout(350);

  // --- อุปกรณ์ครบสามช่อง: ปืนเลเซอร์ (สตัน) เกราะสะท้อน (กันให้เอง) ชิปคิดทบทวน (ได้ตอบใหม่) ใส่ที่แท่นการ์เดียน
  await walkTo(page, "robot");
  await act(page);
  await page.getByTestId("guardian-bay").waitFor();
  // ฝูงสติงเกอร์แพ้ทางลำแสง ทนแรงกระแทก: ค้อนแพ้ทาง ปืนเลเซอร์ชนะทาง
  assert.match(await page.getByTestId("guardian-vs-hammer").innerText(), /กับฝูงสติงเกอร์: แพ้ทาง/);
  assert.match(await page.getByTestId("guardian-vs-blaster").innerText(), /กับฝูงสติงเกอร์: ชนะทาง/);
  const powerBefore = Number(await page.getByTestId("guardian-power").getAttribute("data-power"));
  for (const id of ["weapon-blaster", "armor-guard", "chip-retry"]) await page.getByTestId(`guardian-${id}`).click();
  // ค้อนที่แพ้ทาง (40 − 20) → ปืนที่ชนะทาง (30 + 20) + เกราะสะท้อน 30 + ชิปคิดทบทวน 30
  assert.equal(Number(await page.getByTestId("guardian-power").getAttribute("data-power")) - powerBefore, 90);
  assert.deepEqual(await page.getByTestId("guardian-model").evaluate((el) => [el.dataset.weapon, el.dataset.armor, el.dataset.chip]), ["blaster", "guard", "retry"]);
  // ชิปเป็นอุปกรณ์ติดหลังหุ่น (ชั้นภาพก่อนภาพหุ่น จึงอยู่หลังตัวหุ่น) ภาพโหลดได้จริง
  const chipImage = page.getByTestId("guardian-bay").getByTestId("guardian-chip");
  assert.deepEqual(await chipImage.evaluate(async (img) => [img.dataset.chip, img.nextElementSibling?.tagName, (img.complete || (await new Promise((done) => img.addEventListener("load", done, { once: true })))) && img.naturalWidth]), ["retry", "IMG", 128]);
  await shot(page, "31-normal-guardian-bay");
  await page.getByTestId("guardian-close").click();
  await page.waitForTimeout(400);
  assert.deepEqual((await snap(page)).bay, { texture: "gd_guard_blaster", tint: null, chip: true, cores: 5 }, "หุ่นที่จอดอยู่ใส่เกราะสะท้อน ถือปืนเลเซอร์ มีอุปกรณ์ของชิปติดหลัง");
  await walkTo(page, "storage");
  await act(page);
  await page.getByTestId("storage").waitFor();
  assert.equal(await page.getByTestId("bag-picker").getAttribute("data-size"), "4", "ชุดนักบินอวกาศ: กระเป๋า 4 ช่อง");
  assert.equal(await page.locator('[data-testid^="bag-slot-"]').count(), 4);
  assert.equal(await page.getByTestId("weapon-advice").getAttribute("data-advantaged"), "true", "ฝูงสติงเกอร์แพ้ทางลำแสง: ปืนเลเซอร์ชนะทาง");
  assert.match(await page.getByTestId("bag-advice").innerText(), /ยังไม่มีในกล่อง/);
  await shot(page, "31-normal-storage");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  assert.deepEqual([(await snap(page)).store.overlay, (await snap(page)).store.shop.chip], [null, "retry"]);
  await startBattle(page, "n3", KAIJU2.n3);
  assert.match(await page.getByTestId("battle-gear-note").innerText(), /ปืนเลเซอร์ · เกราะสะท้อน · ชิปคิดทบทวน/);
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("battle-robot").getAttribute("data-weapon"), "blaster");
  assert.deepEqual([await page.getByTestId("battle-retries").count(), await page.getByTestId("battle-guard").count()], [1, 1]);
  const swarmHp = specOf("n3").forms[0].hp;
  {
    // ตอบผิดครั้งแรก: ชิปคิดทบทวนให้ตอบข้อเดิมใหม่ ตัดข้อที่เลือกออก ตายังไม่จบ
    assert.equal(await page.getByTestId("battle-command").getAttribute("data-saved"), "retry");
    const source = Number(await page.getByTestId("battle").getAttribute("data-source"));
    const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
    const options = await page.getByTestId("choice-option").allInnerTexts();
    const right = options.indexOf(poolAnswer(source, battlePools(source), cardText, options));
    const wrong = (right + 1) % options.length;
    await page.getByTestId("choice-option").nth(wrong).click();
    assert.match(await page.getByTestId("battle-log").innerText(), /ชิปคิดทบทวนทำงาน/);
    assert.deepEqual([await page.getByTestId("battle-next").count(), await page.getByTestId("battle").getAttribute("data-turn"), await page.getByTestId("hp-left").getAttribute("data-hp")], [0, "0", String(CAMPAIGN.normal.robotHp + 1)], "พลังเต็ม 6 + แกนของเรื่องที่ 5 อีก 1");
    assert.equal(await page.getByTestId("choice-option").nth(wrong).getAttribute("data-removed"), "true");
    assert.equal(await page.getByTestId("battle-retries").count(), 0, "ใช้ได้ครั้งเดียวต่อการออกปฏิบัติการ");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "choice-option", "โฟกัสย้ายไปตัวเลือกที่ยังกดได้");
    await shot(page, "31-normal-second-chance");
  }
  // ตอบข้อเดิมใหม่ให้ถูก: ตาเดิมจบ นับเป็นตอบถูกหนึ่งข้อ
  assert.equal(await page.getByTestId("battle-command").getAttribute("data-saved"), "guard");
  turn = await battleTurn(page, true);
  assert.deepEqual([turn.retried, turn.kaiju, await page.getByTestId("battle").getAttribute("data-turn")], [false, swarmHp - 1, "1"]);
  // ตอบผิดในตาถัดไป: ไม่มีสิทธิ์ตอบใหม่แล้ว เกราะสะท้อนกันสกิลหนักของฝูงให้
  turn = await battleTurn(page, false);
  assert.equal(turn.retried, false);
  assert.match(turn.log, /เกราะสะท้อนกันห่าเหล็กในไว้ได้/);
  assert.deepEqual([turn.robot, await page.getByTestId("battle-guard").count()], [CAMPAIGN.normal.robotHp + 1, 0]);
  // ตอบถูก 3 ข้อติดกัน: ปืนเลเซอร์ทำให้ฝูงติดสตัน ตอบผิดครั้งถัดไปฝูงโจมตีไม่ได้
  const shots = [];
  for (let i = 0; i < 3; i++) {
    turn = await battleTurn(page, true);
    shots.push(await page.getByTestId("battle-fx").getAttribute("data-sparks"));
  }
  assert.equal(shots[0], "bolt:kaiju,impact:kaiju", "ท่าของปืนเลเซอร์: ยิงกระสุน");
  assert.match(turn.log, /ฝูงสติงเกอร์ติดสตัน/);
  assert.ok(shots[2].includes("stun:kaiju"));
  await page.getByTestId("battle-stunned").waitFor();
  assert.equal(await page.getByTestId("battle-command").getAttribute("data-saved"), "stun");
  await shot(page, "31-normal-stun");
  turn = await battleTurn(page, false);
  assert.match(turn.log, /ฝูงสติงเกอร์ติดสตัน โจมตีไม่ได้/);
  assert.deepEqual([turn.robot, await page.getByTestId("battle-stunned").count()], [CAMPAIGN.normal.robotHp + 1, 0]);
  const third = await winBattle(page, "n3");
  assert.deepEqual([third.story?.beat, third.story.art], ["win-n3", ["st_win_kaiju_9", "st_boss_2"]]);
  log("อุปกรณ์ของการ์เดียน: ชิปคิดทบทวนให้ตอบข้อเดิมใหม่ เกราะสะท้อนกันสกิลแรกให้เอง ปืนเลเซอร์ทำให้ติดสตันเมื่อถูก 3 ข้อติดกัน ชุดนักบินอวกาศพกของได้ 4 ชิ้น");

  // --- หมอโซเฟีย (ช่วยเหลือ): ให้ชุดซ่อมและโล่ครั้งเดียว
  await backToHall(page);
  await walkTo(page, "door-3");
  await act(page);
  await inRoom(page, 3);
  assert.deepEqual(await npcIds(page), ["medic"]);
  await talkTo(page, "medic");
  assert.equal(await page.getByTestId("npc-gift").getAttribute("data-stage"), "intro");
  await page.getByTestId("npc-gift-claim").click();
  assert.match(await page.getByTestId("npc-gift-result").innerText(), /ชุดซ่อมฉุกเฉิน[\s\S]*โล่พลังงาน/);
  await shot(page, "31-normal-npc-gift");
  await page.getByTestId("npc-close").click();
  await page.waitForTimeout(350);
  state = (await snap(page)).store;
  assert.deepEqual([state.shop.supplies["repair-kit"], state.shop.supplies.shield, state.npcs.medic.gifted, state.shop.spent], [1, 1, true, 0], "ของช่วยเหลือเข้ากล่องเก็บไอเทม ไม่เสียเครดิต");
  await talkTo(page, "medic");
  assert.equal(await page.getByTestId("npc-gift").getAttribute("data-stage"), "done");
  assert.equal(await page.getByTestId("npc-gift-claim").count(), 0, "รับของช่วยเหลือได้ครั้งเดียว");
  await page.getByTestId("npc-close").click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "สมุดเควส" }).click();
  assert.match(await page.getByTestId("questlog-side").innerText(), /2\/3/, "กิจกรรมเสริมของแมพ 2: เควสของพี่ไรลีย์และของช่วยเหลือของหมอโซเฟีย (ถามตอบของดร.ไอรีนยังไม่ได้เล่นในข้อมูลชุดนี้)");
  await page.getByRole("button", { name: "ปิด", exact: true }).click();
  await page.waitForTimeout(350);
  log("NPC หมอโซเฟีย (ช่วยเหลือ): ให้ชุดซ่อมและโล่ครั้งเดียว ไม่เสียเครดิต สมุดเควสนับกิจกรรมเสริมของแมพนี้");

  // --- บอส 2 ร่าง: ชนะร่างแรกแล้วกลายร่าง แพ้ในร่างที่ 2 แล้วออกใหม่ได้โดยไม่ต้องสู้ร่างแรกซ้ำ
  await goToHangar(page);
  await startBattle(page, "omega-n", KAIJU2["omega-n"]);
  assert.equal(await page.getByTestId("battle-trait").count(), 2, "หน้าเริ่มด่านอธิบายลักษณะของทั้งสองร่าง");
  assert.match(await page.getByTestId("battle-intro").innerText(), /กลายร่างได้ 2 ร่าง/);
  assert.equal(await page.getByTestId("weapon-advice").getAttribute("data-weak"), "blade,beam", "บอสแต่ละร่างแพ้ทางอาวุธคนละแบบ");
  assert.match(await page.getByTestId("weapon-advice").innerText(), /บอสแต่ละร่างแพ้ทางอาวุธคนละแบบ/);
  await page.getByTestId("battle-start").click();
  assert.equal((await snap(page)).audio.playing, "boss:0");
  assert.match(await page.getByTestId("battle-form").innerText(), /ร่างที่ 1\/2/);
  assert.equal(await page.getByTestId("hp-left").getAttribute("data-max"), String(CAMPAIGN.normal.robotHp + CAMPAIGN.normal.coreBoost), "แกนของแมพ 2 ครบ: พลังสูงสุดเพิ่มเต็มเพดาน");
  assert.equal(await page.getByTestId("battle-weak").getAttribute("data-matchup"), "weak", "ร่างแรกแพ้ทางคมอาวุธ ทนลำแสง: ปืนเลเซอร์แพ้ทาง");
  let transformed = null;
  for (let guard = 0; guard < 30 && !transformed; guard++) {
    turn = await battleTurn(page, true);
    if (/กลายร่างเป็นโอเมก้า ร่างคลั่ง/.test(turn.log)) transformed = turn;
  }
  assert.ok(transformed, "ชนะร่างแรกแล้วบอสต้องกลายร่าง");
  assert.equal(transformed.kaiju, specOf("omega-n").forms[1].hp, "ร่างใหม่พลังเต็ม");
  assert.equal(await page.getByTestId("battle-guard").count(), 1, "เกราะสะท้อนพร้อมกันร่างใหม่อีกครั้ง");
  assert.equal(await playing(page), "boss:1", "บอสกลายร่าง: เพลงบอสคีย์สูงขึ้นและเร็วขึ้น");
  assert.deepEqual([await page.getByTestId("battle").getAttribute("data-form"), await page.getByTestId("battle-foe").getAttribute("data-art")], ["1", "boss_2"]);
  assert.match(await page.getByTestId("battle-form").innerText(), /ร่างที่ 2\/2/);
  assert.deepEqual([await page.getByTestId("battle-weak").getAttribute("data-weak"), await page.getByTestId("battle-weak").getAttribute("data-matchup")], ["beam", "strong"], "ร่างใหม่แพ้ทางอาวุธอีกแบบ: ปืนเลเซอร์ที่ถืออยู่ชนะทางร่างนี้");
  await shot(page, "32-normal-boss-form2");
  turn = await battleTurn(page, true);
  for (let guard = 0; guard < 30 && (await page.getByTestId("battle").getAttribute("data-stage")) === "fight"; guard++) turn = await battleTurn(page, false);
  await page.getByTestId("battle-lost").waitFor();
  assert.match(await page.getByTestId("battle-lost").innerText(), /โอเมก้า ร่างคลั่งยังเหลือพลัง \d/);
  await page.getByTestId("battle-retry").click();
  assert.equal(await page.getByTestId("battle").getAttribute("data-form"), "1", "ออกปฏิบัติการใหม่: เริ่มที่ร่างที่ 2 ไม่ต้องสู้ร่างแรกซ้ำ");
  const boss = await winBattle(page, "omega-n");
  assert.match(boss.won, /เมืองปลอดภัยแล้ว/);
  assert.equal(boss.credits, "เครดิตวิจัย +90", "บอส 60 × 1.5 (ไม่ได้โบนัสชนะในครั้งแรก)");
  const ending = boss.story;
  assert.deepEqual([ending?.beat, ending.art], ["ending-normal", ["st_win_boss_2", "st_ending_2", "st_map3"]], "บทส่งท้ายของแมพ 2: ช่องสุดท้ายเปิดเส้นทางไปแมพ 3");
  assert.equal((await snap(page)).store.overlay, null, "ใบประกาศเป็นของแมพ 1: จบแมพ 2 ไม่เปิดใบประกาศ");
  await backToHall(page);
  assert.match(await page.getByTestId("objective").innerText(), /ชนะไคจูของแมพนี้ครบแล้ว ไปที่กระดานแผนที่เพื่อเดินทางไปแมพ 3/);
  await openTravel(page);
  assert.deepEqual(await travelStatus(page), { easy: ["open", "true"], normal: ["here", "true"], hard: ["open", "false"] }, "ชนะไคจูของแมพ 2 ครบ: แมพ 3 เปิด");
  await page.getByTestId("travel-close").click();
  await page.waitForTimeout(350);
  log("แมพ 2 บอสโอเมก้า 2 ร่าง: แต่ละร่างแพ้ทางอาวุธคนละแบบ ชนะร่างแรกแล้วกลายร่าง แพ้ในร่างที่ 2 แล้วออกใหม่ที่ร่างเดิม ชนะแล้วเห็นบทส่งท้ายและแมพ 3 เปิด");
}

// ---------------------------------------------------------------- แมพ 3: ป้อมปราการภูเขาไฟ (ไม่มีห้องเรียน ลุยด่านต่อสู้ 3 ด่าน บอส 3 ร่าง)

const KAIJU3 = { h1: "แมกมาโกเลม", h2: "ฟีนิกซ์เหล็ก" };

async function playHard(page) {
  // ผู้เล่นที่ชนะไคจูของแมพ 2 ครบแล้ว ยังอยู่ที่แมพ 2
  await resumeWith(page, travelerSave({
    profile: { name: "นักเดินทาง", difficulty: "normal", classCode: "", avatar: "a" },
    maps: { normal: doneRooms([1, 2, 3, 4, 5]), hard: {} },
    battles: { ...wonAll("easy"), ...wonAll("normal") },
    story: [...MAP1_STORY, "map-normal", "zone-n1", "zone-n2", "zone-n3", "win-n1", "win-n2", "win-n3", "ending-normal"],
    // มีธีมสีอยู่แล้วหนึ่งแบบ (ไว้ตรวจการเปลี่ยนธีมของห้อง)
    shop: shopOf({ owned: ["theme-midnight"] }),
  }));
  const arrival = await travelTo(page, "hard", 0);
  assert.deepEqual([arrival?.beat, arrival.art], ["map-hard", ["st_map3", "st_npc_captain_1", "st_boss_4", "st_kaiju_10"]]);
  assert.match(arrival.lines.join(" "), /ไม่มีห้องเรียน/);
  assert.equal(await page.getByTestId("cores").count(), 0, "แมพ 3 ไม่มีแกน AI ให้เก็บ: ไม่แสดงตัวนับแกน");
  assert.match(await page.getByTestId("objective").innerText(), /เตรียมอุปกรณ์ที่แท่นการ์เดียน แล้วออกสู้กับแมกมาโกเลม/);
  await assertCanvasFits(page, "โถงของแมพ 3");
  await shot(page, "33-hard-hall");

  // --- ร้านของแมพ 3: อุปกรณ์ขั้นสูงสุดวางขาย ซื้อแล้วไปใส่ที่โรงเก็บหุ่น
  await walkTo(page, "shop");
  await act(page);
  await page.getByTestId("shop").waitFor();
  assert.equal(await page.locator('[data-testid^="shop-item-"][data-locked="true"]').count(), 0, "มาถึงแมพ 3: ของทุกชิ้นวางขายแล้ว");
  for (const id of ["weapon-cannon", "outfit-researcher", "supply-reboot", "supply-analyzer", "supply-overcharge", "module-scanner", "module-medic"]) await page.getByTestId(`shop-buy-${id}`).click();
  assert.equal(await page.getByTestId("shop-buy-module-scanner").count(), 0, "โมดูลซื้อได้ครั้งเดียว");
  assert.equal(await page.getByTestId("shop-buy-supply-reboot").isDisabled(), true, "แกนสำรองถือได้ชิ้นเดียว");
  assert.match(await page.getByTestId("shop-buy-supply-reboot").innerText(), /ถือเต็มแล้ว \(1\)/);
  assert.deepEqual([(await snap(page)).avatar.texture, (await snap(page)).store.shop.weapon], ["ch_a_lab", "fist"], "ร้านขายอย่างเดียว");
  await shot(page, "34-hard-shop");
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(300);

  // --- โรงเก็บหุ่นของแมพ 3: ผังของตัวเอง NPC ของแมพนี้ประจำอยู่ที่นี่ ตู้กระจกแสดงแกน 6 ชิ้นจากแมพ 1
  await goToHangar(page);
  await assertCanvasFits(page, "โรงเก็บหุ่นของแมพ 3");
  assert.deepEqual(await npcIds(page), ["captain", "keeper"]);
  assert.equal((await snap(page)).bay.cores, 6);
  await shot(page, "33-hard-hangar");
  // --- จัดโรงเก็บหุ่นเอง: ย้ายแท่นชาร์จพี่บิต และเปลี่ยนธีมสีของห้อง (ตู้กระจกเก็บแกนและ NPC ย้ายไม่ได้)
  assert.equal((await snap(page)).map.tileset, "ts_hangar3");
  await walkTo(page, "decorboard");
  await act(page);
  const planner = page.getByTestId("decor");
  await planner.waitFor();
  await page.getByTestId("decor-mode-station").click();
  assert.deepEqual(await page.locator('[data-testid^="station-pick-"]').evaluateAll((rows) => rows.map((row) => row.dataset.testid.replace("station-pick-", ""))), ["storage", "decorboard", "robot", "console", "hologram", "wardrobe", "bitpad"]);
  await page.getByTestId("station-pick-bitpad").click();
  await clickCell(page, 9, 6);
  assert.match(await planner.getAttribute("data-layout"), /bitpad@9,6/);
  await page.getByTestId("decor-mode-theme").click();
  assert.equal(await page.locator('[data-testid^="theme-pick-"]').count(), 2);
  await page.getByTestId("theme-pick-midnight").click();
  assert.deepEqual([await planner.getAttribute("data-theme"), await page.getByTestId("theme-pick-midnight").getAttribute("aria-pressed")], ["midnight", "true"]);
  await page.waitForTimeout(500);
  await shot(page, "33-hard-hangar-theme");
  await page.getByTestId("decor-close").click();
  await page.waitForTimeout(400);
  let arranged = await snap(page);
  assert.deepEqual([arranged.map.tileset, arranged.bay.cores, arranged.store.shop.theme, arranged.store.shop.layout], ["ts_theme_midnight", 6, { "hard:hangar": "midnight" }, { "hard:hangar": { bitpad: { col: 9, row: 6 } } }], "ธีมและตำแหน่งใหม่มีผลในฉากทันที แกนในตู้ยังอยู่");
  assert.deepEqual(await npcIds(page), ["captain", "keeper"]);
  // โหลดหน้าใหม่: การจัดห้องยังอยู่
  await page.reload();
  await page.locator('[data-testid="menu-continue"]:not([disabled])').click();
  await inHall(page);
  await page.waitForTimeout(400);
  assert.equal((await snap(page)).map.tileset, "ts_fortress", "ธีมเปลี่ยนเฉพาะห้องที่เลือก โถงยังเป็นธีมเดิม");
  await goToHangar(page);
  arranged = await snap(page);
  assert.equal(arranged.map.tileset, "ts_theme_midnight");
  assert.ok(arranged.map.blocked.includes("9,6") && arranged.map.blocked.includes("10,6"));
  log("จัดโรงเก็บหุ่นของแมพ 3: ย้ายแท่นชาร์จพี่บิตและเปลี่ยนธีมสีได้ มีผลในฉากทันทีและยังอยู่หลังโหลดหน้าใหม่ ธีมเปลี่ยนเฉพาะห้องที่เลือก");
  // ถามตอบของกัปตันเรย์ใช้โจทย์ของทุกเรื่อง เปิดเพราะเรียนครบแล้วที่แมพ 1
  const start = await creditsOf(page);
  assert.equal(await doQuiz(page, "captain", 6), 60, "ถามตอบ 6 ข้อ ข้อละ 5 เครดิต × 2");
  assert.equal((await creditsOf(page)) - start, 60);
  await talkTo(page, "keeper");
  const armory = page.getByTestId("shop");
  await armory.waitFor();
  assert.deepEqual([await armory.getAttribute("data-vendor"), await armory.locator('[data-testid^="shop-item-"]').evaluateAll((items) => items.map((item) => item.dataset.testid.replace("shop-item-", "")))], ["keeper", ["armor-titan"]]);
  assert.match(await page.getByTestId("shop-power-armor-titan").innerText(), /ค่าพลัง \+40/);
  await page.getByTestId("shop-buy-armor-titan").click();
  await shot(page, "33-hard-npc-shop");
  await page.getByTestId("shop-close").click();
  await page.waitForTimeout(350);
  log("NPC ของแมพ 3 อยู่ในโรงเก็บหุ่น: กัปตันเรย์ (ถามตอบรวม 6 ข้อจากทุกเรื่อง) ลุงโอลาฟ (คลังแสง: เกราะไททัน)");

  // --- เครื่องฉาย: บันทึกเรื่องราวของทุกแมพที่ไปถึง ตอนที่ดูแล้วดูซ้ำได้ ตอนที่ยังไม่ถึงล็อก
  await walkTo(page, "hologram");
  assert.match((await snap(page)).store.prompt, /เรื่องราวของทุกแมพ/);
  await act(page);
  const archive = page.getByTestId("archive");
  await archive.waitFor();
  // แมพที่อยู่ขึ้นก่อนและเปิดไว้ แมพอื่นพับไว้
  assert.deepEqual(await archive.locator("details").evaluateAll((all) => all.map((d) => [d.dataset.testid, d.open])), [["archive-hard", true], ["archive-easy", false], ["archive-normal", false]]);
  await page.getByTestId("archive-toggle-normal").click();
  assert.deepEqual(await page.getByTestId("archive-hard").locator("li").evaluateAll((rows) => rows.map((row) => [row.dataset.testid, row.dataset.seen])), [["chapter-map-hard", "true"], ["chapter-win-h1", "false"], ["chapter-win-h2", "false"], ["chapter-ending-hard", "false"]]);
  assert.match(await page.getByTestId("chapter-ending-normal").innerText(), /บทส่งท้ายของแมพ/);
  assert.match(await page.getByTestId("chapter-win-n1").innerText(), /ชนะโวลต์อีล/);
  await shot(page, "33-hard-archive");
  await page.getByTestId("chapter-play-ending-normal").click();
  const replayed = await readStory(page);
  assert.deepEqual([replayed?.beat, replayed.art.at(-1)], ["ending-normal", "st_map3"], "ดูบทส่งท้ายของแมพ 2 ซ้ำได้ ช่องสุดท้ายพาไปแมพ 3");
  await page.waitForTimeout(300);
  log("เครื่องฉายในโรงเก็บหุ่น: เรื่องราวของทั้ง 3 แมพเรียงตอน ตอนที่ดูแล้วดูซ้ำได้ ตอนที่ยังไม่ถึงล็อก");

  // --- แท่นชาร์จพี่บิต: ติดตั้งโมดูลที่ซื้อไว้ได้ 2 ชิ้น เฉพาะชิ้นที่ติดตั้งมีผลในด่านต่อสู้
  await walkTo(page, "bitpad");
  assert.match((await snap(page)).store.prompt, /แท่นชาร์จพี่บิต/);
  await act(page);
  const dock = page.getByTestId("bitpad");
  await dock.waitFor();
  assert.equal(await dock.getAttribute("data-modules"), "", "ซื้อแล้วยังไม่ติดตั้งให้เอง");
  assert.deepEqual(await dock.locator('[data-testid^="bitpad-module-"]').evaluateAll((rows) => rows.map((row) => `${row.dataset.testid.replace("bitpad-module-", "")}:${row.dataset.owned}`)), ["scanner:true", "toolkit:false", "laser:false", "decoy:false", "medic:true"]);
  await page.getByTestId("bitpad-toggle-scanner").click();
  await page.getByTestId("bitpad-toggle-medic").click();
  assert.equal(await dock.getAttribute("data-modules"), "scanner,medic");
  assert.deepEqual(await dock.locator('[data-testid^="bitpad-slot-"]').evaluateAll((slots) => slots.map((slot) => slot.dataset.module)), ["scanner", "medic"]);
  await page.getByTestId("bitpad-toggle-medic").click();
  assert.equal(await dock.getAttribute("data-modules"), "scanner", "ถอดโมดูลได้");
  await page.getByTestId("bitpad-toggle-medic").click();
  await shot(page, "33-hard-bitdock");
  await page.getByTestId("bitpad-close").click();
  await page.waitForTimeout(300);
  assert.deepEqual((await snap(page)).store.shop.modules, ["scanner", "medic"]);

  // --- จุดปรับแต่งก่อนออกรบ: ชุดที่ตู้เสื้อผ้า อาวุธและเกราะที่แท่นการ์เดียน
  await walkTo(page, "wardrobe");
  await act(page);
  await page.getByTestId("wardrobe").waitFor();
  await page.getByTestId("wardrobe-outfit-researcher").click();
  await page.getByTestId("wardrobe-close").click();
  await page.waitForTimeout(300);
  assert.equal((await snap(page)).avatar.texture, "ch_a_researcher");
  await walkTo(page, "robot");
  await act(page);
  await page.getByTestId("guardian-bay").waitFor();
  assert.match(await page.getByTestId("guardian-next").innerText(), /ด่านถัดไป: แมกมาโกเลม/);
  assert.match(await page.getByTestId("guardian-vs-cannon").innerText(), /กับแมกมาโกเลม: ชนะทาง/);
  assert.match(await page.getByTestId("guardian-vs-fist").innerText(), /กับแมกมาโกเลม: แพ้ทาง/);
  await page.getByTestId("guardian-weapon-cannon").click();
  await page.getByTestId("guardian-armor-titan").click();
  await page.getByTestId("guardian-close").click();
  await page.waitForTimeout(400);
  assert.equal((await snap(page)).bay.texture, "gd_titan_cannon", "หุ่นที่จอดอยู่ใส่เกราะไททันและถือปืนใหญ่");

  await openMissions(page);
  assert.deepEqual(await missionStatus(page), { h1: "ready", h2: "locked", end: "locked" }, "แมพ 3: ไคจู 2 ตัว แล้วบอสใหญ่");
  assert.match(await page.getByTestId("missions-power").innerText(), /ไม่ต้องมีแกน AI/);
  assert.match(await page.getByTestId("mission-end").innerText(), /กลายร่างได้ 3 ร่าง/);
  await page.getByTestId("missions-close").click();
  await page.waitForTimeout(300);

  // --- ด่าน 1 แมกมาโกเลม (เกราะ แพ้ทางลำแสง): ปืนใหญ่ชนะทาง
  await startBattle(page, "h1", KAIJU3.h1);
  assert.match(await page.getByTestId("battle-intro").innerText(), /หุ้มเกราะ/);
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("hp-left").getAttribute("data-max"), "9", "แมพ 3: การ์เดียนเริ่มที่พลัง 5 เกราะไททัน +4");
  assert.deepEqual([await page.getByTestId("battle-weak").getAttribute("data-matchup"), await page.getByTestId("battle-robot").getAttribute("data-armor")], ["strong", "titan"]);
  // แถบพลัง: 4 ช่องท้ายที่มาจากเกราะไททันเป็นสีเหล็กและหมดก่อน ไคจูที่หุ้มเกราะอยู่แถบเป็นสีเหล็กทั้งแถบ
  const segments = (side) => page.getByTestId(`hp-${side}`).locator("[data-segment]").evaluateAll((cells) => cells.map((cell) => cell.dataset.segment));
  assert.deepEqual(await segments("left"), [...Array(5).fill("hp"), ...Array(4).fill("armor")]);
  assert.match(await page.getByTestId("hp-left").getAttribute("aria-label"), /เกราะเหลือ 4 ช่อง/);
  assert.equal(await page.getByTestId("hp-right").getAttribute("data-shielded"), "true");
  assert.ok((await segments("right")).every((segment) => segment === "armor"), "ไคจูหุ้มเกราะ: แถบพลังเป็นสีเหล็ก");
  const golem = await winBattle(page, "h1");
  assert.deepEqual([golem.story?.beat, golem.story.art[0]], ["win-h1", "st_win_kaiju_10"]);
  assert.ok(golem.turns.every((turn) => [1, 2, 3].includes(turn.source)), "โจทย์ของแมกมาโกเลมมาจากเรื่องที่ 1–3");
  log(`แมพ 3 ด่าน 1 แมกมาโกเลม: ปืนใหญ่ชนะทาง ชนะใน ${golem.turns.length} ตา`);

  // --- ด่าน 2 ฟีนิกซ์เหล็ก (ฟื้นพลัง แพ้ทางแรงกระแทก): ปืนใหญ่พอใช้ได้
  await startBattle(page, "h2", KAIJU3.h2);
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("battle-weak").getAttribute("data-matchup"), "even");
  const phoenix = await winBattle(page, "h2");
  assert.deepEqual([phoenix.story?.beat, phoenix.story.art[0]], ["win-h2", "st_win_kaiju_11"]);
  log(`แมพ 3 ด่าน 2 ฟีนิกซ์เหล็ก: ปืนใหญ่พอใช้ได้ ชนะใน ${phoenix.turns.length} ตา`);

  // บอสสุดท้าย 3 ร่าง
  await startBattle(page, "end", BOSS_FORMS.boss_2);
  const intro = await page.getByTestId("battle-intro").innerText();
  assert.equal(await page.getByTestId("battle-trait").count(), 3);
  assert.match(intro, /กลายร่างได้ 3 ร่าง/);
  assert.match(await page.getByTestId("battle-hints-note").innerText(), /ขอข้อมูลจากพี่บิตได้ 2 ครั้ง/, "แมพ 3 ขอข้อมูลไม่ได้ ชุดนักวิจัยและโมดูลสแกนเนอร์ให้เพิ่มอย่างละ 1 ครั้ง");
  assert.deepEqual(await page.getByTestId("bag-picker").getByTestId("matchup").evaluateAll((rows) => rows.map((row) => row.dataset.matchup)), ["strong", "even", "weak"], "ปืนใหญ่ชนะทางร่างแรก พอใช้ได้กับร่างที่สอง แพ้ทางร่างสุดท้าย");
  assert.match(await page.getByTestId("battle-modules").innerText(), /โมดูลสแกนเนอร์.*โมดูลพยาบาล|โมดูลพยาบาล.*โมดูลสแกนเนอร์/);
  assert.match(await page.getByTestId("battle-perk").innerText(), /ชุดนักวิจัยภาคสนาม/);
  assert.equal(await page.getByTestId("bag-picker").getAttribute("data-bag"), "reboot,analyzer,overcharge");
  assert.equal(await page.getByTestId("weapon-advice").getAttribute("data-weak"), "beam,strike,blade", "บอสใหญ่แต่ละร่างแพ้ทางอาวุธคนละแบบ");
  assert.equal(await page.getByTestId("battle-power").getAttribute("data-recommended"), String(specOf("end").power));
  await shot(page, "34-hard-battle-intro");
  await page.getByTestId("battle-start").click();
  assert.equal(await page.getByTestId("hp-left").getAttribute("data-max"), "9", "แมพ 3: การ์เดียนเริ่มที่พลัง 5 เกราะไททัน +4");
  await page.getByTestId("battle-supply-overcharge").click();
  let turn = await battleTurn(page, true);
  assert.match(turn.log, /การ์เดียนใช้ลำแสงพลาสม่า -2 \(เสริมพลัง ×2\)/);
  assert.ok(await useAnalyzer(page), "บอสใหญ่พลังมาก ต้องมีโจทย์ที่ใช้ชิปวิเคราะห์ได้");
  // ตอบผิดจนพลังหมด: แกนสำรองทำงานเองหนึ่งครั้ง แล้วจึงแพ้
  let rebooted = null;
  for (let guard = 0; guard < 40 && (await page.getByTestId("battle").getAttribute("data-stage")) === "fight"; guard++) {
    turn = await battleTurn(page, false);
    if (/แกนสำรองทำงาน การ์เดียนฟื้นพลัง \+3/.test(turn.log)) rebooted = turn;
  }
  assert.ok(rebooted, "พลังหมดครั้งแรก: แกนสำรองทำงาน");
  assert.equal(rebooted.robot, 3);
  assert.equal((await snap(page)).store.shop.supplies.reboot, 0, "แกนสำรองใช้แล้วหมดไป");
  await page.getByTestId("battle-lost").waitFor();
  assert.match(await page.getByTestId("battle-lost").innerText(), /เริ่มที่โอเมก้า ร่างคลั่งพลังเต็ม ร่างที่ชนะแล้วไม่ต้องสู้ซ้ำ/);
  await page.getByTestId("battle-retry").click();
  const formHp = String(specOf("end").forms[0].hp);
  assert.deepEqual([await page.getByTestId("hp-right").getAttribute("data-hp"), await page.getByTestId("hp-right").getAttribute("data-max")], [formHp, formHp], "แมพ 3: แพ้แล้วร่างปัจจุบันกลับมาพลังเต็ม");

  // เสียพลังหนึ่งครั้งก่อน เพื่อให้เห็นโมดูลพยาบาลทำงานตอนพี่บิตยิงเสริม
  await battleTurn(page, false);
  const turns = [];
  let enraged = false;
  const bossMusic = new Set();
  let cutIns = 0;
  while ((await page.getByTestId("battle").getAttribute("data-stage")) === "fight" && turns.length < 80) {
    enraged ||= (await page.getByTestId("battle-enraged").count()) > 0;
    bossMusic.add(await playing(page));
    cutIns += await page.locator(".battle-cutin").count();
    if (turns.length === 14) await shot(page, "34-hard-battle-form");
    turns.push(await battleTurn(page, true));
  }
  const logs = turns.map((t) => t.log).join(" | ");
  assert.match(logs, /พี่บิตซ่อมการ์เดียน \+1/, "โมดูลพยาบาล: พี่บิตยิงเสริมแล้วซ่อมการ์เดียน");
  assert.match(logs, /กลายร่างเป็นโอเมก้า ร่างสมบูรณ์[\s\S]*กลายร่างเป็นโอเมก้า ร่างจักรพรรดิ/, "บอสกลายร่าง 2 ครั้ง ตามลำดับ");
  assert.match(logs, /เกราะแตกแล้ว/, "ร่างที่ 2 ของบอสใหญ่หุ้มเกราะ");
  assert.match(logs, /ติดสตัน/, "ปืนใหญ่พลาสม่า: ถูก 2 ข้อติดกันคู่ต่อสู้ติดสตัน");
  assert.match(turns.at(-1).log, /ลำแสงแกน AI|พี่บิตยิงเสริม/);
  assert.deepEqual([...new Set(turns.map((t) => t.form))], [0, 1, 2]);
  assert.deepEqual([...new Set(turns.map((t) => t.source))].sort(), [1, 2, 3, 4, 5, 6], "โจทย์ของบอสมาจากทุกเรื่อง");
  assert.ok(enraged, "ร่างสุดท้ายคลั่งเมื่อพลังเหลือครึ่ง");
  assert.ok(["boss:0", "boss:1", "boss:2"].every((track) => bossMusic.has(track)), `เพลงบอสเปลี่ยนตามร่าง: ${[...bossMusic]}`);
  assert.equal(cutIns, 2, "บอสกลายร่างแต่ละครั้งมีภาพเนื้อเรื่องของร่างใหม่ตัดเข้ามา");
  await page.getByTestId("battle-won").waitFor();
  assert.match(await page.getByTestId("battle-won").innerText(), /โอเมก้า ร่างจักรพรรดิ[\s\S]*เมืองปลอดภัยแล้ว/);
  assert.match(await page.getByTestId("battle-credits").innerText(), /\+120/, "บอส 60 × 2 (ไม่ได้โบนัสชนะในครั้งแรก)");
  await shot(page, "34-hard-battle-won");
  await page.getByTestId("battle-finish").click();
  const ending = await readStory(page);
  assert.deepEqual([ending?.beat, ending.art], ["ending-hard", ["st_win_boss_4", "st_ending_2", "st_ending_3", "st_finale"]], "บทส่งท้ายของแมพ 3 คือฉากจบของเกม");
  await backToHall(page);
  assert.match(await page.getByTestId("objective").innerText(), /ปฏิบัติการการ์เดียนสำเร็จทุกแมพแล้ว/);
  log(`แมพ 3 บอสโอเมก้า 3 ร่าง: แบตเตอรี่เสริม ชิปวิเคราะห์ และแกนสำรองใช้ได้ แพ้แล้วร่างปัจจุบันกลับมาพลังเต็ม ชนะครบ 3 ร่างใน ${turns.length} ตา (ร่างสุดท้ายคลั่ง) ได้ 120 เครดิต เห็นฉากจบของเกม`);

  // --- โหลดหน้าใหม่ขณะอยู่แมพ 3 (โถงไม่มีประตูห้อง): ผู้เล่นเริ่มที่หน้าประตูโรงเก็บหุ่น ไม่มี error
  await page.reload();
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  await page.locator('[data-testid="menu-continue"]:not([disabled])').click();
  await inHall(page);
  await page.waitForTimeout(400);
  assert.equal((await snap(page)).store.profile.difficulty, "hard");
  assert.ok((await snap(page)).player, "โถงของแมพ 3 สร้างผู้เล่นได้หลังโหลดหน้าใหม่");

  // --- ใบประกาศอยู่ที่แมพ 1: กลับไปดูได้ และแสดงการปราบไคจูของทุกแมพที่ไปถึง
  await openTravel(page);
  assert.deepEqual(await travelStatus(page), { easy: ["open", "true"], normal: ["open", "true"], hard: ["here", "true"] });
  await shot(page, "34-travel-all-clear");
  await page.getByTestId("travel-close").click();
  await page.waitForTimeout(350);
  assert.equal(await travelTo(page, "easy", 6), null);
  await walkTo(page, "door-6");
  await act(page);
  await inRoom(page, 6);
  await walkTo(page, "core");
  await act(page);
  await page.getByTestId("certificate").waitFor();
  assert.match((await page.getByTestId("certificate-guardian").innerText()).replace(/\s+/g, " "), /แมพ 1: Pixel AI Lab ปราบไคจู 6\/6 ด่าน.*แมพ 2: ศูนย์วิจัยภาคสนาม ปราบไคจู 4\/4 ด่าน.*แมพ 3: ป้อมปราการภูเขาไฟ ปราบไคจู 3\/3 ด่าน/);
  await shot(page, "34-certificate-all-maps");
  await page.getByTestId("certificate-back").click();
  await page.waitForTimeout(350);
  log("จบทั้ง 3 แมพ: กระดานแผนที่แสดงว่าชนะครบทุกแมพ กลับไปแมพ 1 ดูใบประกาศที่แสดงการปราบไคจูของทุกแมพได้");
}

// ---------------------------------------------------------------- คีย์บอร์ดอย่างเดียว (ไม่ใช้เมาส์เลย)

/** กด Tab จนโฟกัสไปถึง element ที่ตรงกับ selector คืนจำนวนครั้งที่กด ล้มเหลวถ้าไปไม่ถึง */
async function tabTo(page, selector, limit = 60) {
  for (let presses = 1; presses <= limit; presses++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector)) return presses;
  }
  const where = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.dataset?.testid ?? ""} / หน้าต่าง: ${window.__aitq?.snapshot().store.overlay ?? "-"} ${window.__aitq?.snapshot().store.storyBeat ?? ""} ${JSON.stringify(window.__aitq?.snapshot().store.story)} ${window.__aitq?.snapshot().store.screen}`);
  throw new Error(`กด Tab ${limit} ครั้งแล้วโฟกัสยังไปไม่ถึง ${selector} (โฟกัสอยู่ที่ ${where})`);
}
const focusInside = (page, testId) => page.evaluate((id) => document.activeElement?.closest(`[data-testid="${id}"]`) !== null, testId);

async function playKeyboard(page) {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__aitq?.snapshot().store.ready);

  // เมนู → ลงทะเบียน → แบบทดสอบก่อนเรียน
  await tabTo(page, '[data-testid="menu-new"]');
  await page.keyboard.press("Enter");
  await page.getByTestId("onboarding").waitFor();
  await tabTo(page, '[data-testid="player-name"]');
  await page.keyboard.type("คีย์บอร์ด one");
  await tabTo(page, '[data-testid="avatar-b"]');
  await page.keyboard.press("Enter");
  assert.equal(await page.getByTestId("avatar-b").getAttribute("aria-checked"), "true");
  // ตัวละคร: ย้อนกลับด้วย Shift+Tab แล้วเลือกด้วย Space ได้ (ไม่มีตัวเลือกระดับความยากแล้ว ทุกคนเริ่มที่แมพ 1)
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "avatar-a");
  await page.keyboard.press("Space");
  assert.equal(await page.getByTestId("avatar-a").getAttribute("aria-checked"), "true");
  await tabTo(page, '[data-testid="avatar-b"]');
  await page.keyboard.press("Enter");
  await tabTo(page, '[data-testid="onboarding-next"]');
  await page.keyboard.press("Enter");
  await page.getByTestId("pretest").waitFor();
  for (let i = 0; i < 12; i++) {
    // ตอบผิดทุกข้อ (ระดับเริ่มต้นของเควสจึงเป็นประคอง): Tab ไปที่ตัวเลือกแรกที่ไม่ใช่คำตอบที่ถูก
    const right = assessmentAnswer(await page.getByTestId("choice").getAttribute("data-item"));
    let presses = 0;
    for (; presses < 12; presses++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((text) => document.activeElement?.dataset.testid === "choice-option" && document.activeElement.innerText !== text, right)) break;
    }
    assert.ok(presses <= 6, "โฟกัสต้องอยู่ในบัตรโจทย์ ไม่หลุดไปที่อื่น");
    await page.keyboard.press(i % 2 ? "Enter" : "Space");
    await page.waitForTimeout(60);
  }
  await tabTo(page, '[data-testid="assessment-finish"]');
  await page.keyboard.press("Enter");
  await inHall(page);
  assert.deepEqual([(await snap(page)).store.profile.name, (await snap(page)).store.profile.avatar], ["คีย์บอร์ด one", "b"], "พิมพ์ตัวอักษรที่เป็นปุ่มของเกม (e, o, n และเว้นวรรค) ในช่องชื่อได้");
  // บทนำของเนื้อเรื่อง: โฟกัสอยู่ในหน้าต่าง อ่านต่อด้วย Enter จนจบ
  await page.getByTestId("story").waitFor();
  assert.ok(await focusInside(page, "story"), "ฉากเนื้อเรื่อง: โฟกัสย้ายเข้าหน้าต่าง");
  await tabTo(page, '[data-testid="story-next"]');
  for (let guard = 0; guard < 10 && (await page.getByTestId("story").count()); guard++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
  }
  assert.deepEqual((await snap(page)).store.story, ["prologue"]);
  assert.deepEqual(Object.values((await snap(page)).store.pretest.correctByTopic), Array(6).fill(0));
  log("คีย์บอร์ดอย่างเดียว: เมนู ลงทะเบียน เลือกตัวละครและระดับความยาก แบบทดสอบก่อนเรียน 12 ข้อ และบทนำของเนื้อเรื่อง ทำได้ด้วย Tab / Enter / Space");

  // HUD: เปิดสมุดเควสด้วยคีย์บอร์ด โฟกัสอยู่ในหน้าต่าง วน Tab ไม่หลุด ปิดด้วย Esc แล้วโฟกัสกลับที่เดิม
  await page.waitForTimeout(300);
  const before = (await snap(page)).player;
  await tabTo(page, '[data-testid="hud-sound"]');
  await page.keyboard.press("Space");
  assert.equal(await page.getByTestId("hud-sound").getAttribute("aria-pressed"), "false", "ปิดเสียงด้วยคีย์บอร์ดได้");
  // ปุ่มบน HUD ปล่อยโฟกัสหลังกด (Space ถัดไปเป็นของเกม) จึง Tab กลับไปที่ปุ่มอีกครั้ง
  await tabTo(page, '[data-testid="hud-sound"]');
  await page.keyboard.press("Space");
  assert.equal(await page.getByTestId("hud-sound").getAttribute("aria-pressed"), "true");
  await tabTo(page, '[data-testid="hud-questlog"]');
  await page.keyboard.press("Space");
  await page.getByTestId("questlog").waitFor();
  assert.equal((await snap(page)).store.screen, "hall", "Space บนปุ่มของ HUD ต้องไม่ไปสั่งโต้ตอบในฉากเกม");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await focusInside(page, "questlog"), "Tab ต้องวนอยู่ในหน้าต่างที่เปิดอยู่");
  }
  await page.keyboard.press("Escape");
  assert.equal((await snap(page)).store.overlay, null);
  await page.waitForTimeout(400);
  assert.deepEqual((await snap(page)).player, before, "ระหว่างเปิดหน้าต่าง ตัวละครต้องไม่ขยับ");

  // เข้าห้อง 1 ฟังสถานีแรกด้วยปุ่มลูกศร ย้อนหน้า และปิดด้วย Esc
  await page.evaluate(() => document.activeElement?.blur());
  await walkTo(page, "door-1");
  await act(page);
  // บรรยายสรุปของห้อง: ข้ามด้วย Esc ได้ และถูกบันทึกว่าดูแล้ว
  const skipped = await inRoom(page, 1, () => page.keyboard.press("Escape"));
  assert.equal(skipped?.beat, "room-1");
  assert.ok((await snap(page)).store.story.includes("room-1"));
  await walkTo(page, "station-0");
  await page.keyboard.press("Enter");
  await page.getByTestId("dialogue").waitFor();
  const firstPage = await page.getByTestId("dialogue-body").innerText();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(80);
  assert.notEqual(await page.getByTestId("dialogue-body").innerText(), firstPage);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(80);
  assert.equal(await page.getByTestId("dialogue-body").innerText(), firstPage, "ปุ่มลูกศรซ้ายย้อนหน้าได้");
  await page.keyboard.press("Escape");
  assert.equal((await snap(page)).store.overlay, null);
  assert.equal((await snap(page)).store.progress[1].stationsSeen, 0, "ปิดกลางคัน: ยังไม่นับว่าฟังจบ");
  await page.waitForTimeout(400);
  for (let i = 0; i < stationsCount(1); i++) {
    await walkTo(page, `station-${i}`);
    await page.keyboard.press("e");
    await page.getByTestId("dialogue").waitFor();
    for (let guard = 0; guard < 40 && (await page.getByTestId("dialogue").count()); guard++) {
      await page.keyboard.press(guard % 2 ? "Space" : "Enter");
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(350);
  }
  assert.equal((await snap(page)).store.progress[1].stationsSeen, stationsCount(1));

  // เควสจับคู่ด้วยคีย์บอร์ด: Tab ไปที่บัตร Enter เพื่อหยิบ Tab ไปที่ช่อง Enter เพื่อวาง
  await walkTo(page, "minigame");
  await page.keyboard.press("e");
  await page.getByTestId("minigame").waitFor();
  assert.ok(await focusInside(page, "minigame"), "เปิดเควส: โฟกัสย้ายเข้าหน้าต่างเควส");
  // ระดับประคอง (ก่อนเรียนตอบผิดทุกข้อ) แจกบัตรทีละชุด จึงหยิบบัตรใบแรกที่ Tab ไปถึง
  assert.equal(await page.getByTestId("minigame").getAttribute("data-tier"), "assist");
  for (let placed = 0; placed < terms.length; placed++) {
    await tabTo(page, '[data-testid="match-card"]');
    const label = await page.evaluate(() => document.activeElement.dataset.label);
    await page.keyboard.press("Enter");
    await tabTo(page, `[data-testid="match-slot"][data-label=${attr(definitionOf(label))}]`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
  }
  await tabTo(page, '[data-testid="minigame-finish"]');
  await page.keyboard.press("Enter");
  assert.equal((await snap(page)).store.progress[1].stars, 3);

  // คำถามทบทวนแบบเลือกตอบด้วยคีย์บอร์ด: Tab ไปที่ตัวเลือก Enter เพื่อตอบ โฟกัสย้ายไปปุ่มข้อต่อไปเอง
  await page.waitForTimeout(400);
  await walkTo(page, "review");
  await page.keyboard.press("e");
  const reviewRoot = page.getByTestId("review");
  await reviewRoot.waitFor();
  assert.ok(await focusInside(page, "review"), "เปิดคำถามทบทวน: โฟกัสย้ายเข้าหน้าต่าง");
  let reviewed = 0;
  for (; reviewed < 20 && !(await page.getByTestId("review-finished").count()); reviewed++) {
    if ((await reviewRoot.getAttribute("data-kind")) === "truth") {
      const truth = reviewCandidates(1, await page.getByTestId("review-truth-card").innerText()).includes(await page.getByTestId("review-truth-candidate").innerText());
      await tabTo(page, `[data-testid="${truth ? "review-true" : "review-false"}"]`);
    } else {
      const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
      const options = await page.getByTestId("choice-option").allInnerTexts();
      const candidates = cardText ? reviewCandidates(1, cardText) : [poolAnswer(1, battlePools(1), cardText, options)];
      const right = options.find((option) => candidates.includes(option));
      for (let presses = 0; presses < 30; presses++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate((text) => document.activeElement?.dataset.testid === "choice-option" && document.activeElement.innerText === text, right)) break;
      }
    }
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    assert.match(await page.getByTestId("review-feedback").innerText(), /ถูกต้อง/);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "review-next", "ตอบแล้วโฟกัสย้ายไปปุ่มข้อต่อไป");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
  await tabTo(page, '[data-testid="review-save"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const saved = (await snap(page)).store.progress[1];
  assert.equal(saved.reviewDone, true);
  assert.deepEqual([reviewed, saved.review], [6, { correct: 6, total: 6 }], "ตอบคำถามทบทวน 6 ข้อด้วยคีย์บอร์ดอย่างเดียว");
  await walkTo(page, "core");
  await page.keyboard.press("Space");
  await page.getByTestId("reward").waitFor();
  assert.ok(await focusInside(page, "reward"));
  await page.keyboard.press("Escape");
  assert.equal((await snap(page)).store.progress[1].core, true);
  log("คีย์บอร์ดอย่างเดียว: เดิน โต้ตอบ บทสนทนา (ลูกศร/Enter/Space/Esc) เควสจับคู่ คำถามทบทวน และรับแกน AI โฟกัสไม่หลุดจากหน้าต่างที่เปิดอยู่");

  // ด่านต่อสู้ด้วยคีย์บอร์ด: Tab ไปที่ตัวเลือก Enter เพื่อตอบ โฟกัสย้ายไปปุ่มข้อต่อไปเอง
  await page.waitForTimeout(400);
  await goToHangar(page);
  await walkTo(page, "console");
  await page.keyboard.press("e");
  await page.getByTestId("missions").waitFor();
  assert.ok(await focusInside(page, "missions"), "เปิดแผงสั่งปฏิบัติการ: โฟกัสย้ายเข้าหน้าต่าง");
  await tabTo(page, '[data-testid="mission-go-k1"]');
  await page.keyboard.press("Enter");
  await page.getByTestId("battle").waitFor();
  assert.ok(await focusInside(page, "battle"), "เปิดด่านต่อสู้: โฟกัสย้ายเข้าหน้าต่าง");
  await tabTo(page, '[data-testid="battle-start"]');
  await page.keyboard.press("Enter");
  let turns = 0;
  for (; turns < 20 && (await page.getByTestId("battle").getAttribute("data-stage")) === "fight"; turns++) {
    const cardText = (await page.getByTestId("choice-card").count()) ? await page.getByTestId("choice-card").innerText() : "";
    const options = await page.getByTestId("choice-option").allInnerTexts();
    const right = poolAnswer(1, battlePools(1), cardText, options);
    for (let presses = 0; presses < 30; presses++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((text) => document.activeElement?.dataset.testid === "choice-option" && document.activeElement.innerText === text, right)) break;
    }
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "battle-next", "ตอบแล้วโฟกัสย้ายไปปุ่มข้อต่อไป");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
  await page.getByTestId("battle-won").waitFor();
  await tabTo(page, '[data-testid="battle-finish"]');
  await page.keyboard.press("Enter");
  // ฉากเนื้อเรื่องหลังชนะ: อ่านต่อด้วยคีย์บอร์ดจนจบ
  await page.getByTestId("story").waitFor();
  assert.ok(await focusInside(page, "story"));
  await tabTo(page, '[data-testid="story-next"]');
  for (let guard = 0; guard < 6 && (await page.getByTestId("story").count()); guard++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(350);
  assert.ok((await snap(page)).store.story.includes("win-k1"));
  assert.equal((await snap(page)).store.battles.k1.won, true);
  log(`คีย์บอร์ดอย่างเดียว: เดินไปโรงเก็บหุ่นและชนะด่านต่อสู้ที่ 1 ใน ${turns} ตา ด้วย Tab / Enter`);
}

// ---------------------------------------------------------------- มือถือ

async function playTouch(browser) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  watch(page);
  const cdp = await context.newCDPSession(page);
  const hold = async (locator, ms) => {
    const b = await locator.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await page.waitForTimeout(ms);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(60);
  };

  await page.goto(BASE_URL);
  await onboard(page, { name: "มือถือ", topic1Correct: 0, tap: true });
  await page.getByTestId("touch-controls").waitFor();
  const before = (await snap(page)).player;
  await hold(page.getByRole("button", { name: "เดินขวา" }), 500);
  assert.ok((await snap(page)).player.x > before.x + 30, "ปุ่มเดินขวาต้องทำให้ตัวละครเดิน");
  await hold(page.getByRole("button", { name: "เดินซ้าย" }), 700);
  await hold(page.getByRole("button", { name: "เดินขึ้น" }), 700);
  assert.match((await snap(page)).store.prompt ?? "", /เข้าห้อง 1/);
  await assertCanvasFits(page, "มือถือแนวนอน");
  await shot(page, "19-touch-landscape");
  await hold(page.getByRole("button", { name: "แตะ" }), 60);
  assert.equal((await inRoom(page, 1, (locator) => locator.tap()))?.beat, "room-1");
  log("มือถือแนวนอน: ทำขั้นเริ่มเกมและอ่านเนื้อเรื่องด้วยการแตะ ปุ่มทิศทางและปุ่ม A ใช้เดินและเข้าห้องได้");

  // ด่านต่อสู้บนจอมือถือแนวนอน: ฉาก โจทย์ และปุ่มต้องอยู่ในจอโดยไม่ล้นแนวนอน
  await page.evaluate(() => window.__aitq.store.getState().openBattle("k1"));
  await page.getByTestId("battle-start").tap();
  await page.getByTestId("choice-option").first().waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "ด่านต่อสู้ไม่ล้นจอแนวนอน");
  await shot(page, "19-touch-battle");
  await page.getByTestId("choice-option").first().tap();
  await page.getByTestId("battle-next").tap();
  await page.getByTestId("battle-retreat").tap();
  await page.waitForTimeout(350);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const canvas = await page.locator("#game-root canvas").boundingBox();
  assert.ok(Math.abs(canvas.width - 390) < 2 && canvas.y < 80, "จอแนวตั้ง: ฉากเกมต้องเต็มความกว้างและอยู่ด้านบน");
  await assertCanvasFits(page, "มือถือแนวตั้ง");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await assertCanvasFits(page, "หมุนกลับเป็นแนวนอน");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await assertCanvasFits(page, "หมุนเป็นแนวตั้งอีกครั้ง");
  await hold(page.getByRole("button", { name: "เดินขวา" }), 600);
  await hold(page.getByRole("button", { name: "แตะ" }), 60);
  await page.getByTestId("dialogue").waitFor();
  await shot(page, "20-touch-portrait-dialogue");
  await page.getByTestId("dialogue-next").tap();
  log("มือถือแนวตั้ง: ฉากอยู่ด้านบนเต็มความกว้าง เปิดบทสนทนาด้วยปุ่ม A ได้");

  // หน้าต่างใหม่บนจอมือถือ (ข้ามไปเปิดด้วยทางลัดของสคริปต์ถ่ายภาพ): คำถามทบทวน กระดานแผนที่ กระดานตกแต่ง ต้องไม่ล้นจอ แตะตอบได้ และผ่านการตรวจการเข้าถึง
  const fits = async (name) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: หน้าจอต้องไม่เลื่อนแนวนอน`);
  await page.evaluate(() => {
    const store = window.__aitq.store;
    store.getState().closeOverlay();
    store.setState({ progress: { 1: { ...store.getState().progress[1], stationsSeen: 5, minigameDone: true, stars: 3 } } });
    store.getState().openOverlay("review");
  });
  await page.getByTestId("review").waitFor();
  await fits("คำถามทบทวน (แนวตั้ง)");
  await shot(page, "20-touch-portrait-review");
  if ((await page.getByTestId("review").getAttribute("data-kind")) === "truth") await page.getByTestId("review-true").tap();
  else await page.getByTestId("choice-option").first().tap();
  assert.notEqual(await page.getByTestId("review-feedback").innerText(), "", "แตะตอบคำถามทบทวนได้");
  await page.getByTestId("review-next").tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  await fits("คำถามทบทวน (แนวนอน)");
  await shot(page, "20-touch-landscape-review");
  await page.getByTestId("review-close").tap();
  for (const overlay of ["travel", "decor"]) {
    await page.evaluate((name) => {
      window.__aitq.store.getState().exitToHall();
      window.__aitq.store.getState().openOverlay(name);
    }, overlay);
    await page.getByTestId(overlay).waitFor();
    await page.waitForTimeout(300);
    await fits(overlay);
    await shot(page, `20-touch-landscape-${overlay}`);
    await page.getByTestId(`${overlay}-close`).tap();
    await page.waitForTimeout(200);
    assert.equal((await snap(page)).store.overlay, null);
  }
  log("มือถือ: คำถามทบทวนแบบเลือกตอบ กระดานแผนที่ และกระดานตกแต่งไม่ล้นจอ แตะตอบได้ ผ่านการตรวจการเข้าถึง");
  await context.close();
}

// E2E_ONLY=struggle,touch รันเฉพาะบางชุด: main (เล่นจบ 6 ห้องของแมพ 1 + แดชบอร์ด + ระดับท้าทาย ซึ่งต้องรันต่อกัน), struggle, normal (แมพ 2), hard (แมพ 3), keyboard, touch
const only = process.env.E2E_ONLY?.split(",");
const wanted = (name) => !only || only.includes(name);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  watch(page);
  if (wanted("main")) {
    console.log("เดสก์ท็อป 1280×720: เล่นจบทั้ง 6 ห้อง");
    await playRoom1(page);
    for (const room of [2, 3, 4, 5]) await playRoom(page, room);
    await playField(page);
    console.log("แดชบอร์ดผู้สอน (/teacher)");
    await playTeacher(page);
    console.log("เดสก์ท็อป: ระดับท้าทาย");
    await playChallenge(page);
  }
  if (wanted("struggle")) {
    console.log("เดสก์ท็อป: ผู้เรียนที่ตอบผิดมาก (ห้อง 2–4)");
    await playStruggle(page);
  }
  if (wanted("normal")) {
    console.log("เดสก์ท็อป: แมพ 2 ศูนย์วิจัยภาคสนาม (เดินทางข้ามแมพ ตกแต่งโถง 3 ห้อง บอส 2 ร่าง)");
    await playNormal(page);
  }
  if (wanted("hard")) {
    console.log("เดสก์ท็อป: แมพ 3 ป้อมปราการ (ไม่มีห้องเรียน ไคจู 2 ตัว บอส 3 ร่าง)");
    await playHard(page);
  }
  if (wanted("keyboard")) {
    console.log("เดสก์ท็อป: คีย์บอร์ดอย่างเดียว");
    await playKeyboard(page);
  }
  await page.close();
  if (wanted("touch")) {
    console.log("มือถือ (จอสัมผัส)");
    await playTouch(browser);
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- รายงานการเข้าถึง
writeFileSync(`${SHOTS}/a11y-report.json`, JSON.stringify(a11y, null, 2));
const violations = a11y.flatMap((screen) => screen.violations.map((v) => ({ screen: screen.screen, ...v })));
const minFont = a11y.reduce((min, screen) => (screen.minFont < min.minFont ? screen : min), { minFont: Infinity, minText: "", screen: "-" });
const smallTargets = [...new Set(a11y.flatMap((screen) => screen.small))];
console.log(`การเข้าถึง (axe-core, WCAG 2.2 A/AA) ${a11y.length} หน้าจอ`);
console.log(`  ${violations.length === 0 ? "✓" : "✗"} ข้อบกพร่อง ${violations.length} รายการ`);
for (const v of violations) console.log(`    - [${v.screen}] ${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map((n) => `        ${n.target} ${n.summary ?? ""}`).join("\n")}`);
console.log(`  ✓ ตัวอักษรเล็กที่สุด ${minFont.minFont}px ("${minFont.minText}" ในหน้า ${minFont.screen})`);
console.log(`  ${smallTargets.length === 0 ? "✓" : "✗"} เป้ากดที่เล็กกว่า 24×24px: ${smallTargets.length === 0 ? "ไม่มี" : smallTargets.join(", ")}`);
if (violations.length > 0 || minFont.minFont < 12 || smallTargets.length > 0) errors.push("ไม่ผ่านการตรวจการเข้าถึง (ดู test-results/a11y-report.json)");

if (errors.length > 0) {
  console.error(`พบ error ในเบราว์เซอร์ ${errors.length} รายการ`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("ผ่านทั้งหมด ไม่มี error ใน console ของเบราว์เซอร์");
