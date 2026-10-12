import { describe, expect, it } from "vitest";
import { DASH, DASH_ENTRY, dashCredits, dashDue, dashKindOf, dashPassed, wavesOf, waveHits } from "./dash";
import { emptyRoom } from "./progressStore";

describe("ด่านทางเชื่อม (GDD 22)", () => {
  it("ชนิดของด่านสลับตามห้อง: คี่หลบสิ่งกีดขวาง คู่หลบพลังไคจู", () => {
    expect([1, 2, 3, 4, 5, 6].map(dashKindOf)).toEqual(["obstacles", "blast", "obstacles", "blast", "obstacles", "blast"]);
  });

  it.each([1, 2, 3, 4, 5, 6].flatMap((zone) => (["obstacles", "blast"] as const).map((kind) => [zone, kind] as const)))("ห้อง %i %s: ทุกคลื่นมีช่องปลอดภัย เรียงตามเวลา จบก่อนหมดเวลา และเลื่อนไปช่องปลอดภัยถัดไปทัน", (zone, kind) => {
    const waves = wavesOf(kind, zone);
    expect(waves.length).toBeGreaterThanOrEqual(10);
    let previous: number[] | null = null;
    let previousAt = 0;
    for (const wave of waves) {
      const safe = [0, 1, 2].filter((lane) => !waveHits(wave, lane));
      expect(safe.length, `at ${wave.at}`).toBeGreaterThanOrEqual(1);
      expect(wave.at).toBeGreaterThan(previousAt);
      if (previous) {
        const gap = wave.at - previousAt;
        expect(gap).toBeGreaterThanOrEqual(1.2);
        // จากช่องปลอดภัยใด ๆ ของคลื่นก่อนหน้า ไปถึงช่องปลอดภัยของคลื่นนี้ทัน (ใช้เวลาข้ามช่องละ laneMoveS)
        for (const from of previous) expect(Math.min(...safe.map((to) => Math.abs(to - from))) * DASH.laneMoveS).toBeLessThan(gap);
      }
      previous = safe;
      previousAt = wave.at;
    }
    expect(previousAt).toBeLessThan(DASH.duration - 1);
  });

  it("ผ่านด่านเมื่อโดนน้อยกว่า 3 ครั้ง", () => {
    expect([0, 1, 2, 3].map(dashPassed)).toEqual([true, true, true, false]);
  });

  it("เล่นเฉพาะการเข้าห้องครั้งแรก: มีความคืบหน้าแล้ว ผ่านแล้ว ข้ามแล้ว หรือตั้งค่าข้ามทุกด่านจะไม่ถูกบังคับเล่น", () => {
    const base = { map: "easy", zone: 2, topics: [2], progress: {}, done: [] } as const;
    expect(dashDue(base)).toBe(true);
    expect(dashDue({ ...base, progress: { 2: emptyRoom() } })).toBe(true);
    expect(dashDue({ ...base, progress: { 2: { ...emptyRoom(), stationsSeen: 1 } } })).toBe(false);
    expect(dashDue({ ...base, progress: { 2: { ...emptyRoom(), core: true } } })).toBe(false);
    expect(dashDue({ ...base, done: ["easy:2"] })).toBe(false);
    expect(dashDue({ ...base, done: ["easy:2:s"] })).toBe(false);
    expect(dashDue({ ...base, done: ["easy:3"] })).toBe(true);
    expect(dashDue({ ...base, done: ["skip"] })).toBe(false);
    // ห้องที่มีสองหัวข้อ: ทำหัวข้อไหนไปแล้วก็ไม่ใช่การเข้าครั้งแรก
    expect(dashDue({ ...base, topics: [1, 2], progress: { 1: { ...emptyRoom(), stationsSeen: 2 } } })).toBe(false);
  });

  it("เครดิตนับเฉพาะด่านที่ผ่าน ไม่นับที่ข้ามและค่าตั้งข้ามทั้งหมด", () => {
    expect(dashCredits(["easy:1", "easy:2:s", "normal:1", "skip"])).toBe(2 * DASH.reward);
    expect(dashCredits([])).toBe(0);
  });

  it("รูปแบบรหัสในบันทึก", () => {
    for (const ok of ["easy:1", "normal:12", "hard:3:s", "skip"]) expect(DASH_ENTRY.test(ok), ok).toBe(true);
    for (const bad of ["easy", "moon:1", "easy:1:x", "easy:123", "SKIP", ""]) expect(DASH_ENTRY.test(bad), bad).toBe(false);
  });
});
