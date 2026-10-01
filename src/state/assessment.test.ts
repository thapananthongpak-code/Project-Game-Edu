import { describe, expect, it } from "vitest";
import { gainOf, otherForm, scoreAssessment, totalCorrect } from "./assessment";

const topics = [1, 2, 3, 4, 5, 6];
const result = (form: "A" | "B", correctIds: string[]) =>
  scoreAssessment(
    form,
    topics.flatMap((topic) => ["a", "b"].map((suffix) => ({ id: `${form}${topic}${suffix}`, topic, correct: correctIds.includes(`${topic}${suffix}`), timeMs: 1000 }))),
    topics,
    "2026-10-02T00:00:00.000Z",
  );

describe("scoreAssessment", () => {
  it("นับข้อถูกต่อสมรรถนะ สมรรถนะที่ไม่ถูกเลยได้ 0", () => {
    const pre = result("A", ["1a", "1b", "3a"]);
    expect(pre.correctByTopic).toEqual({ 1: 2, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0 });
    expect(totalCorrect(pre)).toBe(3);
  });
});

describe("gainOf: คะแนนพัฒนาการ (หลังเรียน − ก่อนเรียน)", () => {
  it("ต่อคน: คะแนนรวม พัฒนาการ และพัฒนาการสัมพัทธ์", () => {
    const gain = gainOf(result("A", ["1a", "3a", "4a"]), result("B", ["1a", "1b", "2a", "3a", "3b", "4a", "4b", "5a", "6a"]), 2);
    expect(gain).toMatchObject({ pre: 3, post: 9, max: 12, gain: 6, normalized: 0.67 });
  });

  it("ต่อสมรรถนะ: 6 ข้อ แต่ละข้อเต็ม 2", () => {
    const gain = gainOf(result("A", ["1a", "1b", "2a"]), result("B", ["1a", "2a", "2b", "6a", "6b"]), 2);
    expect(gain?.byTopic).toEqual([
      { topic: 1, pre: 2, post: 1, gain: -1, max: 2 },
      { topic: 2, pre: 1, post: 2, gain: 1, max: 2 },
      { topic: 3, pre: 0, post: 0, gain: 0, max: 2 },
      { topic: 4, pre: 0, post: 0, gain: 0, max: 2 },
      { topic: 5, pre: 0, post: 0, gain: 0, max: 2 },
      { topic: 6, pre: 0, post: 2, gain: 2, max: 2 },
    ]);
  });

  it("ก่อนเรียนได้เต็ม: พัฒนาการสัมพัทธ์คำนวณไม่ได้ (null)", () => {
    const all = topics.flatMap((t) => [`${t}a`, `${t}b`]);
    expect(gainOf(result("A", all), result("B", all), 2)).toMatchObject({ gain: 0, normalized: null });
  });

  it("ยังทำไม่ครบสองครั้ง: null", () => {
    expect(gainOf(result("A", []), null, 2)).toBeNull();
    expect(gainOf(null, null, 2)).toBeNull();
  });
});

describe("otherForm", () => {
  it("หลังเรียนใช้ชุดที่ไม่ได้ทำตอนก่อนเรียน", () => {
    expect(otherForm("A")).toBe("B");
    expect(otherForm("B")).toBe("A");
  });
});
