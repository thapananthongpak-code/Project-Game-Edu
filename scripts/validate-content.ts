// ตรวจโครงสร้าง src/content/course.json และ src/content/quests.json ให้ตรงกับ src/content/schema.ts
// รัน: npm run validate:content
import { readFileSync } from "node:fs";
import type { AccuracyCase, AssessmentItem, BackupPool, ContentRef, Course, Quests, Topic } from "../src/content/schema.ts";

const TOPIC_COUNT = 6;
const QUEST_ROOMS = 5;
const errors: string[] = [];

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const isIndex = (v: unknown, length: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < length;
const check = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

function readJson<T>(name: string): { data: T; text: string } {
  try {
    const text = readFileSync(new URL(`../src/content/${name}`, import.meta.url), "utf8");
    return { data: JSON.parse(text), text };
  } catch (e) {
    console.error(`อ่าน ${name} ไม่ได้: ${(e as Error).message}`);
    process.exit(1);
  }
}

function checkAccuracyCase(c: AccuracyCase, at: string) {
  check(isCount(c.total) && isIndex(c.correct, c.total + 1), `${at}.accuracyCase ต้องมี 0 ≤ correct ≤ total`);
  check(
    c.percent === undefined || c.correct * 100 === c.percent * c.total,
    `${at}.accuracyCase.percent ไม่เท่ากับ correct ÷ total × 100`,
  );
}

// ---------------------------------------------------------------- course.json

const { data } = readJson<Course>("course.json");
const topics = Array.isArray(data.topics) ? data.topics : [];
check(topics.length === TOPIC_COUNT, `topics ต้องมี ${TOPIC_COUNT} หัวข้อ แต่พบ ${topics.length}`);

topics.forEach((t, i) => {
  const at = `topics[${i}]`;
  check(t.id === i + 1, `${at}.id ต้องเป็น ${i + 1} (เรียงตามลำดับห้อง)`);
  check(isText(t.title), `${at}.title ว่าง`);
  check(isCount(t.minutes), `${at}.minutes ต้องเป็นจำนวนเต็มบวก`);
  check(isText(t.objective), `${at}.objective ว่าง`);
  check(t.intro === undefined || isText(t.intro), `${at}.intro ว่าง`);

  const sections = Array.isArray(t.sections) ? t.sections : [];
  const tables = Array.isArray(t.tables) ? t.tables : [];
  check(sections.length > 0, `${at}.sections ว่าง`);
  check(Array.isArray(t.tables), `${at}.tables ต้องเป็น array`);

  sections.forEach((s, j) => {
    const sAt = `${at}.sections[${j}]`;
    check(isText(s.heading), `${sAt}.heading ว่าง`);
    check(typeof s.body === "string", `${sAt}.body ต้องเป็น string`);
    // body ว่างได้เฉพาะหัวข้อย่อยที่เนื้อหาเป็นตาราง
    check(isText(s.body) || tables.some((tb) => tb.sectionIndex === j), `${sAt} ไม่มีทั้ง body และตาราง`);
    if (s.terms !== undefined) {
      check(Array.isArray(s.terms) && s.terms.length >= 2, `${sAt}.terms ต้องมีอย่างน้อย 2 คู่`);
      // term และ definition ต้องเป็นข้อความที่ตัดมาจาก body ไม่ใช่ข้อความใหม่
      check(
        s.terms.every((x) => isText(x.term) && isText(x.definition) && s.body.includes(x.term) && s.body.includes(x.definition)),
        `${sAt}.terms มีข้อความที่ไม่อยู่ใน body`,
      );
    }
    if (s.accuracyCase !== undefined) checkAccuracyCase(s.accuracyCase, sAt);
  });

  tables.forEach((tb, j) => {
    const tbAt = `${at}.tables[${j}]`;
    const headers = Array.isArray(tb.headers) ? tb.headers : [];
    const rows = Array.isArray(tb.rows) ? tb.rows : [];
    check(isText(tb.caption), `${tbAt}.caption ว่าง`);
    check(headers.length > 0 && headers.every(isText), `${tbAt}.headers ว่าง`);
    check(rows.length > 0, `${tbAt}.rows ว่าง`);
    check(
      rows.every((r) => Array.isArray(r) && r.length === headers.length),
      `${tbAt} จำนวนคอลัมน์ของบางแถวไม่เท่ากับ headers`,
    );
    check(
      tb.sectionIndex === undefined || isIndex(tb.sectionIndex, sections.length),
      `${tbAt}.sectionIndex ชี้นอกช่วงของ sections`,
    );
    check(
      tb.placement === undefined || tb.placement === "before-body" || tb.placement === "after-body",
      `${tbAt}.placement ต้องเป็น "before-body" หรือ "after-body"`,
    );
  });

  check(Array.isArray(t.reviewQuestions), `${at}.reviewQuestions ต้องเป็น array`);
  (Array.isArray(t.reviewQuestions) ? t.reviewQuestions : []).forEach((q, j) => {
    const qAt = `${at}.reviewQuestions[${j}]`;
    check(isText(q.question), `${qAt}.question ว่าง`);
    check(q.type === "open" || q.type === "activity", `${qAt}.type ต้องเป็น "open" หรือ "activity"`);
    if (q.items !== undefined) {
      check(
        Array.isArray(q.items) && q.items.length > 0 && q.items.every((x) => isText(x) && q.question.includes(x)),
        `${qAt}.items มีข้อความที่ไม่อยู่ใน question`,
      );
    }
    if (q.accuracyCase !== undefined) checkAccuracyCase(q.accuracyCase, qAt);
    if (q.followUp !== undefined) check(isText(q.followUp) && q.question.endsWith(q.followUp), `${qAt}.followUp ต้องเป็นส่วนท้ายของ question`);
    if (q.form !== undefined) {
      check(
        isText(q.form.subject) && isCount(q.form.examples) && q.form.aspects.length > 0 && [q.form.subject, ...q.form.aspects].every((x) => isText(x) && q.question.includes(x)),
        `${qAt}.form มีข้อความที่ไม่อยู่ใน question`,
      );
      check(isText(q.followUp), `${qAt}.form ต้องมี followUp คู่กัน`);
    }
  });
});

const fq = data.finalQuest;
if (!fq || typeof fq !== "object") {
  errors.push("finalQuest ว่าง");
} else {
  check(isText(fq.tool), "finalQuest.tool ว่าง");
  check(isText(fq.url) && URL.canParse(fq.url), "finalQuest.url ไม่ใช่ URL ที่ถูกต้อง");
  check(Array.isArray(fq.steps) && fq.steps.length > 0 && fq.steps.every(isText), "finalQuest.steps ว่าง");
  check(
    fq.minImagesPerClass === undefined || isCount(fq.minImagesPerClass),
    "finalQuest.minImagesPerClass ต้องเป็นจำนวนเต็มบวก",
  );

  check(fq.accuracyFormula === undefined || isText(fq.accuracyFormula), "finalQuest.accuracyFormula ว่าง");
  check(
    fq.notes === undefined || (isText(fq.notes.label) && Array.isArray(fq.notes.prompts) && fq.notes.prompts.length > 0 && fq.notes.prompts.every(isText)),
    "finalQuest.notes ต้องมี label และ prompts",
  );

  const classes = fq.resultTable?.classes;
  check(Array.isArray(classes) && classes.length > 0 && classes.every(isText), "finalQuest.resultTable.classes ว่าง");
  check(isCount(fq.resultTable?.testsPerClass), "finalQuest.resultTable.testsPerClass ต้องเป็นจำนวนเต็มบวก");

  const criteria = Array.isArray(fq.gradingCriteria) ? fq.gradingCriteria : [];
  check(criteria.length > 0, "finalQuest.gradingCriteria ว่าง");
  check(
    criteria.every((c) => isText(c.criterion) && isCount(c.weightPercent)),
    "finalQuest.gradingCriteria บางข้อไม่มี criterion หรือ weightPercent",
  );
  const total = criteria.reduce((sum, c) => sum + c.weightPercent, 0);
  check(criteria.length === 0 || total === 100, `น้ำหนักเกณฑ์ประเมินรวมต้องเป็น 100% แต่ได้ ${total}%`);
}

// ---------------------------------------------------------------- quests.json

const quests = readJson<Quests>("quests.json");
const rooms = Array.isArray(quests.data.rooms) ? quests.data.rooms : [];

// quests.json เก็บได้เฉพาะเฉลยและ index ข้อความบทเรียนต้องอยู่ใน course.json ที่เดียว
check(!/[฀-๿]/.test(quests.text), "quests.json มีข้อความภาษาไทย (ห้ามใส่ข้อความบทเรียนในไฟล์นี้)");
check(rooms.length === QUEST_ROOMS, `quests.rooms ต้องมี ${QUEST_ROOMS} ห้อง แต่พบ ${rooms.length}`);

function checkRefs(refs: ContentRef[] | undefined, topic: Topic, at: string) {
  for (const ref of refs ?? []) {
    if ("intro" in ref) check(isText(topic.intro), `${at} อ้าง intro แต่หัวข้อนี้ไม่มี intro`);
    else if ("section" in ref) check(isIndex(ref.section, topic.sections.length), `${at} อ้าง section ${ref.section} นอกช่วง`);
    else check(isIndex(ref.table, topic.tables.length), `${at} อ้าง table ${ref.table} นอกช่วง`);
  }
}

/** คอลัมน์คำตอบต้องไม่ใช่คอลัมน์แรก ซึ่งเป็นชื่อแถว */
const validColumns = (topic: Topic, table: number, columns: number[]) =>
  isIndex(table, topic.tables.length) &&
  Array.isArray(columns) &&
  columns.length > 0 &&
  columns.every((c) => c > 0 && isIndex(c, topic.tables[table].headers.length));

/** ตรวจชุดโจทย์ คืนจำนวนข้อที่ชุดนี้สร้างได้ */
function checkPool(pool: BackupPool, topic: Topic, at: string): number {
  switch (pool.kind) {
    case "match-table-cells": {
      const rows = topic.tables[pool.table]?.rows.length ?? 0;
      check(validColumns(topic, pool.table, pool.columns), `${at}.table หรือ columns ชี้นอกช่วง`);
      check(pool.sample === undefined || (isCount(pool.sample) && pool.sample <= rows), `${at}.sample มากกว่าจำนวนแถวของตาราง`);
      return (pool.sample ?? rows) * (pool.columns?.length ?? 0);
    }
    case "sort-table-cells": {
      const rows = topic.tables[pool.table]?.rows.length ?? 0;
      check(validColumns(topic, pool.table, pool.columns) && pool.columns.length >= 2, `${at} ต้องมี columns อย่างน้อย 2 คอลัมน์ที่มีในตาราง`);
      check(pool.rows === undefined || (pool.rows.length > 0 && pool.rows.every((r) => isIndex(r, rows))), `${at}.rows ชี้นอกช่วง`);
      return (pool.rows?.length ?? rows) * (pool.columns?.length ?? 0);
    }
    case "step-pairs":
      check(topic.sections.length >= 2, `${at} ต้องมี sections อย่างน้อย 2 ข้อ`);
      return (topic.sections.length * (topic.sections.length - 1)) / 2;
    case "accuracy-example":
      check(topic.sections[pool.section]?.accuracyCase?.percent !== undefined, `${at} sections[${pool.section}] ไม่มีตัวอย่างคำนวณ`);
      return 1;
    case "term-definitions": {
      const terms = topic.sections[pool.section]?.terms ?? [];
      check(terms.length >= 2, `${at} sections[${pool.section}] ไม่มี terms`);
      return terms.length;
    }
    case "quest-step-pairs":
      check(topic.id === topics.length, `${at} ใช้ขั้นตอนของภารกิจภาคสนาม จึงต้องเป็นหัวข้อสุดท้าย`);
      check(fq.steps.length >= 2, `${at} ต้องมี finalQuest.steps อย่างน้อย 2 ข้อ`);
      return (fq.steps.length * (fq.steps.length - 1)) / 2;
    default:
      errors.push(`${at}.kind ไม่รู้จัก: ${(pool as { kind: string }).kind}`);
      return 0;
  }
}

// แบบทดสอบก่อนเรียน/หลังเรียน: สองชุดต้องคู่ขนานกัน (ข้อต่อสมรรถนะเท่ากัน ชนิดข้อเดียวกัน) และไม่ใช้เนื้อหาข้อเดียวกันซ้ำ
const ITEMS_PER_COMPETENCY = 2;
const forms = quests.data.assessment ?? ({} as Quests["assessment"]);
const signature = (item: AssessmentItem): string => {
  const { id: _id, ...content } = item;
  return JSON.stringify(content);
};
const shape = (items: AssessmentItem[]): string => JSON.stringify(items.map((item) => `${item.topic}:${item.kind}`).sort());
const seenIds = new Set<string>();
const seenContent = new Set<string>();
for (const form of ["A", "B"] as const) {
  const items = Array.isArray(forms[form]) ? forms[form] : [];
  check(items.length === topics.length * ITEMS_PER_COMPETENCY, `quests.assessment.${form} ต้องมี ${topics.length * ITEMS_PER_COMPETENCY} ข้อ แต่พบ ${items.length}`);
  for (const topic of topics) {
    const count = items.filter((item) => item.topic === topic.id).length;
    check(count === ITEMS_PER_COMPETENCY, `quests.assessment.${form}: สมรรถนะที่ ${topic.id} ต้องมี ${ITEMS_PER_COMPETENCY} ข้อ แต่พบ ${count}`);
  }
  items.forEach((item, i) => {
    const at = `quests.assessment.${form}[${i}]`;
    const topic = topics[item.topic - 1];
    check(isText(item.id) && !seenIds.has(item.id), `${at}.id ว่างหรือซ้ำ`);
    seenIds.add(item.id);
    check(!seenContent.has(signature(item)), `${at} ใช้เนื้อหาเดียวกับข้ออื่น`);
    seenContent.add(signature(item));
    if (!topic) return void errors.push(`${at}.topic ไม่มีหัวข้อนี้`);
    switch (item.kind) {
      case "cell-row":
      case "cell-column":
      case "row-cell": {
        const table = topic.tables[item.table];
        check(table !== undefined && isIndex(item.row, table.rows.length) && item.column > 0 && isIndex(item.column, table.headers.length), `${at} ชี้ตาราง แถว หรือคอลัมน์นอกช่วง`);
        if (item.kind === "cell-column") check(item.columns.includes(item.column) && item.columns.length >= 2 && validColumns(topic, item.table, item.columns), `${at}.columns ต้องมีอย่างน้อย 2 คอลัมน์และรวมคอลัมน์ที่ถูก`);
        if (item.kind === "row-cell") check(item.distractors.length >= 1 && item.distractors.every((r) => r !== item.row && isIndex(r, table?.rows.length ?? 0)), `${at}.distractors ต้องเป็นแถวอื่นที่มีในตาราง`);
        break;
      }
      case "section-order":
        check(item.first !== item.second && isIndex(item.first, topic.sections.length) && isIndex(item.second, topic.sections.length), `${at} ชี้หัวข้อย่อยนอกช่วง`);
        break;
      case "quest-step-order":
        check(item.first !== item.second && isIndex(item.first, fq.steps.length) && isIndex(item.second, fq.steps.length), `${at} ชี้ขั้นตอนนอกช่วง`);
        check(item.topic === topics.length, `${at} ใช้ขั้นตอนของภารกิจภาคสนาม จึงต้องเป็นหัวข้อสุดท้าย`);
        break;
      default:
        errors.push(`${at}.kind ไม่รู้จัก: ${(item as { kind: string }).kind}`);
    }
  });
}
check(shape(forms.A ?? []) === shape(forms.B ?? []), "quests.assessment: ชุด A และ B ต้องมีชนิดข้อต่อสมรรถนะเหมือนกัน");

rooms.forEach((r, i) => {
  const at = `quests.rooms[${i}]`;
  check(r.room === i + 1, `${at}.room ต้องเป็น ${i + 1}`);
  const topic = topics[i];
  if (!topic) return;
  const questions = topic.reviewQuestions;

  check(Array.isArray(r.minigames) && r.minigames.length > 0, `${at}.minigames ว่าง`);
  (r.minigames ?? []).forEach((g, j) => {
    const gAt = `${at}.minigames[${j}]`;
    check(g.assistBatch === undefined || isCount(g.assistBatch), `${gAt}.assistBatch ต้องเป็นจำนวนเต็มบวก`);
    checkRefs(g.reference, topic, `${gAt}.reference`);
    switch (g.kind) {
      case "match-terms":
        check((topic.sections[g.section]?.terms?.length ?? 0) >= 2, `${gAt} sections[${g.section}] ไม่มี terms`);
        break;
      case "sort-cases": {
        const baskets = topic.tables[g.basketTable]?.rows.length ?? 0;
        check(baskets > 0, `${gAt}.basketTable ชี้นอกช่วง`);
        check(
          Array.isArray(g.answerKey) && g.answerKey.length === questions.length && g.answerKey.every((k) => isIndex(k, baskets)),
          `${gAt}.answerKey ต้องมีเฉลยครบ ${questions.length} ใบ และชี้แถวที่มีในตาราง`,
        );
        break;
      }
      case "sort-items": {
        const items = questions[g.question]?.items ?? [];
        check(items.length > 0, `${gAt} reviewQuestions[${g.question}] ไม่มี items`);
        check(validColumns(topic, g.binTable, g.binColumns), `${gAt}.binTable หรือ binColumns ชี้นอกช่วง`);
        check(
          Array.isArray(g.answerKey) && g.answerKey.length === items.length && g.answerKey.every((k) => g.binColumns?.includes(k)),
          `${gAt}.answerKey ต้องมีเฉลยครบ ${items.length} ชิ้น และอยู่ใน binColumns`,
        );
        break;
      }
      case "order-steps":
        check(topic.sections.length >= 2, `${gAt} ต้องมี sections อย่างน้อย 2 ข้อ`);
        break;
      case "accuracy":
        check(questions[g.question]?.accuracyCase !== undefined, `${gAt} reviewQuestions[${g.question}] ไม่มี accuracyCase`);
        break;
      case "match-table":
        check(validColumns(topic, g.table, g.columns), `${gAt}.table หรือ columns ชี้นอกช่วง`);
        break;
      default:
        errors.push(`${gAt}.kind ไม่รู้จัก: ${(g as { kind: string }).kind}`);
    }
  });

  check(Array.isArray(r.backup) && r.backup.length > 0, `${at}.backup ว่าง`);
  (r.backup ?? []).forEach((b, j) => checkPool(b, topic, `${at}.backup[${j}]`));

  check(Array.isArray(r.selfCheck) && r.selfCheck.length > 0, `${at}.selfCheck ว่าง`);
  checkRefs(r.selfCheck, topic, `${at}.selfCheck`);
});

// ด่านต่อสู้ไคจู: ทุกหัวข้อมีชุดโจทย์ และแต่ละชุดสร้างโจทย์เลือกตอบได้พอสำหรับหนึ่งด่าน
const MIN_BATTLE_ITEMS = 4;
const battles = Array.isArray(quests.data.battles) ? quests.data.battles : [];
check(battles.length === topics.length, `quests.battles ต้องมี ${topics.length} ด่าน แต่พบ ${battles.length}`);
battles.forEach((battle, i) => {
  const at = `quests.battles[${i}]`;
  check(battle.room === i + 1, `${at}.room ต้องเป็น ${i + 1}`);
  const topic = topics[i];
  if (!topic) return;
  check(Array.isArray(battle.pools) && battle.pools.length > 0, `${at}.pools ว่าง`);
  const items = (battle.pools ?? []).reduce((n, pool, j) => n + (pool.kind === "accuracy-example" ? 0 : checkPool(pool, topic, `${at}.pools[${j}]`)), 0);
  check(items >= MIN_BATTLE_ITEMS, `${at} สร้างโจทย์ได้ ${items} ข้อ ต้องมีอย่างน้อย ${MIN_BATTLE_ITEMS}`);
});

if (errors.length > 0) {
  console.error(`เนื้อหาไม่ผ่าน (${errors.length} ข้อ)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `course.json ผ่าน: ${topics.length} topics, finalQuest ${fq.steps.length} ขั้นตอน, เกณฑ์ประเมิน ${fq.gradingCriteria.length} ข้อ`,
);
console.log(
  `quests.json ผ่าน: ${rooms.length} ห้อง, มินิเกม ${rooms.reduce((n, r) => n + r.minigames.length, 0)} เกม, แบบทดสอบคู่ขนาน 2 ชุด ชุดละ ${forms.A.length} ข้อ, ด่านต่อสู้ ${battles.length} ด่าน`,
);
