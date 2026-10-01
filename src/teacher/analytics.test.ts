import { describe, expect, it } from "vitest";
import { course, quests } from "../content";
import { scoreAssessment } from "../state/assessment";
import { emptyField } from "../state/field";
import { emptyRoom, emptySave, type AssessmentResult, type SaveData } from "../state/progressStore";
import { answersCsv, itemsCsv, type Player, type PlayerRecord, studentsCsv, summarizeGain, summarizeRooms, summarizeStudent, toCsv, toPlayers, writtenAnswers } from "./analytics";
import { t } from "./strings";

const topics = course.topics.map((topic) => topic.id);

/** ผลแบบทดสอบที่ตอบถูกตามรายการรหัสข้อ */
function result(form: "A" | "B", correctIds: string[]): AssessmentResult {
  const items = quests.assessment[form].map((spec) => ({ id: spec.id, topic: spec.topic, correct: correctIds.includes(spec.id), timeMs: 1000 }));
  return scoreAssessment(form, items, topics, "2026-10-02T00:00:00.000Z");
}

function player(name: string, patch: Partial<SaveData>, extra: Partial<Player> = {}): Player {
  return { id: name, classCode: "PVC1", name, save: { ...emptySave(), profile: { name, style: "read", classCode: "PVC1" }, ...patch }, resumeCode: null, updatedAt: "2026-10-02T03:00:00.000Z", archived: false, ...extra };
}

const field = { ...emptyField(course.finalQuest), results: course.finalQuest.resultTable.classes.map((_, i) => ({ images: 30, correct: 10 - i })) };

const kaew = player("แก้ว", {
  pretest: result("A", ["A1a", "A2a"]),
  posttest: result("B", ["B1a", "B1b", "B2a", "B2b", "B3a", "B6a"]),
  rooms: {
    1: { ...emptyRoom(), stationsSeen: 5, minigameDone: true, stars: 3, reviewDone: true, reviewAnswers: ["คำตอบข้อหนึ่งของแก้ว", "=SUM(A1) คำตอบข้อสอง"], core: true, timeMs: 600000, tutor: { ai: 2, hints: 1 }, missed: { Label: 2, Feature: 1 } },
    2: { ...emptyRoom(), minigameDone: true, stars: 1, outcome: { totalMisses: 5, requiredRepair: true }, core: true, timeMs: 300000 },
    6: { ...emptyRoom(), field, core: true, timeMs: 120000 },
  },
});
const ton = player("ต้น", {
  pretest: result("B", ["B1a", "B1b", "B2a"]),
  posttest: result("A", ["A1a", "A1b", "A2a", "A2b"]),
  rooms: { 1: { ...emptyRoom(), minigameDone: true, stars: 2, core: true, timeMs: 900000, missed: { Label: 1 }, tutor: { ai: 0, hints: 3 } } },
});
const mai = player("ใหม่", { pretest: result("A", []) });

describe("summarizeStudent", () => {
  it("สรุปห้องที่ถึง แกน AI ดาว การทบทวน Accuracy ภาคสนาม และคะแนนพัฒนาการ", () => {
    expect(summarizeStudent(kaew)).toMatchObject({
      name: "แก้ว",
      roomReached: 6,
      cores: 3,
      stars: 4,
      starsMax: 15,
      reviewsDone: 1,
      reviewsTotal: 5,
      fieldAccuracy: 90,
      fieldDone: true,
      pre: 2,
      post: 6,
      gain: 4,
      normalizedGain: 0.4,
      assessmentMax: 12,
      tutorAi: 2,
      tutorHints: 1,
      timeMs: 1020000,
      forcedRepairs: 1,
    });
  });

  it("ยังไม่ได้เริ่ม: ค่าว่าง ไม่ใช่ศูนย์", () => {
    expect(summarizeStudent(mai)).toMatchObject({ roomReached: 0, cores: 0, fieldAccuracy: null, pre: 0, post: null, gain: null, normalizedGain: null });
  });
});

describe("summarizeRooms", () => {
  const rooms = summarizeRooms([kaew, ton, mai]);

  it("นับเฉพาะผู้เรียนที่เข้าห้องนั้นแล้ว เวลาเฉลี่ยมาจากคนที่มีเวลาบันทึก", () => {
    expect(rooms[0]).toMatchObject({ room: 1, entered: 2, finished: 2, averageTimeMs: 750000, averageStars: 2.5, tutorAi: 2, tutorHints: 4, forcedRepairs: 0 });
    expect(rooms[1]).toMatchObject({ entered: 1, averageTimeMs: 300000, averageStars: 1, forcedRepairs: 1 });
    expect(rooms[2]).toMatchObject({ entered: 0, averageTimeMs: null, averageStars: null });
  });

  it("ชิ้นที่ตอบผิดมากที่สุดเรียงจากมากไปน้อย พร้อมจำนวนคน", () => {
    expect(rooms[0].missed).toEqual([
      { label: "Label", count: 3, students: 2 },
      { label: "Feature", count: 1, students: 1 },
    ]);
  });
});

describe("summarizeGain", () => {
  const gain = summarizeGain([kaew, ton, mai]);

  it("ทั้งฉบับ: เฉลี่ยจากผู้เรียนที่ทำครบทั้งสองครั้ง", () => {
    expect(gain).toMatchObject({ students: 3, pretested: 3, paired: 2, max: 12, pre: 2.5, post: 5, gain: 2.5 });
    // แก้ว (6−2)/(12−2) = 0.4  ต้น (4−3)/(12−3) = 0.11
    expect(gain.normalizedGain).toBe(0.26);
  });

  it("รายสมรรถนะ: จับคู่ก่อน–หลังของคนเดียวกัน", () => {
    expect(gain.byTopic[0]).toMatchObject({ topic: 1, paired: 2, max: 2, pre: 1.5, post: 2, gain: 0.5 });
    expect(gain.byTopic[5]).toMatchObject({ topic: 6, pre: 0, post: 0.5, gain: 0.5 });
    expect(gain.byTopic.map((row) => row.objective)).toEqual(course.topics.map((topic) => topic.objective));
  });

  it("รายข้อ: สัดส่วนตอบถูกของกลุ่มที่ทำข้อนั้นก่อนเรียน เทียบกับกลุ่มที่ทำหลังเรียน", () => {
    const item = (id: string) => gain.items.find((entry) => entry.id === id);
    expect(gain.items).toHaveLength(24);
    // A1a: ก่อนเรียน แก้วถูก ใหม่ผิด = 0.5  หลังเรียน ต้นถูก = 1
    expect(item("A1a")).toEqual({ id: "A1a", form: "A", topic: 1, preN: 2, preCorrect: 0.5, postN: 1, postCorrect: 1, difference: 0.5 });
    expect(item("B6a")).toMatchObject({ preN: 1, preCorrect: 0, postN: 1, postCorrect: 1, difference: 1 });
  });

  it("ไม่มีข้อมูล: ค่าเฉลี่ยเป็น null", () => {
    expect(summarizeGain([])).toMatchObject({ students: 0, paired: 0, pre: null, gain: null, normalizedGain: null });
  });
});

describe("toPlayers", () => {
  const record = (data: unknown, archived_at: string | null = null): PlayerRecord => ({ id: "1", class_code: "PVC1", display_name: "แก้ว", data, resume_code: "ABCDE12345", created_at: "", updated_at: "2026-10-02T03:00:00.000Z", archived_at });

  it("แปลงแถวจากฐานข้อมูล ข้ามแถวที่อ่านไม่ออก", () => {
    const players = toPlayers([record(kaew.save), record({ junk: true }), record(kaew.save, "2026-10-03T00:00:00.000Z")]);
    expect(players.map((p) => [p.name, p.classCode, p.archived, p.resumeCode])).toEqual([
      ["แก้ว", "PVC1", false, "ABCDE12345"],
      ["แก้ว", "PVC1", true, "ABCDE12345"],
    ]);
  });
});

describe("CSV", () => {
  it("มี BOM ขึ้นบรรทัดด้วย CRLF และครอบเซลล์ที่มีจุลภาค อัญประกาศ หรือขึ้นบรรทัดใหม่", () => {
    expect(toCsv([["ชื่อ", "หมายเหตุ"], ["ก", 'มี "คำพูด", และจุลภาค'], ["ข", "สอง\nบรรทัด"], ["ค", null], ["ง", 0]])).toBe(
      '﻿ชื่อ,หมายเหตุ\r\nก,"มี ""คำพูด"", และจุลภาค"\r\nข,"สอง\nบรรทัด"\r\nค,\r\nง,0\r\n',
    );
  });

  it("ข้อความที่ขึ้นต้นเหมือนสูตรถูกทำให้เป็นข้อความ ตัวเลขติดลบไม่ถูกแตะ", () => {
    expect(toCsv([["=1+1", "+66", "-x", "@cmd", -3]])).toBe("﻿'=1+1,'+66,'-x,'@cmd,-3\r\n");
  });

  it("ตารางนักเรียน: หนึ่งแถวต่อคน จำนวนคอลัมน์เท่ากับหัวตาราง", () => {
    const lines = studentsCsv([kaew, ton, mai], { fixed: t.csv.students, pre: t.csv.pre, post: t.csv.post, stars: t.csv.stars, minutes: t.csv.minutes }).trim().split("\r\n");
    expect(lines).toHaveLength(4);
    const width = t.csv.students.length + 6 + 6 + 5 + 6;
    for (const line of lines) expect(line.split(",")).toHaveLength(width);
    expect(lines[1].startsWith("PVC1,แก้ว,false,2026-10-02T03:00:00.000Z,6,3,4,1,90,true,A,2,6,4,0.4,2,1,1,17,")).toBe(true);
  });

  it("คำตอบแบบพิมพ์: จับคู่กับคำถามจาก course.json และกันสูตรในคำตอบของผู้เรียน", () => {
    const answers = writtenAnswers(kaew.save);
    expect(answers.map((a) => a.room)).toEqual([1, 1]);
    expect(answers[0].question).toBe(course.topics[0].reviewQuestions[0].question);
    const csv = answersCsv([kaew, mai], t.csv.answers);
    expect(csv).toContain("'=SUM(A1) คำตอบข้อสอง");
    expect(csv.trim().split("\r\n")).toHaveLength(3);
  });

  it("รายข้อ: 24 ข้อ", () => {
    expect(itemsCsv(summarizeGain([kaew, ton]), t.csv.items).trim().split("\r\n")).toHaveLength(25);
  });
});
