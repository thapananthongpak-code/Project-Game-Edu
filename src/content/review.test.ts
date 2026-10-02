import { describe, expect, it } from "vitest";
import { seededRng } from "./choices";
import { course } from "./index";
import { buildReview, REVIEW_SIZE, reviewCorrect } from "./review";

const texts = new Set<string>();
for (const topic of course.topics) {
  for (const section of topic.sections) {
    texts.add(section.heading.replace(/^\d+\s+/, ""));
    for (const term of section.terms ?? []) texts.add(term.term).add(term.definition);
  }
  for (const table of topic.tables) {
    for (const header of table.headers) texts.add(header);
    for (const row of table.rows) for (const cell of row) texts.add(cell);
  }
  for (const question of topic.reviewQuestions) {
    texts.add(question.question);
    for (const item of question.items ?? []) texts.add(item);
  }
}

describe("คำถามทบทวนแบบเลือกตอบ (GDD 4.5)", () => {
  it("หัวข้อ 1–5 มีคำถามทบทวนอย่างน้อย 3 ข้อ ไม่เกินจำนวนที่กำหนด หัวข้อ 6 ไม่มี (ใช้ภารกิจภาคสนาม)", () => {
    for (const topic of [1, 2, 3, 4, 5]) {
      const review = buildReview(topic, seededRng(topic));
      expect(review.length, `หัวข้อ ${topic}`).toBeGreaterThanOrEqual(3);
      expect(review.length).toBeLessThanOrEqual(REVIEW_SIZE);
    }
  });

  it("ทุกข้อความบนบัตรและตัวเลือกมาจาก course.json ตรงตัว ไม่มีข้อความที่แต่งขึ้น", () => {
    for (const topic of [1, 2, 3, 4, 5]) {
      for (const seed of [1, 2, 3]) {
        for (const { item } of buildReview(topic, seededRng(seed))) {
          if (item.card) expect(texts.has(item.card), item.card).toBe(true);
          if (item.caption) expect(texts.has(item.caption), item.caption).toBe(true);
          for (const option of item.options) expect(texts.has(option), option).toBe(true);
          expect(item.answer).toBeGreaterThanOrEqual(0);
          expect(item.answer).toBeLessThan(item.options.length);
        }
      }
    }
  });

  it("มีครบสามแบบเมื่อรวมทุกหัวข้อ: จับคู่ เชื่อมโยง และถูกหรือผิด", () => {
    const kinds = new Set([1, 2, 3, 4, 5].flatMap((topic) => buildReview(topic, seededRng(7)).map((entry) => entry.kind)));
    expect([...kinds].sort()).toEqual(["link", "match", "truth"]);
  });

  it("กิจกรรมทบทวนของต้นฉบับถูกถามในรูปเลือกตอบ: กรณีศึกษาของหัวข้อ 2 และรายการให้จำแนกของหัวข้อ 3", () => {
    const cases = course.topics[1].reviewQuestions.map((q) => q.question);
    const asked2 = new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => buildReview(2, seededRng(seed)).map((entry) => entry.item.card)));
    for (const text of cases) expect(asked2.has(text), text).toBe(true);
    const items = course.topics[2].reviewQuestions[0].items ?? [];
    const asked3 = new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => buildReview(3, seededRng(seed)).map((entry) => entry.item.card)));
    for (const text of items) expect(asked3.has(text), text).toBe(true);
  });

  it("ถูกหรือผิด: คู่ที่วางตรงกับเฉลยต้องตอบว่าถูก คู่ที่ไม่ตรงต้องตอบว่าผิด และมีทั้งสองแบบ", () => {
    const truths = [1, 2, 3, 4, 5].flatMap((topic) => [1, 2, 3, 4, 5, 6].flatMap((seed) => buildReview(topic, seededRng(seed)))).filter((entry) => entry.kind === "truth");
    expect(truths.length).toBeGreaterThan(5);
    for (const entry of truths) {
      const real = entry.candidate === entry.item.answer;
      expect(reviewCorrect(entry, real ? 1 : 0)).toBe(true);
      expect(reviewCorrect(entry, real ? 0 : 1)).toBe(false);
      expect(entry.item.card).not.toBe("");
    }
    expect(new Set(truths.map((entry) => entry.candidate === entry.item.answer)).size).toBe(2);
  });

  it("จับคู่และเชื่อมโยง: ถูกเมื่อเลือกตัวเลือกตามเฉลย", () => {
    for (const entry of buildReview(1, seededRng(3)).filter((e) => e.kind !== "truth")) {
      expect(reviewCorrect(entry, entry.item.answer)).toBe(true);
      expect(reviewCorrect(entry, (entry.item.answer + 1) % entry.item.options.length)).toBe(false);
    }
  });
});
