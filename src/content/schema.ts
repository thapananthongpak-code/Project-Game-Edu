// โครงสร้างของ src/content/course.json และ src/content/quests.json
// ฟิลด์ที่มี ? ใน course.json คือส่วนที่เพิ่มจาก schema ตั้งต้น เพื่อเก็บข้อความในต้นฉบับที่ไม่มีช่องรองรับ
// หรือข้อมูลที่แยกจากประโยคในต้นฉบับให้มินิเกมใช้ (ดู docs/GDD.md ข้อ 9.2)

// ---------------------------------------------------------------- course.json

export type ReviewQuestionType = "open" | "activity";

export interface CourseInfo {
  /** รหัสวิชา เช่น "21906-2001" */
  code: string;
  title: string;
  /** ชื่อหน่วยการเรียนรู้ */
  unit: string;
}

/** คำศัพท์กับนิยามที่แยกจากประโยค "คำ (English) คือนิยาม" ใน body */
export interface Term {
  term: string;
  definition: string;
}

/** ตัวเลขของโจทย์หรือตัวอย่างคำนวณความแม่นยำที่อ่านจากประโยค */
export interface AccuracyCase {
  correct: number;
  total: number;
  /** มีเมื่อต้นฉบับให้คำตอบไว้ (ตัวอย่างคำนวณ) ไม่มีเมื่อเป็นโจทย์ */
  percent?: number;
}

export interface Section {
  /** ชื่อหัวข้อย่อยตามต้นฉบับ รวมเลขนำหน้า เช่น "1 ความสัมพันธ์ระหว่าง AI และ ML" */
  heading: string;
  /** ย่อหน้าคั่นด้วย "\n\n" ขึ้นบรรทัดใหม่ในย่อหน้าเดียวกันคั่นด้วย "\n" เป็น "" ได้เมื่อเนื้อหาของหัวข้อย่อยเป็นตารางล้วน */
  body: string;
  terms?: Term[];
  accuracyCase?: AccuracyCase;
}

export interface ContentTable {
  caption: string;
  /** ตำแหน่งของตาราง: index ของ sections ที่ตารางนี้อยู่ */
  sectionIndex?: number;
  /** ตารางอยู่ก่อนหรือหลัง body ของหัวข้อย่อยนั้นในต้นฉบับ */
  placement?: "before-body" | "after-body";
  headers: string[];
  rows: string[][];
}

export interface ReviewQuestion {
  question: string;
  type: ReviewQuestionType;
  /** รายการที่คำถามให้จำแนก แยกจากประโยคคำถาม */
  items?: string[];
  accuracyCase?: AccuracyCase;
  /** กิจกรรมแบบฟอร์ม: ให้เลือก subject จำนวน examples ตัวอย่าง แล้วระบุ aspects ของแต่ละตัวอย่าง */
  form?: { subject: string; examples: number; aspects: string[] };
  /** ส่วนของคำถามหลังคำว่า "จากนั้น" ที่ให้เขียนตอบ */
  followUp?: string;
}

export interface Topic {
  /** เลขหัวข้อ 1-6 ตรงกับลำดับห้องในเกม */
  id: number;
  title: string;
  minutes: number;
  objective: string;
  /** ย่อหน้านำก่อนหัวข้อย่อยแรก */
  intro?: string;
  sections: Section[];
  tables: ContentTable[];
  /** ชื่อหัวข้อส่วนทบทวนตามต้นฉบับ เช่น "คำถามทบทวน" หรือ "กิจกรรมทบทวน" */
  reviewHeading?: string;
  /** คำสั่งนำที่ใช้ร่วมกันทุกข้อใน reviewQuestions */
  reviewInstruction?: string;
  reviewQuestions: ReviewQuestion[];
}

export interface ResultTable {
  classes: string[];
  testsPerClass: number;
}

export interface GradingCriterion {
  criterion: string;
  weightPercent: number;
}

export interface FinalQuest {
  tool: string;
  url: string;
  steps: string[];
  /** จำนวนภาพฝึกขั้นต่ำต่อคลาส อ่านจากขั้นตอนปฏิบัติ */
  minImagesPerClass?: number;
  /** สูตรความแม่นยำตามบรรทัดในเอกสาร */
  accuracyFormula?: string;
  /** ส่วนบันทึกใต้ตารางผล: ชื่อส่วน และคำถามนำแต่ละข้อ */
  notes?: { label: string; prompts: string[] };
  resultTable: ResultTable;
  gradingCriteria: GradingCriterion[];
}

export interface Course {
  course?: CourseInfo;
  topics: Topic[];
  finalQuest: FinalQuest;
}

// ---------------------------------------------------------------- quests.json
// ตั้งค่ามินิเกมของห้อง 1-5 เก็บเฉพาะเฉลยและตำแหน่งอ้างอิง (index) ห้ามมีข้อความบทเรียน
// index ทุกตัวอ้างถึง topics[room - 1] ใน course.json

/** ตำแหน่งเนื้อหาในหัวข้อของห้องนั้น */
export type ContentRef = { intro: true } | { section: number } | { table: number };

interface MinigameBase {
  /** จำนวนชิ้นต่อชุดในระดับประคอง */
  assistBatch?: number;
  /** แผงอ้างอิงที่เปิดอ่านได้ระหว่างเล่น */
  reference?: ContentRef[];
}

export type Minigame =
  /** จับคู่ sections[section].terms: term กับ definition */
  | (MinigameBase & { kind: "match-terms"; section: number })
  /** การ์ด = reviewQuestions ทุกข้อ, ตะกร้า = คอลัมน์แรกของ tables[basketTable], answerKey[i] = index แถวของตะกร้าที่ถูกของการ์ดใบที่ i */
  | (MinigameBase & { kind: "sort-cases"; basketTable: number; answerKey: number[] })
  /** ไอเทม = reviewQuestions[question].items, ที่เก็บ = tables[binTable].headers[binColumns], answerKey[i] = index คอลัมน์ที่ถูกของไอเทมชิ้นที่ i */
  | (MinigameBase & { kind: "sort-items"; question: number; binTable: number; binColumns: number[]; answerKey: number[] })
  /** เรียง sections ทุกข้อตามลำดับในต้นฉบับ หน้าการ์ด = heading ตัดเลขนำหน้า หลังการ์ด = body */
  | (MinigameBase & { kind: "order-steps" })
  /** คำนวณจาก reviewQuestions[question].accuracyCase */
  | (MinigameBase & { kind: "accuracy"; question: number })
  /** จับคู่คอลัมน์แรกของ tables[table] กับเซลล์ในแถวเดียวกันของ columns */
  | (MinigameBase & { kind: "match-table"; table: number; columns: number[] });

/** ชุดโจทย์ที่สร้างจากเนื้อหาของหัวข้อ ใช้เป็นชุดสำรองของห้องซ่อม */
export type BackupPool =
  /** บัตร = เซลล์ใน columns ตัวเลือก = คอลัมน์แรกของทุกแถว, sample = จำนวนแถวที่สุ่มมาใช้ */
  | { kind: "match-table-cells"; table: number; columns: number[]; sample?: number }
  /** บัตร = เซลล์ใน columns ตัวเลือก = หัวคอลัมน์ของ columns, rows = ใช้เฉพาะแถวเหล่านี้ (ไม่ระบุ = ทุกแถว) */
  | { kind: "sort-table-cells"; table: number; columns: number[]; rows?: number[] }
  /** สุ่ม sections 2 ข้อ ถามว่าข้อใดมาก่อน */
  | { kind: "step-pairs" }
  /** คำนวณจาก sections[section].accuracyCase */
  | { kind: "accuracy-example"; section: number }
  /** บัตร = definition ของ sections[section].terms ตัวเลือก = term ทุกคำ */
  | { kind: "term-definitions"; section: number }
  /** สุ่ม finalQuest.steps 2 ข้อ ถามว่าข้อใดมาก่อน (ใช้ได้กับหัวข้อสุดท้ายเท่านั้น) */
  | { kind: "quest-step-pairs" }
  /** บัตร = reviewQuestions ทุกข้อ ตัวเลือก = คอลัมน์แรกของ tables[basketTable], answerKey[i] = index แถวที่ถูกของบัตรใบที่ i */
  | { kind: "review-cases"; basketTable: number; answerKey: number[] }
  /** บัตร = หัวข้อย่อยหนึ่งข้อ ตัวเลือก = หัวข้อย่อยอื่นทั้งหมด ถามว่าข้อใดอยู่ถัดไป */
  | { kind: "step-next" }
  /** บัตร = ขั้นตอนหนึ่งของ finalQuest.steps ตัวเลือก = ขั้นตอนอื่นทั้งหมด ถามว่าข้อใดอยู่ถัดไป (หัวข้อสุดท้ายเท่านั้น) */
  | { kind: "quest-step-next" };

/** ชุดของแบบทดสอบก่อนเรียน/หลังเรียน สองชุดคู่ขนานกัน ผู้เรียนได้ชุดหนึ่งก่อนเรียนและอีกชุดหลังเรียน */
export type FormId = "A" | "B";

interface AssessmentBase {
  /** รหัสข้อ ใช้วิเคราะห์รายข้อ ห้ามเปลี่ยนเมื่อเริ่มเก็บข้อมูลแล้ว */
  id: string;
  /** หัวข้อ = สมรรถนะที่ข้อนี้วัด (1-6) */
  topic: number;
}

/** ข้อสอบหนึ่งข้อ อ้างเนื้อหาด้วย index เท่านั้น ข้อความมาจาก course.json */
export type AssessmentItem =
  /** บัตร = tables[table].rows[row][column] ตัวเลือก = คอลัมน์แรกของทุกแถว คำตอบ = แถว row */
  | (AssessmentBase & { kind: "cell-row"; table: number; row: number; column: number })
  /** บัตร = เซลล์เดียวกัน ตัวเลือก = หัวคอลัมน์ของ columns คำตอบ = หัวคอลัมน์ของ column */
  | (AssessmentBase & { kind: "cell-column"; table: number; row: number; column: number; columns: number[] })
  /** บัตร = คอลัมน์แรกของแถว row ตัวเลือก = เซลล์ของ column จากแถว row และแถวตัวลวง */
  | (AssessmentBase & { kind: "row-cell"; table: number; row: number; column: number; distractors: number[] })
  /** ถามว่าหัวข้อย่อยใดมาก่อน ระหว่าง sections[first] กับ sections[second] */
  | (AssessmentBase & { kind: "section-order"; first: number; second: number })
  /** ถามว่าขั้นตอนใดมาก่อน ระหว่าง finalQuest.steps[first] กับ steps[second] */
  | (AssessmentBase & { kind: "quest-step-order"; first: number; second: number });

export interface RoomQuest {
  /** เลขห้อง 1-5 */
  room: number;
  minigames: Minigame[];
  backup: BackupPool[];
  /** เนื้อหาที่เปิดให้ผู้เล่นเทียบกับคำตอบทบทวนของตัวเอง */
  selfCheck: ContentRef[];
}

/** ชุดโจทย์ของด่านต่อสู้ไคจูหลังได้แกน AI ของห้องนั้น (GDD ข้อ 12) ด่านสุดท้ายใช้ชุดของทุกห้องเรียงตามเฟส */
export interface BattleQuest {
  /** เลขหัวข้อ 1-6 */
  room: number;
  /** ชุดพื้นฐาน ใช้ในระดับง่าย */
  pools: BackupPool[];
  /** ชุดที่ยากกว่า (ตัวเลือกมากขึ้น หรือถามแบบนำไปใช้) ระดับกลางใช้รวมกับชุดพื้นฐาน ระดับยากใช้ชุดนี้อย่างเดียว */
  hard: BackupPool[];
}

export interface Quests {
  /** แบบทดสอบก่อนเรียน/หลังเรียนคู่ขนาน (GDD ข้อ 7.1 และ docs/EVALUATION_PLAN.md) */
  assessment: Record<FormId, AssessmentItem[]>;
  rooms: RoomQuest[];
  battles: BattleQuest[];
}
