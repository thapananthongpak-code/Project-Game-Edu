import { describe, expect, it } from "vitest";
import { GUIDE_STEPS, guideDue, TIP_ENTRY, tipDue } from "./guide";
import { emptyRoom } from "./progressStore";

const fresh = { tips: [] as string[], hasPretest: true, storySeen: ["prologue"], progress: {}, battles: {}, replay: false };

describe("ไกด์นำทาง (GDD 23)", () => {
  it("สอนเล่นเฉพาะผู้เล่นใหม่ที่ดูบทนำแล้ว", () => {
    expect(guideDue(fresh)).toBe(true);
    expect(guideDue({ ...fresh, hasPretest: false })).toBe(false);
    expect(guideDue({ ...fresh, storySeen: [] })).toBe(false);
  });

  it("ผู้เล่นเดิมที่มีความคืบหน้าไม่ถูกสอน เว้นแต่ขอดูอีกครั้ง และจบหรือข้ามแล้วไม่ขึ้นอีก", () => {
    const veteran = { ...fresh, progress: { 1: { ...emptyRoom(), stationsSeen: 2 } } };
    expect(guideDue(veteran)).toBe(false);
    expect(guideDue({ ...veteran, replay: true })).toBe(true);
    expect(guideDue({ ...veteran, battles: { k1: {} } })).toBe(false);
    expect(guideDue({ ...fresh, tips: ["tutorial"] })).toBe(false);
    expect(guideDue({ ...fresh, tips: ["tutorial"], replay: true })).toBe(false);
  });

  it("คำแนะนำของแต่ละที่แสดงครั้งเดียว ปิดทั้งหมดได้", () => {
    expect(tipDue("market", [])).toBe("market");
    expect(tipDue("market", ["tip:market"])).toBe(null);
    expect(tipDue("lab", ["tip:market"])).toBe("lab");
    expect(tipDue("hall", [])).toBe(null);
    expect(tipDue("room", ["tips-off"])).toBe(null);
  });

  it("มี 4 ขั้น และรหัสในบันทึกตามรูปแบบ", () => {
    expect(GUIDE_STEPS).toHaveLength(4);
    for (const ok of ["tutorial", "tips-off", "tip:room", "tip:lab"]) expect(TIP_ENTRY.test(ok), ok).toBe(true);
    for (const bad of ["tip:moon", "tip", "Tutorial", "tip:room:x"]) expect(TIP_ENTRY.test(bad), bad).toBe(false);
  });
});
