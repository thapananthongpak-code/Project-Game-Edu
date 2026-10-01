// ภารกิจภาคสนามห้อง 6 (GDD ข้อ 6): การคำนวณ Accuracy และเงื่อนไขจบเกม เป็นฟังก์ชันล้วน
import type { FinalQuest } from "../content/schema";

export interface FieldResult {
  /** จำนวนภาพฝึกของคลาส */
  images: number | null;
  /** จำนวนครั้งที่ทำนายถูกจากการทดสอบ testsPerClass ครั้ง */
  correct: number | null;
}

export interface FieldProgress {
  /** ยืนยันว่าเตรียมอุปกรณ์แล้ว */
  ready: boolean;
  /** เช็คลิสต์ขั้นตอนปฏิบัติ เรียงตาม finalQuest.steps */
  steps: boolean[];
  /** ผลของแต่ละคลาส เรียงตาม finalQuest.resultTable.classes */
  results: FieldResult[];
  /** คำตอบของบันทึกเพิ่มเติม เรียงตาม finalQuest.notes.prompts */
  notes: string[];
  /**
   * ภาพหน้าจอ (data URL) หรือยืนยันว่าส่งให้ครูนอกเกม ภาพเก็บในเครื่องของผู้เรียนเท่านั้น
   * onDevice = สำเนาในฐานข้อมูลกลางบอกว่ามีภาพแนบอยู่ที่เครื่องของผู้เรียน
   */
  evidence: { image: string | null; outsideGame: boolean; onDevice?: boolean };
}

export function emptyField(quest: FinalQuest): FieldProgress {
  return {
    ready: false,
    steps: quest.steps.map(() => false),
    results: quest.resultTable.classes.map(() => ({ images: null, correct: null })),
    notes: (quest.notes?.prompts ?? []).map(() => ""),
    evidence: { image: null, outsideGame: false },
  };
}

/** ความแม่นยำ = (จำนวนครั้งที่ทำนายถูก ÷ จำนวนครั้งทดสอบทั้งหมด) × 100 ตามสูตรในเอกสาร ปัดทศนิยม 1 ตำแหน่ง */
export function accuracyPercent(correct: number, tests: number): number {
  return tests > 0 ? Math.round((correct / tests) * 1000) / 10 : 0;
}

const isWhole = (value: number | null): value is number => value !== null && Number.isInteger(value);

export const validImages = (value: number | null, quest: FinalQuest): value is number => isWhole(value) && value >= (quest.minImagesPerClass ?? 1);

export const validCorrect = (value: number | null, quest: FinalQuest): value is number =>
  isWhole(value) && value >= 0 && value <= quest.resultTable.testsPerClass;

export interface FieldTotals {
  images: number | null;
  tests: number;
  correct: number | null;
  /** null จนกว่าจะกรอกครั้งที่ถูกครบทุกคลาส */
  accuracy: number | null;
}

/** แถวรวมของตารางบันทึกผล */
export function fieldTotals(results: readonly FieldResult[], quest: FinalQuest): FieldTotals {
  const tests = quest.resultTable.testsPerClass * quest.resultTable.classes.length;
  const allCorrect = results.every((r) => validCorrect(r.correct, quest));
  const allImages = results.every((r) => validImages(r.images, quest));
  const correct = allCorrect ? results.reduce((sum, r) => sum + (r.correct as number), 0) : null;
  return {
    images: allImages ? results.reduce((sum, r) => sum + (r.images as number), 0) : null,
    tests,
    correct,
    accuracy: correct === null ? null : accuracyPercent(correct, tests),
  };
}

export interface FieldStatus {
  ready: boolean;
  checklist: boolean;
  results: boolean;
  notes: boolean;
  evidence: boolean;
  complete: boolean;
}

/** เงื่อนไขจบภารกิจ (GDD ข้อ 6.5 ข้อ 2–5) ไม่มี Accuracy ขั้นต่ำ เพราะเอกสารไม่ได้กำหนด */
export function fieldStatus(field: FieldProgress, quest: FinalQuest, minNoteChars: number): FieldStatus {
  const status = {
    ready: field.ready,
    checklist: field.steps.length === quest.steps.length && field.steps.every(Boolean),
    results: field.results.length === quest.resultTable.classes.length && field.results.every((r) => validImages(r.images, quest) && validCorrect(r.correct, quest)),
    notes: field.notes.length > 0 && field.notes.every((note) => note.trim().length >= minNoteChars),
    evidence: field.evidence.image !== null || field.evidence.outsideGame || field.evidence.onDevice === true,
  };
  return { ...status, complete: Object.values(status).every(Boolean) };
}
