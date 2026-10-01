import { describe, expect, it } from "vitest";
import { course } from "./index";
import { reviewBlocks, reviewFieldCount } from "./review";

describe("reviewBlocks: สมุดบันทึกของแต่ละห้อง (GDD 5)", () => {
  it("ห้อง 1: คำถามเปิด 2 ข้อ ข้อละ 1 ช่อง ขั้นต่ำ 20 ตัวอักษร", () => {
    const blocks = reviewBlocks(1);
    expect(blocks.map((b) => b.question)).toEqual(course.topics[0].reviewQuestions.map((q) => q.question));
    expect(blocks.every((b) => b.fields.length === 1 && b.fields[0].minChars === 20 && b.facts.length === 0)).toBe(true);
  });

  it("ห้อง 2: แสดงประเภทที่ถูกของแต่ละกรณี แล้วให้อธิบายเหตุผล 3 ช่อง", () => {
    const blocks = reviewBlocks(2);
    expect(blocks.map((b) => b.facts[0])).toEqual([
      { label: "ประเภท", value: "Supervised" },
      { label: "ประเภท", value: "Unsupervised" },
      { label: "ประเภท", value: "Reinforcement" },
    ]);
    expect(reviewFieldCount(2)).toBe(3);
  });

  it("ห้อง 3: ผลจำแนก 4 รายการจากมินิเกม และ 1 ช่องสำหรับส่วนหลังคำว่า จากนั้น", () => {
    const [block] = reviewBlocks(3);
    expect(block.facts).toEqual([
      { label: "ตารางยอดขาย", value: "มีโครงสร้าง" },
      { label: "ภาพผลไม้", value: "ไม่มีโครงสร้าง" },
      { label: "เสียงพูด", value: "ไม่มีโครงสร้าง" },
      { label: "ข้อความรีวิว", value: "ไม่มีโครงสร้าง" },
    ]);
    expect(block.fields).toEqual([{ label: "เสนอวิธีปรับคุณภาพข้อมูลหนึ่งตัวอย่าง", minChars: 20, short: false }]);
  });

  it("ห้อง 4: โจทย์คำนวณตอบในมินิเกมแล้ว (60%) เหลือคำถามเปิด 2 ข้อ", () => {
    const blocks = reviewBlocks(4);
    expect(blocks[1].fields).toEqual([]);
    expect(blocks[1].facts).toEqual([{ label: "(18 ÷ 30) × 100", value: "60%" }]);
    expect(reviewFieldCount(4)).toBe(2);
  });

  it("ห้อง 5: ฟอร์ม 2 ตัวอย่าง ตัวอย่างละ 4 ช่อง และคำอธิบาย 1 ช่อง รวม 9 ช่อง", () => {
    const [block] = reviewBlocks(5);
    expect(block.fields.map((f) => f.label)).toEqual([
      "บริการที่พบในชีวิตประจำวัน 1", "ข้อมูลนำเข้า 1", "ผลลัพธ์ 1", "ข้อจำกัด 1",
      "บริการที่พบในชีวิตประจำวัน 2", "ข้อมูลนำเข้า 2", "ผลลัพธ์ 2", "ข้อจำกัด 2",
      "อธิบายว่าการเปิดไฟด้วยสวิตช์ธรรมดาต่างจากระบบที่เรียนรู้พฤติกรรมผู้ใช้อย่างไร",
    ]);
    expect(block.fields.slice(0, 8).every((f) => f.short && f.minChars === 3)).toBe(true);
    expect(block.fields[8]).toMatchObject({ short: false, minChars: 20 });
  });

  it("ห้อง 6: ไม่มีคำถามทบทวน", () => {
    expect(reviewBlocks(6)).toEqual([]);
  });
});
