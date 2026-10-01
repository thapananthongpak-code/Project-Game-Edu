// สร้างโจทย์แบบเลือกตอบจากเนื้อหาใน course.json ตามชุดโจทย์ที่ quests.json อ้าง (ฟังก์ชันล้วน)
// ใช้กับแบบทดสอบก่อนเรียน/หลังเรียน (GDD ข้อ 7.1) และการฝึกในห้องซ่อม (GDD ข้อ 7.3)
// ข้อความบนบัตรและตัวเลือกทุกชิ้นเป็นข้อความจาก course.json ตรงตัว ไม่มีข้อความใหม่
import { course, quests, stripNumber, topicOf } from "./index";
import type { AssessmentItem, BackupPool, FormId } from "./schema";

export type Rng = () => number;

export interface ChoiceItem {
  /** รหัสข้อของแบบทดสอบ (โจทย์ห้องซ่อมไม่มี) */
  id?: string;
  topic: number;
  /** ป้ายเล็กเหนือบัตร เช่น ชื่อคอลัมน์ของเซลล์ (ว่างได้) */
  caption: string;
  /** ข้อความบนบัตร (ว่างเมื่อโจทย์ถามจากตัวเลือกอย่างเดียว) */
  card: string;
  /** สิ่งที่ถาม: pick = เลือก label ที่ตรงกับบัตร, column = เลือกหัวคอลัมน์ที่บัตรอยู่, first = เลือกข้อที่มาก่อน */
  ask: { type: "pick"; label: string } | { type: "column" } | { type: "first" };
  options: string[];
  answer: number;
}

/** ตัวสุ่มที่ให้ลำดับเดิมจาก seed เดิม ใช้ในเทสต์ */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** โจทย์ทั้งหมดที่ชุดโจทย์นี้สร้างได้ สลับลำดับแล้ว */
export function buildChoiceItems(topicId: number, pool: BackupPool, rng: Rng = Math.random): ChoiceItem[] {
  const topic = topicOf(topicId);
  const items: ChoiceItem[] = [];

  switch (pool.kind) {
    case "match-table-cells": {
      const table = topic.tables[pool.table];
      const rows = pool.sample ? shuffled(range(table.rows.length), rng).slice(0, pool.sample) : range(table.rows.length);
      for (const column of pool.columns) {
        for (const row of rows) {
          items.push({
            topic: topicId,
            caption: table.headers[column],
            card: table.rows[row][column],
            ask: { type: "pick", label: table.headers[0] },
            options: rows.map((r) => table.rows[r][0]),
            answer: rows.indexOf(row),
          });
        }
      }
      break;
    }
    case "sort-table-cells": {
      const table = topic.tables[pool.table];
      for (const row of pool.rows ?? range(table.rows.length)) {
        pool.columns.forEach((column, answer) => {
          items.push({
            topic: topicId,
            caption: table.rows[row][0],
            card: table.rows[row][column],
            ask: { type: "column" },
            options: pool.columns.map((c) => table.headers[c]),
            answer,
          });
        });
      }
      break;
    }
    case "step-pairs": {
      for (let first = 0; first < topic.sections.length; first++) {
        for (let second = first + 1; second < topic.sections.length; second++) {
          const order = shuffled([first, second], rng);
          items.push({
            topic: topicId,
            caption: "",
            card: "",
            ask: { type: "first" },
            // ตัดเลขนำหน้าออก ไม่เช่นนั้นเลขจะเฉลยลำดับ
            options: order.map((i) => stripNumber(topic.sections[i].heading)),
            answer: order.indexOf(first),
          });
        }
      }
      break;
    }
    case "accuracy-example":
      // โจทย์คำนวณไม่ใช่โจทย์เลือกตอบ ยังไม่มีห้องที่เล่นได้ใช้ชุดนี้
      break;
  }
  return shuffled(items, rng);
}

/** ข้อสอบหนึ่งข้อจากรายการใน quests.json ตัวเลือกสลับลำดับต่อผู้เรียน เนื้อหาข้อเดียวกันทุกคน */
export function buildAssessmentItem(spec: AssessmentItem, rng: Rng = Math.random): ChoiceItem {
  const topic = topicOf(spec.topic);
  const base = { id: spec.id, topic: spec.topic };
  const pick = (correct: string, others: string[]) => {
    const options = shuffled([correct, ...others], rng);
    return { options, answer: options.indexOf(correct) };
  };
  switch (spec.kind) {
    case "cell-row": {
      const table = topic.tables[spec.table];
      const names = table.rows.map((row) => row[0]);
      return { ...base, caption: table.headers[spec.column], card: table.rows[spec.row][spec.column], ask: { type: "pick", label: table.headers[0] }, ...pick(names[spec.row], names.filter((_, i) => i !== spec.row)) };
    }
    case "cell-column": {
      const table = topic.tables[spec.table];
      const others = spec.columns.filter((column) => column !== spec.column).map((column) => table.headers[column]);
      return { ...base, caption: table.rows[spec.row][0], card: table.rows[spec.row][spec.column], ask: { type: "column" }, ...pick(table.headers[spec.column], others) };
    }
    case "row-cell": {
      const table = topic.tables[spec.table];
      return { ...base, caption: table.headers[0], card: table.rows[spec.row][0], ask: { type: "pick", label: table.headers[spec.column] }, ...pick(table.rows[spec.row][spec.column], spec.distractors.map((row) => table.rows[row][spec.column])) };
    }
    case "section-order": {
      // ตัดเลขนำหน้าออก ไม่เช่นนั้นเลขจะเฉลยลำดับ
      const [earlier, later] = [Math.min(spec.first, spec.second), Math.max(spec.first, spec.second)].map((i) => stripNumber(topic.sections[i].heading));
      return { ...base, caption: "", card: "", ask: { type: "first" }, ...pick(earlier, [later]) };
    }
    case "quest-step-order": {
      const steps = course.finalQuest.steps;
      return { ...base, caption: "", card: "", ask: { type: "first" }, ...pick(steps[Math.min(spec.first, spec.second)], [steps[Math.max(spec.first, spec.second)]]) };
    }
  }
}

/** แบบทดสอบทั้งชุด เรียงตามลำดับในรายการ (เรียงตามสมรรถนะ) */
export function buildAssessment(form: FormId, rng: Rng = Math.random): ChoiceItem[] {
  return quests.assessment[form].map((spec) => buildAssessmentItem(spec, rng));
}

/** โจทย์ฝึกของห้องซ่อมจากชุดสำรองของห้องนั้น */
export function buildRepairItems(room: number, rng: Rng = Math.random): ChoiceItem[] {
  const backup = quests.rooms.find((r) => r.room === room)?.backup ?? [];
  return backup.flatMap((pool) => buildChoiceItems(room, pool, rng));
}
