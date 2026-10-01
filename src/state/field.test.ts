import { describe, expect, it } from "vitest";
import { course } from "../content";
import { accuracyPercent, emptyField, fieldStatus, fieldTotals, validCorrect, validImages } from "./field";

const quest = course.finalQuest;
const filled = () => ({
  ready: true,
  steps: quest.steps.map(() => true),
  results: [
    { images: 30, correct: 8 },
    { images: 35, correct: 10 },
    { images: 32, correct: 7 },
  ],
  notes: ["ผิดเมื่อแสงน้อยและมืออยู่ไกลกล้อง", "ภาพฝึกส่วนใหญ่ถ่ายในที่สว่าง", "เก็บภาพเพิ่มในที่แสงน้อยแล้วฝึกใหม่"],
  evidence: { image: null, outsideGame: true },
});

describe("accuracyPercent: (ถูก ÷ ทดสอบ) × 100", () => {
  it("ตรงกับตัวอย่างและโจทย์ในเอกสาร", () => {
    expect(accuracyPercent(24, 30)).toBe(80);
    expect(accuracyPercent(18, 30)).toBe(60);
  });
  it("รายคลาสทดสอบ 10 ครั้ง", () => {
    expect(accuracyPercent(8, 10)).toBe(80);
    expect(accuracyPercent(0, 10)).toBe(0);
    expect(accuracyPercent(10, 10)).toBe(100);
  });
  it("ปัดทศนิยม 1 ตำแหน่ง", () => {
    expect(accuracyPercent(25, 30)).toBe(83.3);
    expect(accuracyPercent(20, 30)).toBe(66.7);
  });
});

describe("fieldTotals: แถวรวมของตารางบันทึกผล", () => {
  it("รวมภาพฝึก ครั้งทดสอบ 30 ครั้งที่ถูก และ Accuracy รวม", () => {
    expect(fieldTotals(filled().results, quest)).toEqual({ images: 97, tests: 30, correct: 25, accuracy: 83.3 });
  });
  it("ยังกรอกไม่ครบ: ยังไม่มีผลรวม", () => {
    const results = [{ images: 30, correct: 8 }, { images: null, correct: null }, { images: 30, correct: 5 }];
    expect(fieldTotals(results, quest)).toEqual({ images: null, tests: 30, correct: null, accuracy: null });
  });
});

describe("การตรวจช่องกรอก", () => {
  it("ภาพฝึกต้องเป็นจำนวนเต็มอย่างน้อยตามที่ขั้นตอนปฏิบัติกำหนด (30)", () => {
    expect(quest.minImagesPerClass).toBe(30);
    expect(validImages(30, quest)).toBe(true);
    expect(validImages(29, quest)).toBe(false);
    expect(validImages(30.5, quest)).toBe(false);
    expect(validImages(null, quest)).toBe(false);
  });
  it("ครั้งที่ถูกต้องเป็นจำนวนเต็ม 0 ถึงจำนวนครั้งทดสอบ (10)", () => {
    expect(validCorrect(0, quest)).toBe(true);
    expect(validCorrect(10, quest)).toBe(true);
    expect(validCorrect(11, quest)).toBe(false);
    expect(validCorrect(-1, quest)).toBe(false);
    expect(validCorrect(2.5, quest)).toBe(false);
  });
});

describe("fieldStatus: เงื่อนไขจบภารกิจ (GDD 6.5)", () => {
  it("เริ่มต้น: ยังไม่ผ่านสักข้อ", () => {
    expect(fieldStatus(emptyField(quest), quest, 20)).toEqual({ ready: false, checklist: false, results: false, notes: false, evidence: false, complete: false });
  });
  it("ครบทุกข้อ: จบภารกิจ แม้ Accuracy ต่ำ (เอกสารไม่ได้กำหนดขั้นต่ำ)", () => {
    expect(fieldStatus(filled(), quest, 20).complete).toBe(true);
    const low = { ...filled(), results: filled().results.map((r) => ({ ...r, correct: 0 })) };
    expect(fieldStatus(low, quest, 20).complete).toBe(true);
  });
  it.each([
    ["ติ๊กเช็คลิสต์ไม่ครบ", (f: ReturnType<typeof filled>) => ({ ...f, steps: f.steps.map((_, i) => i < 5) }), "checklist"],
    ["ภาพฝึกน้อยกว่า 30", (f: ReturnType<typeof filled>) => ({ ...f, results: [{ images: 29, correct: 8 }, ...f.results.slice(1)] }), "results"],
    ["บันทึกสั้นเกินไป", (f: ReturnType<typeof filled>) => ({ ...f, notes: ["สั้น", ...f.notes.slice(1)] }), "notes"],
    ["ไม่มีหลักฐาน", (f: ReturnType<typeof filled>) => ({ ...f, evidence: { image: null, outsideGame: false } }), "evidence"],
  ] as const)("%s: ยังไม่จบ", (_name, change, failing) => {
    const status = fieldStatus(change(filled()), quest, 20);
    expect(status[failing]).toBe(false);
    expect(status.complete).toBe(false);
  });
});
