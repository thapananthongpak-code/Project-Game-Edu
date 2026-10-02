// คำถามทบทวนปิดท้ายเรื่อง (GDD ข้อ 4.5): โจทย์เลือกตอบ 3 แบบ ไม่มีการเขียนตอบ
//   match = จับคู่ (เลือกชื่อที่ตรงกับบัตร), link = เชื่อมโยง (บัตรนี้อยู่ใต้หัวข้อใด ขั้นใดมาก่อนหรือถัดไป), truth = ถูกหรือผิด (บัตรกับชื่อที่วางคู่กันตรงกันหรือไม่)
// ทุกข้อความบนบัตรและตัวเลือกมาจาก course.json ตรงตัว: กิจกรรมทบทวนของหัวข้อจากต้นฉบับในรูปเลือกตอบ (กรณีศึกษาของหัวข้อ 2 รายการให้จำแนกของหัวข้อ 3)
// แล้วเติมด้วยโจทย์จากชุดของด่านต่อสู้ของหัวข้อนั้น เฉลยมาจาก quests.json เช่นเดียวกับมินิเกม
import { buildBattleItems, buildChoiceItems, type ChoiceItem, type Rng, shuffled } from "./choices";
import { questOf, topicOf } from "./index";

export type ReviewKind = "match" | "link" | "truth";

export interface ReviewItem {
  kind: ReviewKind;
  item: ChoiceItem;
  /** truth: ตัวเลือกที่วางคู่กับบัตร (คู่นี้ถูกเมื่อ candidate === item.answer) แบบอื่นไม่ใช้ */
  candidate: number;
}

/** จำนวนข้อของคำถามทบทวนต่อหัวข้อ (หัวข้อที่มีโจทย์ไม่ถึงใช้เท่าที่มี) */
export const REVIEW_SIZE = 6;

/** กิจกรรมทบทวนของหัวข้อจากต้นฉบับ ในรูปโจทย์เลือกตอบ (ใช้เฉลยเดียวกับมินิเกมของหัวข้อนั้น) */
function ownItems(topicId: number, rng: Rng): ChoiceItem[] {
  const topic = topicOf(topicId);
  const games = questOf(topicId)?.minigames ?? [];
  const items: ChoiceItem[] = [];
  for (const game of games) {
    if (game.kind === "sort-cases") items.push(...buildChoiceItems(topicId, { kind: "review-cases", basketTable: game.basketTable, answerKey: game.answerKey }, rng));
    if (game.kind === "sort-items") {
      const headers = topic.tables[game.binTable].headers;
      (topic.reviewQuestions[game.question]?.items ?? []).forEach((card, i) => {
        items.push({ topic: topicId, caption: "", card, ask: { type: "column" }, options: game.binColumns.map((column) => headers[column]), answer: game.binColumns.indexOf(game.answerKey[i]) });
      });
    }
  }
  return items;
}

const keyOf = (item: ChoiceItem): string => `${item.ask.type}|${item.card}|${[...item.options].sort().join("|")}`;

/** ชุดคำถามทบทวนของหัวข้อ: สลับลำดับต่อครั้ง แบบของแต่ละข้อขึ้นกับชนิดของโจทย์ ทุกสามข้อเป็นแบบถูกหรือผิดหนึ่งข้อ */
export function buildReview(topicId: number, rng: Rng = Math.random): ReviewItem[] {
  const seen = new Set<string>();
  const unique = [...shuffled(ownItems(topicId, rng), rng), ...buildBattleItems(topicId, "mixed", rng)].filter((item) => !seen.has(keyOf(item)) && Boolean(seen.add(keyOf(item))));
  return unique.slice(0, REVIEW_SIZE).map((item, index) => {
    // ถูกหรือผิดใช้ได้กับข้อที่มีบัตร (ข้อที่ให้เลือกว่าอะไรมาก่อนไม่มีบัตรให้จับคู่)
    if (index % 3 === 2 && item.card !== "" && item.options.length >= 2) {
      const others = item.options.map((_, i) => i).filter((i) => i !== item.answer);
      const candidate = rng() < 0.5 ? item.answer : others[Math.floor(rng() * others.length)];
      return { kind: "truth", item, candidate };
    }
    return { kind: item.ask.type === "pick" ? "match" : "link", item, candidate: -1 };
  });
}

/** คำตอบของข้อนี้ถูกหรือไม่: truth = ผู้เล่นตอบว่า "ถูก" (1) หรือ "ผิด" (0), แบบอื่น = ลำดับของตัวเลือกที่เลือก */
export const reviewCorrect = (entry: ReviewItem, answer: number): boolean => (entry.kind === "truth" ? (answer === 1) === (entry.candidate === entry.item.answer) : answer === entry.item.answer);
