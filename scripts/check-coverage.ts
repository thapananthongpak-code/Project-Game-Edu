// ตรวจว่าทุกหัวข้อใน course.json มีส่วนของเกมรองรับครบ: บทสนทนา มินิเกม คำถามทบทวน ห้องซ่อม แบบทดสอบก่อนเรียน ด่านต่อสู้ และภาพ
// (ผังห้องและจุดโต้ตอบของแต่ละห้องตรวจใน src/game/maps.test.ts)
// รัน: npm run check:coverage   (ออกด้วยรหัส 1 เมื่อพบหัวข้อที่ยังไม่ครบ)
import { readFileSync } from "node:fs";
import type { Course, Quests } from "../src/content/schema.ts";
import { IMPLEMENTED_MINIGAMES, PLAYABLE_ROOMS } from "../src/state/rules.ts";

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const course = read<Course>("../src/content/course.json");
const quests = read<Quests>("../src/content/quests.json");
const manifest = read<{ assets: { id: string; status: string; files: Record<string, string>; web?: Record<string, string> }[] }>("../public/assets/assets-manifest.json");

const implemented: readonly string[] = IMPLEMENTED_MINIGAMES;
const imageKeys = new Map(manifest.assets.flatMap((asset) => Object.keys({ ...asset.files, ...asset.web }).map((key) => [key, asset.status] as const)));
const last = course.topics.length;
let gaps = 0;

for (const topic of course.topics) {
  const room = topic.id;
  const quest = quests.rooms.find((r) => r.room === room);
  const lines: { ok: boolean; text: string }[] = [];
  const add = (ok: boolean, text: string) => lines.push({ ok, text });

  add(PLAYABLE_ROOMS.includes(room), "ห้องนี้เปิดให้เล่น (PLAYABLE_ROOMS)");

  if (room === last) {
    // ห้องสุดท้ายเป็นภารกิจภาคสนาม: เนื้อหาของหัวข้อแสดงในหน้าต่างภารกิจและใบประกาศ
    const fq = course.finalQuest;
    add(fq.steps.length > 0 && URL.canParse(fq.url), `ภารกิจภาคสนาม: ลิงก์และเช็คลิสต์ ${fq.steps.length} ขั้นตอน`);
    add(fq.resultTable.classes.length > 0 && topic.tables.length > 0, `ฟอร์มตารางบันทึกผล ${fq.resultTable.classes.length} คลาส คลาสละ ${fq.resultTable.testsPerClass} ครั้ง`);
    add((fq.notes?.prompts.length ?? 0) > 0, `บันทึกเพิ่มเติม ${fq.notes?.prompts.length ?? 0} ข้อ`);
    add(fq.gradingCriteria.length > 0, `ใบประกาศ: เกณฑ์ประเมิน ${fq.gradingCriteria.length} ข้อ`);
    add(topic.reviewQuestions.length === 0, "ไม่มีคำถามทบทวนในต้นฉบับ (ใช้ภารกิจภาคสนามแทน)");
  } else {
    const stations = topic.sections.length + (topic.intro ? 1 : 0);
    add(topic.sections.length > 0, `บทสนทนา ${stations} สถานี (${topic.sections.length} หัวข้อย่อย${topic.intro ? " + บทนำ" : ""})`);
    add(
      topic.tables.every((table) => table.sectionIndex !== undefined && table.sectionIndex < topic.sections.length),
      `ตาราง ${topic.tables.length} ตาราง แสดงในสถานีของหัวข้อย่อยที่ตารางอยู่`,
    );

    const kinds = quest?.minigames.map((game) => game.kind) ?? [];
    add(kinds.length > 0, `มินิเกม: ${kinds.join(" + ") || "ไม่มี"}`);
    add(kinds.every((kind) => implemented.includes(kind)), "มินิเกมทุกชนิดมีตัวเล่นในเกม (IMPLEMENTED_MINIGAMES)");
    add((quest?.backup.length ?? 0) > 0, `ห้องซ่อม: ชุดโจทย์สำรอง ${quest?.backup.map((pool) => pool.kind).join(" + ") ?? "ไม่มี"}`);
    add(topic.reviewQuestions.length > 0, `คำถามทบทวน ${topic.reviewQuestions.length} ข้อ แสดงในสมุดบันทึก`);
    add((quest?.selfCheck.length ?? 0) > 0, "เนื้อหาสำหรับคำใบ้สำเร็จรูปของติวเตอร์ (selfCheck)");
  }
  const perForm = (["A", "B"] as const).map((form) => quests.assessment[form].filter((item) => item.topic === room).length);
  add(perForm.every((n) => n > 0), `แบบทดสอบก่อนเรียน/หลังเรียนวัดสมรรถนะนี้ (ชุด A ${perForm[0]} ข้อ ชุด B ${perForm[1]} ข้อ)`);

  const tileset = imageKeys.get(`ts_r${room}`) ?? (imageKeys.has(`ts_r${room}_floor`) && imageKeys.has(`ts_r${room}_wall`) ? imageKeys.get(`ts_r${room}_floor`) : undefined);
  add(tileset !== undefined, `ไทล์เซตของห้อง (${tileset ?? "ไม่มี"})`);
  add(imageKeys.has(`core_${room}`), `ไอคอนแกน AI (${imageKeys.get(`core_${room}`) ?? "ไม่มี"})`);
  const battle = quests.battles?.find((b) => b.room === room);
  add((battle?.pools.length ?? 0) > 0, `ด่านต่อสู้: ชุดโจทย์ ${battle?.pools.map((pool) => pool.kind).join(" + ") ?? "ไม่มี"}`);
  add(imageKeys.has(`bt_kaiju_${room}`) && imageKeys.has(`bg_battle_${room}`), `ภาพไคจูและฉากต่อสู้ (${imageKeys.get(`bt_kaiju_${room}`) ?? "ไม่มี"})`);

  const missing = lines.filter((line) => !line.ok).length;
  gaps += missing;
  console.log(`${missing === 0 ? "✓" : "✗"} หัวข้อ ${room} ${topic.title}`);
  for (const line of lines) console.log(`    ${line.ok ? "✓" : "✗"} ${line.text}`);
}

const orphanRooms = quests.rooms.filter((r) => r.room < 1 || r.room >= last).map((r) => r.room);
if (orphanRooms.length > 0) {
  gaps++;
  console.log(`✗ quests.json มีห้องที่ไม่ตรงกับหัวข้อใด: ${orphanRooms.join(", ")}`);
}

console.log(gaps === 0 ? `ครบ: ทั้ง ${last} หัวข้อมีส่วนของเกมรองรับ` : `ไม่ครบ: พบ ${gaps} จุด`);
process.exit(gaps === 0 ? 0 : 1);
