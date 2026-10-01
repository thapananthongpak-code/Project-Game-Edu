// โครงของสมุดบันทึกคำถามทบทวนแต่ละห้อง (GDD ข้อ 4.5 และข้อ 5) สร้างจากโครงสร้างใน course.json และเฉลยใน quests.json
// ทุกข้อความที่แสดงเป็นคำถาม ป้ายช่อง และผลจากมินิเกม มาจาก course.json ตรงตัว
import { MIN_ANSWER_CHARS, MIN_SHORT_ANSWER_CHARS } from "../state/rules";
import { questOf, topicOf } from "./index";

export interface ReviewField {
  /** ป้ายของช่อง (ว่าง = ใช้ตัวคำถามเป็นป้าย) */
  label: string;
  minChars: number;
  /** ช่องสั้นบรรทัดเดียว */
  short: boolean;
}

export interface ReviewBlock {
  question: string;
  /** สิ่งที่ผู้เล่นทำไปแล้วในมินิเกม แสดงประกอบคำถาม */
  facts: { label: string; value: string }[];
  fields: ReviewField[];
}

const long = (label = ""): ReviewField => ({ label, minChars: MIN_ANSWER_CHARS, short: false });
const short = (label: string): ReviewField => ({ label, minChars: MIN_SHORT_ANSWER_CHARS, short: true });

export function reviewBlocks(room: number): ReviewBlock[] {
  const topic = topicOf(room);
  const games = questOf(room)?.minigames ?? [];
  const sortCases = games.find((g) => g.kind === "sort-cases");
  const sortItems = games.find((g) => g.kind === "sort-items");

  return topic.reviewQuestions.map((q, index) => {
    // ห้องที่มินิเกมคัดกรณีศึกษาจากคำถามทบทวน: แสดงตะกร้าที่ถูก แล้วให้อธิบายเหตุผล
    if (sortCases) {
      const table = topic.tables[sortCases.basketTable];
      return { question: q.question, facts: [{ label: table.headers[0], value: table.rows[sortCases.answerKey[index]][0] }], fields: [long()] };
    }
    // คำถามที่มีรายการให้จำแนก: ส่วนจำแนกทำในมินิเกมแล้ว เหลือส่วนหลัง "จากนั้น"
    if (q.items && sortItems && sortItems.question === index) {
      const headers = topic.tables[sortItems.binTable].headers;
      return {
        question: q.question,
        facts: q.items.map((item, i) => ({ label: item, value: headers[sortItems.answerKey[i]] })),
        fields: [long(q.followUp)],
      };
    }
    // โจทย์คำนวณ: ตอบไปแล้วในมินิเกม
    if (q.accuracyCase && games.some((g) => g.kind === "accuracy" && g.question === index)) {
      const { correct, total } = q.accuracyCase;
      return { question: q.question, facts: [{ label: `(${correct} ÷ ${total}) × 100`, value: `${(correct / total) * 100}%` }], fields: [] };
    }
    // กิจกรรมแบบฟอร์ม: ตัวอย่างละ 1 ช่องชื่อ + 1 ช่องต่อประเด็น แล้วตามด้วยส่วนหลัง "จากนั้น"
    if (q.form) {
      const form = q.form;
      const perExample = Array.from({ length: form.examples }, (_, e) => [short(`${form.subject} ${e + 1}`), ...form.aspects.map((aspect) => short(`${aspect} ${e + 1}`))]).flat();
      return { question: q.question, facts: [], fields: [...perExample, long(q.followUp)] };
    }
    return { question: q.question, facts: [], fields: [long()] };
  });
}

/** จำนวนช่องคำตอบทั้งหมดของห้อง */
export const reviewFieldCount = (room: number): number => reviewBlocks(room).reduce((n, block) => n + block.fields.length, 0);
