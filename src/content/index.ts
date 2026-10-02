// ทางเข้าเดียวของเนื้อหา: คอมโพเนนต์และฉากเกมอ่านข้อความบทเรียนผ่านไฟล์นี้เท่านั้น
import courseJson from "./course.json";
import questsJson from "./quests.json";
import type { ContentRef, ContentTable, Course, Quests, RoomQuest, Topic } from "./schema";
import { ui } from "./ui-strings";

export const course = courseJson as unknown as Course;
export const quests = questsJson as unknown as Quests;

export const ROOM_COUNT = course.topics.length;

/** จำนวนข้อต่อสมรรถนะในแบบทดสอบก่อนเรียน/หลังเรียนหนึ่งชุด (scripts/validate-content.ts ตรวจว่าเท่ากันทุกหัวข้อและทั้งสองชุด) */
export const ASSESSMENT_ITEMS_PER_TOPIC = quests.assessment.A.length / course.topics.length;

export const topicOf = (room: number): Topic => course.topics[room - 1];

export const questOf = (room: number): RoomQuest | undefined => quests.rooms.find((r) => r.room === room);

/** ชื่อเควสของห้อง (ข้อความระบบตามชนิดมินิเกม) ใช้บน HUD คำแนะนำหน้าเครื่องฝึก และสมุดเควส */
export const questTitle = (room: number): string => (questOf(room)?.minigames ?? []).map((game) => ui.quest[game.kind].title).join(" + ");

/** ห้องสุดท้ายเป็นภารกิจภาคสนาม ใช้ finalQuest แทนสถานี มินิเกม และคำถามทบทวน */
export const isFieldRoom = (room: number): boolean => room === ROOM_COUNT;

/** ตัดเลขนำหน้าของชื่อหัวข้อย่อย ใช้เมื่อเลขจะเฉลยลำดับ */
export const stripNumber = (heading: string): string => heading.replace(/^\d+\s+/, "");

/** หน้าหนึ่งของกล่องสนทนา: ข้อความ หรือตาราง */
export type DialoguePage = { kind: "text"; text: string } | { kind: "table"; table: ContentTable };

/** สถานีในห้อง = intro (ถ้ามี) ตามด้วย sections ทุกข้อตามลำดับ (GDD ข้อ 4.1) */
export interface Station {
  title: string;
  pages: DialoguePage[];
}

const PAGE_CHARS = 150;

/** แบ่งหน้าตรงช่องว่างที่มีอยู่ในข้อความ ไม่ตัดคำ ไม่ย่อ */
export function paginate(text: string, maxChars = PAGE_CHARS): string[] {
  const pages: string[] = [];
  for (const block of text.split("\n\n")) {
    let page = "";
    for (const word of block.split(" ")) {
      const next = page ? `${page} ${word}` : word;
      // ขึ้นบรรทัดใหม่ในย่อหน้าเดียวกัน (\n) อยู่ในคำ จึงไม่ถูกแยกหน้ากลางรายการ
      if (page && next.length > maxChars) {
        pages.push(page);
        page = word;
      } else {
        page = next;
      }
    }
    if (page) pages.push(page);
  }
  return pages;
}

const textPages = (text: string): DialoguePage[] => paginate(text).map((t) => ({ kind: "text", text: t }));

export function stationsOf(room: number): Station[] {
  const topic = topicOf(room);
  const stations: Station[] = [];
  if (topic.intro) stations.push({ title: topic.title, pages: textPages(topic.intro) });
  topic.sections.forEach((section, index) => {
    const tables = topic.tables.filter((t) => t.sectionIndex === index);
    const tablePages = (placement: ContentTable["placement"]): DialoguePage[] =>
      tables.filter((t) => (t.placement ?? "after-body") === placement).map((table) => ({ kind: "table", table }));
    stations.push({
      title: section.heading,
      pages: [...tablePages("before-body"), ...textPages(section.body), ...tablePages("after-body")],
    });
  });
  return stations;
}

/** เนื้อหาที่ ContentRef ชี้ ในรูปหน้ากล่องสนทนา (ใช้กับแผงอ้างอิงของมินิเกม) */
export function resolveRefs(room: number, refs: ContentRef[]): Station[] {
  const topic = topicOf(room);
  return refs.map((ref) => {
    if ("intro" in ref) return { title: topic.title, pages: textPages(topic.intro ?? "") };
    if ("section" in ref) {
      const section = topic.sections[ref.section];
      return { title: section.heading, pages: [{ kind: "text", text: section.body }] };
    }
    const table = topic.tables[ref.table];
    return { title: topic.sections[table.sectionIndex ?? 0].heading, pages: [{ kind: "table", table }] };
  });
}

/** เนื้อหาที่โจทย์ของด่านต่อสู้ของห้องนี้ใช้ ในรูปหน้ากล่องสนทนา (แผง "ข้อมูลจากพี่บิต" ระหว่างสู้ GDD ข้อ 12) */
export function battleReference(room: number): Station[] {
  const topic = topicOf(room);
  const pools = quests.battles.find((b) => b.room === room)?.pools ?? [];
  return pools.flatMap((pool): Station[] => {
    switch (pool.kind) {
      case "match-table-cells":
      case "sort-table-cells":
        return resolveRefs(room, [{ table: pool.table }]);
      case "term-definitions":
      case "accuracy-example":
        return resolveRefs(room, [{ section: pool.section }]);
      case "step-pairs":
        // ลำดับของหัวข้อย่อยตามต้นฉบับ (ชื่อหัวข้อย่อยมีเลขลำดับอยู่แล้ว)
        return [{ title: topic.title, pages: [{ kind: "text", text: topic.sections.map((section) => section.heading).join("\n") }] }];
      case "quest-step-pairs":
        return [{ title: topic.sections[0].heading, pages: [{ kind: "text", text: course.finalQuest.steps.map((step, i) => `${i + 1}. ${step}`).join("\n") }] }];
    }
  });
}
