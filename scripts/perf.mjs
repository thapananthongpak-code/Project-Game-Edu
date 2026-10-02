// วัดประสิทธิภาพบนเครื่องสเปกต่ำแบบจำลอง: ถ่วง CPU และเครือข่ายของ Chrome แล้ววัดเวลาโหลด ขนาดที่ดาวน์โหลด และเฟรมเรตตอนเดินในฉาก
// ใช้กับ build จริง:  npm run build && npx vite preview --port 4173   แล้วรัน: npm run test:perf
// ผลเป็นการจำลองบนเครื่องที่รันสคริปต์ ไม่ใช่การวัดบนอุปกรณ์จริง ใช้ดูแนวโน้มและจับการถดถอย
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = process.env.PERF_URL ?? "http://localhost:4173/";
const PROFILES = [
  { name: "เดสก์ท็อป (ไม่ถ่วง)", viewport: { width: 1366, height: 768 }, cpu: 1, network: null },
  { name: "โน้ตบุ๊กสเปกต่ำ (CPU ช้าลง 4 เท่า, เน็ต 1.6 Mbps)", viewport: { width: 1366, height: 768 }, cpu: 4, network: { download: 1.6, upload: 0.75, latency: 150 } },
  { name: "มือถือระดับล่าง (CPU ช้าลง 6 เท่า, เน็ต 1.6 Mbps)", viewport: { width: 740, height: 360 }, cpu: 6, network: { download: 1.6, upload: 0.75, latency: 150 }, mobile: true },
];
/** เกณฑ์ขั้นต่ำที่ยอมรับ */
const LIMITS = { fps: 30, loadSeconds: 15, transferKb: 3000 };

async function measure(browser, profile) {
  const context = await browser.newContext({ viewport: profile.viewport, hasTouch: Boolean(profile.mobile), isMobile: Boolean(profile.mobile), deviceScaleFactor: profile.mobile ? 2 : 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (profile.network) {
    const bytes = (mbps) => (mbps * 1024 * 1024) / 8;
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: profile.network.latency, downloadThroughput: bytes(profile.network.download), uploadThroughput: bytes(profile.network.upload) });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  let transfer = 0;
  let requests = 0;
  cdp.on("Network.loadingFinished", (event) => {
    transfer += event.encodedDataLength;
    requests += 1;
  });

  const started = Date.now();
  await page.goto(BASE_URL, { waitUntil: "commit" });
  await page.locator('[data-testid="menu-new"]:not([disabled])').waitFor({ timeout: 120000 });
  const loadMs = Date.now() - started;
  const press = (locator) => (profile.mobile ? locator.tap() : locator.click());

  // เข้าเกม: ลงทะเบียนและทำแบบทดสอบก่อนเรียน (เลือกตัวเลือกแรกทุกข้อ)
  await press(page.getByTestId("menu-new"));
  await page.getByTestId("player-name").fill("วัดผล");
  await press(page.getByTestId("onboarding-next"));
  for (let i = 0; i < 12; i++) {
    const before = await page.getByTestId("assessment-progress").innerText();
    await press(page.getByTestId("choice-option").first());
    if (i < 11) await page.waitForFunction((old) => document.querySelector('[data-testid="assessment-progress"]')?.textContent !== old, before);
  }
  await press(page.getByTestId("assessment-finish"));
  await page.getByTestId("objective").waitFor();
  await page.waitForTimeout(500);

  // เดินไปมาในโถง 4 วินาที นับเฟรมและงานที่บล็อกเธรดหลักเกิน 50 ms
  await page.evaluate(() => {
    window.__perf = { frames: 0, worst: 0, long: 0, last: performance.now() };
    const tick = (now) => {
      window.__perf.frames += 1;
      window.__perf.worst = Math.max(window.__perf.worst, now - window.__perf.last);
      window.__perf.last = now;
      window.__perf.raf = requestAnimationFrame(tick);
    };
    window.__perf.raf = requestAnimationFrame(tick);
    new PerformanceObserver((list) => (window.__perf.long += list.getEntries().length)).observe({ entryTypes: ["longtask"] });
  });
  const walkStarted = Date.now();
  for (const key of ["ArrowRight", "ArrowLeft"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(2000);
    await page.keyboard.up(key);
  }
  const seconds = (Date.now() - walkStarted) / 1000;
  const perf = await page.evaluate(() => {
    cancelAnimationFrame(window.__perf.raf);
    return { frames: window.__perf.frames, worst: window.__perf.worst, long: window.__perf.long, heap: performance.memory?.usedJSHeapSize ?? 0 };
  });
  await context.close();
  return {
    profile: profile.name,
    loadSeconds: Math.round(loadMs / 100) / 10,
    transferKb: Math.round(transfer / 1024),
    requests,
    fps: Math.round((perf.frames / seconds) * 10) / 10,
    worstFrameMs: Math.round(perf.worst),
    longTasks: perf.long,
    heapMb: Math.round(perf.heap / 1024 / 1024),
  };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const profile of PROFILES) results.push(await measure(browser, profile));
} finally {
  await browser.close();
}
console.table(results);
writeFileSync("test-results/perf-report.json", JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.fps < LIMITS.fps || r.loadSeconds > LIMITS.loadSeconds || r.transferKb > LIMITS.transferKb);
if (failed.length > 0) {
  console.error(`ไม่ผ่านเกณฑ์ (เฟรมเรต ≥ ${LIMITS.fps}, โหลด ≤ ${LIMITS.loadSeconds} วินาที, ดาวน์โหลด ≤ ${LIMITS.transferKb} KB): ${failed.map((r) => r.profile).join(", ")}`);
  process.exit(1);
}
console.log("ผ่านเกณฑ์ทุกโปรไฟล์");
