import { describe, expect, it } from "vitest";
import { buildAssessment, buildChoiceItems, buildRepairItems, seededRng } from "./choices";
import { course } from "./index";

const table = (topic: number) => course.topics[topic - 1].tables[0];

describe("buildAssessment: แบบทดสอบก่อนเรียน/หลังเรียนคู่ขนาน", () => {
  const forms = { A: buildAssessment("A", seededRng(7)), B: buildAssessment("B", seededRng(8)) };
  const topicText = (topic: number) => JSON.stringify([course.topics[topic - 1], topic === 6 ? course.finalQuest.steps : []]);

  it.each(["A", "B"] as const)("ชุด %s: 12 ข้อ สมรรถนะละ 2 ข้อ ครบทั้ง 6 สมรรถนะ มีรหัสข้อไม่ซ้ำ", (form) => {
    expect(forms[form].map((i) => i.topic)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(new Set(forms[form].map((i) => i.id)).size).toBe(12);
  });

  it("ข้อความบนบัตรและตัวเลือกทุกชิ้นมาจากเนื้อหาของหัวข้อนั้นใน course.json ตรงตัว", () => {
    for (const item of [...forms.A, ...forms.B]) {
      const source = topicText(item.topic);
      for (const text of [item.caption, item.card, ...item.options]) {
        if (text) expect(source).toContain(JSON.stringify(text).slice(1, -1));
      }
    }
  });

  it("สองชุดไม่มีข้อที่เนื้อหาเดียวกัน แต่วัดด้วยรูปแบบคำถามเดียวกันต่อสมรรถนะ", () => {
    const content = (item: (typeof forms.A)[number]) => `${item.topic}|${item.card}|${[...item.options].sort().join("/")}`;
    const inA = new Set(forms.A.map(content));
    for (const item of forms.B) expect(inA.has(content(item))).toBe(false);
    expect(forms.A.map((i) => `${i.topic}:${i.ask.type}`)).toEqual(forms.B.map((i) => `${i.topic}:${i.ask.type}`));
  });

  it("เฉลยตรงกับต้นฉบับ", () => {
    const byId = Object.fromEntries([...forms.A, ...forms.B].map((item) => [item.id, item.options[item.answer]]));
    expect(byId).toMatchObject({
      A1a: "โปรแกรมแบบกำหนดกฎ", A1b: "Machine Learning", B1a: "Machine Learning", B1b: "โปรแกรมแบบกำหนดกฎ",
      A2a: "Supervised", A2b: "Reinforcement", B2a: "Unsupervised", B2b: "Supervised",
      A3a: "มีโครงสร้าง", A3b: "ไม่มีโครงสร้าง", B3a: "ไม่มีโครงสร้าง", B3b: "มีโครงสร้าง",
      A4a: "เก็บรวบรวมข้อมูล Data Collection", A4b: "ฝึกโมเดล Training", B4a: "จัดเตรียมและทำความสะอาดข้อมูล Data Preparation", B4b: "ประเมินผล Evaluation",
      A5a: "ช่วยตรวจสอบผู้ใช้เพื่อปลดล็อก", A5b: "คัดกรองอีเมลที่อาจเป็นสแปม", B5a: "รู้จำคำพูดและช่วยตอบสนองคำสั่ง", B5b: "เสนอสินค้าที่อาจตรงความสนใจ",
    });
    expect(byId.A6a).toBe(course.finalQuest.steps[1]);
    expect(byId.A6b).toBe(course.finalQuest.steps[4]);
    expect(byId.B6a).toBe(course.finalQuest.steps[0]);
    expect(byId.B6b).toBe(course.finalQuest.steps[2]);
  });

  it("ตัวเลือกสลับลำดับต่อผู้เรียน แต่เนื้อหาข้อเดิม", () => {
    const other = buildAssessment("A", seededRng(99));
    expect(other.map((i) => [i.id, i.options[i.answer]])).toEqual(forms.A.map((i) => [i.id, i.options[i.answer]]));
  });
});

describe("เฉลยของแต่ละชนิดโจทย์ตรงกับตารางในต้นฉบับ", () => {
  it("match-table-cells: เซลล์ของแถวใด คำตอบคือชื่อแถวนั้น", () => {
    const t = table(1);
    for (const item of buildChoiceItems(1, { kind: "match-table-cells", table: 0, columns: [1, 2] }, seededRng(1))) {
      const row = t.rows.find((r) => r.includes(item.card));
      expect(item.options[item.answer]).toBe(row?.[0]);
    }
  });

  it("sort-table-cells: เซลล์อยู่ใต้หัวคอลัมน์ใด คำตอบคือหัวคอลัมน์นั้น", () => {
    const t = table(3);
    const items = buildChoiceItems(3, { kind: "sort-table-cells", table: 0, columns: [1, 2] }, seededRng(2));
    expect(items).toHaveLength(6);
    for (const item of items) {
      const row = t.rows.find((r) => r.includes(item.card)) as string[];
      expect(item.options[item.answer]).toBe(t.headers[row.indexOf(item.card)]);
    }
  });

  it("step-pairs: ไม่มีเลขนำหน้าในตัวเลือก และคำตอบคือขั้นตอนที่มาก่อนในต้นฉบับ", () => {
    const headings = course.topics[3].sections.map((s) => s.heading.replace(/^\d+\s+/, ""));
    const items = buildChoiceItems(4, { kind: "step-pairs" }, seededRng(4));
    expect(items).toHaveLength(15);
    for (const item of items) {
      const [a, b] = item.options.map((o) => headings.indexOf(o));
      expect(a).not.toBe(-1);
      expect(b).not.toBe(-1);
      expect(item.options[item.answer]).toBe(headings[Math.min(a, b)]);
      for (const option of item.options) expect(option).not.toMatch(/^\d/);
    }
  });
});

describe("buildRepairItems (GDD 7.3)", () => {
  it("ห้อง 1: 4 ข้อจากตารางเปรียบเทียบ", () => {
    expect(buildRepairItems(1, seededRng(5))).toHaveLength(4);
  });
});
