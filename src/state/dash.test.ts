import { describe, expect, it } from "vitest";
import { DASH, DASH_ENTRY, dashCredits } from "./dash";

// ด่านทางเชื่อมเลิกใช้ในรอบ 20 (GDD ข้อ 22) เหลือแค่บันทึกเดิมที่ยังนับเครดิต
describe("ด่านทางเชื่อม: บันทึกเดิม (GDD 22)", () => {
  it("เครดิตนับเฉพาะด่านที่เคยผ่าน ไม่นับที่ข้ามและค่าตั้งข้ามทั้งหมด", () => {
    expect(dashCredits(["easy:1", "easy:2:s", "normal:1", "skip"])).toBe(2 * DASH.reward);
    expect(dashCredits([])).toBe(0);
  });

  it("รูปแบบรหัสในบันทึกเดิม", () => {
    for (const ok of ["easy:1", "normal:12", "hard:3:s", "skip"]) expect(DASH_ENTRY.test(ok), ok).toBe(true);
    for (const bad of ["easy", "moon:1", "easy:1:x", "easy:123", "SKIP", ""]) expect(DASH_ENTRY.test(bad), bad).toBe(false);
  });
});
