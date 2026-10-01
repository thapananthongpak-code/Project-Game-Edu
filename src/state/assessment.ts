// คะแนนแบบทดสอบก่อนเรียน/หลังเรียน และคะแนนพัฒนาการ (docs/EVALUATION_PLAN.md) เป็นฟังก์ชันล้วน
import type { FormId } from "../content/schema";
import type { AssessmentResult } from "./progressStore";

export const otherForm = (form: FormId): FormId => (form === "A" ? "B" : "A");

/** ผลรายข้อ -> ผลการทดสอบหนึ่งครั้ง topics = หัวข้อทั้งหมดที่ชุดนี้วัด (หัวข้อที่ไม่ถูกเลยได้ 0) */
export function scoreAssessment(form: FormId, items: AssessmentResult["items"], topics: readonly number[], completedAt: string): AssessmentResult {
  const correctByTopic: Record<number, number> = {};
  for (const topic of topics) correctByTopic[topic] = 0;
  for (const item of items) if (item.correct) correctByTopic[item.topic] = (correctByTopic[item.topic] ?? 0) + 1;
  return { form, correctByTopic, items, completedAt };
}

export const totalCorrect = (result: AssessmentResult): number => Object.values(result.correctByTopic).reduce((sum, n) => sum + n, 0);

export interface Gain {
  pre: number;
  post: number;
  /** คะแนนเต็มของแต่ละครั้ง */
  max: number;
  /** คะแนนพัฒนาการ = หลังเรียน − ก่อนเรียน */
  gain: number;
  /** พัฒนาการสัมพัทธ์ = (หลัง − ก่อน) ÷ (เต็ม − ก่อน) เป็น null เมื่อก่อนเรียนได้เต็ม */
  normalized: number | null;
  /** รายสมรรถนะ (หัวข้อ) */
  byTopic: { topic: number; pre: number; post: number; gain: number; max: number }[];
}

/** คะแนนพัฒนาการของผู้เรียนหนึ่งคน คืน null ถ้ายังทำไม่ครบทั้งก่อนเรียนและหลังเรียน */
export function gainOf(pre: AssessmentResult | null, post: AssessmentResult | null, itemsPerTopic: number): Gain | null {
  if (!pre || !post) return null;
  const topics = [...new Set([...Object.keys(pre.correctByTopic), ...Object.keys(post.correctByTopic)].map(Number))].sort((a, b) => a - b);
  const byTopic = topics.map((topic) => {
    const before = pre.correctByTopic[topic] ?? 0;
    const after = post.correctByTopic[topic] ?? 0;
    return { topic, pre: before, post: after, gain: after - before, max: itemsPerTopic };
  });
  const sum = (key: "pre" | "post") => byTopic.reduce((total, row) => total + row[key], 0);
  const max = topics.length * itemsPerTopic;
  const before = sum("pre");
  const after = sum("post");
  return { pre: before, post: after, max, gain: after - before, normalized: max === before ? null : Math.round(((after - before) / (max - before)) * 100) / 100, byTopic };
}
