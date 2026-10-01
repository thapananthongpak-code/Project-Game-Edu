// สรุปข้อมูลสำหรับแดชบอร์ดผู้สอน (ฟังก์ชันล้วน ทดสอบได้) รับแถวจาก /api/teacher แล้วคำนวณฝั่งเบราว์เซอร์
import { ASSESSMENT_ITEMS_PER_TOPIC, course, quests, ROOM_COUNT } from "../content";
import { reviewBlocks } from "../content/review";
import type { FormId } from "../content/schema";
import { gainOf, totalCorrect } from "../state/assessment";
import { fieldTotals } from "../state/field";
import { emptyRoom, migrateSave, type RoomProgress, type SaveData } from "../state/progressStore";

/** แถวของตาราง players ตามที่ /api/teacher ส่งมา */
export interface PlayerRecord {
  id: string;
  class_code: string;
  display_name: string;
  data: unknown;
  resume_code: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Player {
  id: string;
  classCode: string;
  name: string;
  save: SaveData;
  resumeCode: string | null;
  updatedAt: string;
  /** ผู้เรียนกดเริ่มเกมใหม่ ข้อมูลชุดเดิมถูกเก็บถาวรไว้ */
  archived: boolean;
}

export function toPlayers(records: readonly PlayerRecord[]): Player[] {
  const players: Player[] = [];
  for (const record of records) {
    const save = migrateSave(record.data);
    if (save) players.push({ id: record.id, classCode: record.class_code, name: record.display_name, save, resumeCode: record.resume_code, updatedAt: record.updated_at, archived: record.archived_at !== null });
  }
  return players;
}

const roomOf = (save: SaveData, room: number): RoomProgress => save.rooms[room] ?? emptyRoom();
const lessonRooms = (): number[] => course.topics.map((topic) => topic.id).filter((id) => id < ROOM_COUNT);
const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((sum, n) => sum + n, 0) / values.length);
const round = (value: number | null, digits = 2): number | null => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export interface StudentSummary {
  id: string;
  name: string;
  classCode: string;
  archived: boolean;
  updatedAt: string;
  resumeCode: string | null;
  /** ห้องสูงสุดที่เข้าแล้ว (0 = ยังไม่เข้าห้องใด) */
  roomReached: number;
  cores: number;
  /** ดาวรวมของมินิเกมห้อง 1–5 */
  stars: number;
  starsMax: number;
  /** จำนวนห้องที่ส่งคำตอบทบทวนแล้ว */
  reviewsDone: number;
  reviewsTotal: number;
  /** ความแม่นยำรวมที่ผู้เรียนกรอกจากการทดสอบโมเดลจริง (%) */
  fieldAccuracy: number | null;
  fieldDone: boolean;
  pre: number | null;
  post: number | null;
  gain: number | null;
  normalizedGain: number | null;
  assessmentMax: number;
  tutorAi: number;
  tutorHints: number;
  timeMs: number;
  /** จำนวนห้องที่ถูกบังคับเข้าห้องซ่อม */
  forcedRepairs: number;
}

export function summarizeStudent(player: Player): StudentSummary {
  const { save } = player;
  const rooms = course.topics.map((topic) => roomOf(save, topic.id));
  const lessons = lessonRooms().map((id) => roomOf(save, id));
  const final = roomOf(save, ROOM_COUNT);
  const growth = gainOf(save.pretest, save.posttest, ASSESSMENT_ITEMS_PER_TOPIC);
  return {
    id: player.id,
    name: player.name,
    classCode: player.classCode,
    archived: player.archived,
    updatedAt: player.updatedAt,
    resumeCode: player.resumeCode,
    roomReached: Math.max(0, ...Object.keys(save.rooms).map(Number)),
    cores: rooms.filter((room) => room.core).length,
    stars: lessons.reduce((sum, room) => sum + room.stars, 0),
    starsMax: lessons.length * 3,
    reviewsDone: lessons.filter((room) => room.reviewDone).length,
    reviewsTotal: lessons.length,
    fieldAccuracy: final.field ? fieldTotals(final.field.results, course.finalQuest).accuracy : null,
    fieldDone: final.core,
    pre: save.pretest ? totalCorrect(save.pretest) : null,
    post: save.posttest ? totalCorrect(save.posttest) : null,
    gain: growth?.gain ?? null,
    normalizedGain: growth?.normalized ?? null,
    assessmentMax: course.topics.length * ASSESSMENT_ITEMS_PER_TOPIC,
    tutorAi: rooms.reduce((sum, room) => sum + room.tutor.ai, 0),
    tutorHints: rooms.reduce((sum, room) => sum + room.tutor.hints, 0),
    timeMs: rooms.reduce((sum, room) => sum + room.timeMs, 0),
    forcedRepairs: rooms.filter((room) => room.outcome?.requiredRepair).length,
  };
}

export interface RoomSummary {
  room: number;
  title: string;
  /** จำนวนผู้เรียนที่เข้าห้องนี้แล้ว และที่ได้แกน AI ของห้องนี้ */
  entered: number;
  finished: number;
  /** เวลาเฉลี่ยของผู้เรียนที่มีเวลาบันทึกไว้ (มิลลิวินาที) */
  averageTimeMs: number | null;
  averageStars: number | null;
  tutorAi: number;
  tutorHints: number;
  forcedRepairs: number;
  /** ชิ้นที่ตอบผิดมากที่สุดในมินิเกม เรียงจากมากไปน้อย */
  missed: { label: string; count: number; students: number }[];
}

export function summarizeRooms(players: readonly Player[], topMissed = 5): RoomSummary[] {
  return course.topics.map((topic) => {
    const rooms = players.filter((player) => topic.id in player.save.rooms).map((player) => player.save.rooms[topic.id]);
    const missed = new Map<string, { count: number; students: number }>();
    for (const room of rooms) {
      for (const [label, count] of Object.entries(room.missed)) {
        const entry = missed.get(label) ?? { count: 0, students: 0 };
        missed.set(label, { count: entry.count + count, students: entry.students + 1 });
      }
    }
    return {
      room: topic.id,
      title: topic.title,
      entered: rooms.length,
      finished: rooms.filter((room) => room.core).length,
      averageTimeMs: round(mean(rooms.filter((room) => room.timeMs > 0).map((room) => room.timeMs)), 0),
      averageStars: round(mean(rooms.filter((room) => room.minigameDone).map((room) => room.stars))),
      tutorAi: rooms.reduce((sum, room) => sum + room.tutor.ai, 0),
      tutorHints: rooms.reduce((sum, room) => sum + room.tutor.hints, 0),
      forcedRepairs: rooms.filter((room) => room.outcome?.requiredRepair).length,
      missed: [...missed.entries()]
        .map(([label, entry]) => ({ label, ...entry }))
        .sort((a, b) => b.count - a.count || b.students - a.students || a.label.localeCompare(b.label, "th"))
        .slice(0, topMissed),
    };
  });
}

export interface TopicGain {
  topic: number;
  objective: string;
  /** จำนวนผู้เรียนที่ทำครบทั้งก่อนเรียนและหลังเรียน */
  paired: number;
  max: number;
  pre: number | null;
  post: number | null;
  gain: number | null;
}

export interface ItemStat {
  id: string;
  form: FormId;
  topic: number;
  preN: number;
  /** สัดส่วนที่ตอบถูก 0–1 */
  preCorrect: number | null;
  postN: number;
  postCorrect: number | null;
  /** หลังเรียน − ก่อนเรียน (คนละกลุ่มผู้เรียน เพราะแต่ละคนทำข้อนี้ครั้งเดียว) */
  difference: number | null;
}

export interface ClassGain {
  students: number;
  pretested: number;
  paired: number;
  max: number;
  pre: number | null;
  post: number | null;
  gain: number | null;
  normalizedGain: number | null;
  byTopic: TopicGain[];
  items: ItemStat[];
}

/** คะแนนพัฒนาการของทั้งห้อง: ต่อสมรรถนะ (จับคู่รายคน) และต่อข้อ (เทียบกลุ่มที่ทำข้อนั้นก่อนเรียนกับหลังเรียน) */
export function summarizeGain(players: readonly Player[]): ClassGain {
  const gains = players.map((player) => gainOf(player.save.pretest, player.save.posttest, ASSESSMENT_ITEMS_PER_TOPIC)).filter((gain) => gain !== null);
  const normalized = gains.map((gain) => gain.normalized).filter((value) => value !== null);
  const byTopic = course.topics.map((topic): TopicGain => {
    const rows = gains.map((gain) => gain.byTopic.find((row) => row.topic === topic.id)).filter((row) => row !== undefined);
    return {
      topic: topic.id,
      objective: topic.objective,
      paired: rows.length,
      max: ASSESSMENT_ITEMS_PER_TOPIC,
      pre: round(mean(rows.map((row) => row.pre))),
      post: round(mean(rows.map((row) => row.post))),
      gain: round(mean(rows.map((row) => row.gain))),
    };
  });

  const tally = new Map<string, { pre: boolean[]; post: boolean[] }>();
  for (const player of players) {
    for (const phase of ["pre", "post"] as const) {
      const result = phase === "pre" ? player.save.pretest : player.save.posttest;
      for (const item of result?.items ?? []) {
        const entry = tally.get(item.id) ?? { pre: [], post: [] };
        entry[phase].push(item.correct);
        tally.set(item.id, entry);
      }
    }
  }
  const share = (answers: boolean[]): number | null => round(mean(answers.map((correct) => (correct ? 1 : 0))));
  const items = (Object.keys(quests.assessment) as FormId[]).flatMap((form) =>
    quests.assessment[form].map((spec): ItemStat => {
      const entry = tally.get(spec.id) ?? { pre: [], post: [] };
      const pre = share(entry.pre);
      const post = share(entry.post);
      return { id: spec.id, form, topic: spec.topic, preN: entry.pre.length, preCorrect: pre, postN: entry.post.length, postCorrect: post, difference: pre === null || post === null ? null : round(post - pre) };
    }),
  );

  return {
    students: players.length,
    pretested: players.filter((player) => player.save.pretest).length,
    paired: gains.length,
    max: course.topics.length * ASSESSMENT_ITEMS_PER_TOPIC,
    pre: round(mean(gains.map((gain) => gain.pre))),
    post: round(mean(gains.map((gain) => gain.post))),
    gain: round(mean(gains.map((gain) => gain.gain))),
    normalizedGain: round(mean(normalized)),
    byTopic,
    items,
  };
}

// ---------------------------------------------------------------- CSV

type Cell = string | number | boolean | null;

/**
 * CSV สำหรับ Excel/Google Sheets: UTF-8 พร้อม BOM (ไม่เช่นนั้น Excel อ่านภาษาไทยเพี้ยน) ขึ้นบรรทัดด้วย CRLF
 * เซลล์ที่ขึ้นต้นด้วย = + - @ ถูกนำหน้าด้วย ' เพราะชื่อและคำตอบเป็นข้อความที่ผู้เรียนพิมพ์ โปรแกรมตารางจะไม่ตีความเป็นสูตร
 */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  const cell = (value: Cell): string => {
    if (value === null) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

const minutes = (ms: number): number => Math.round(ms / 6000) / 10;

/** ตารางนักเรียน หนึ่งแถวต่อคน พร้อมคะแนนรายสมรรถนะและรายห้อง */
export function studentsCsv(players: readonly Player[], headers: { fixed: readonly string[]; pre: string; post: string; stars: string; minutes: string }): string {
  const topics = course.topics.map((topic) => topic.id);
  const lessons = lessonRooms();
  const head = [
    ...headers.fixed,
    ...topics.map((id) => `${headers.pre} ${id}`),
    ...topics.map((id) => `${headers.post} ${id}`),
    ...lessons.map((id) => `${headers.stars} ${id}`),
    ...topics.map((id) => `${headers.minutes} ${id}`),
  ];
  const rows = players.map((player): Cell[] => {
    const s = summarizeStudent(player);
    const { save } = player;
    return [
      s.classCode,
      s.name,
      s.archived,
      s.updatedAt,
      s.roomReached,
      s.cores,
      s.stars,
      s.reviewsDone,
      s.fieldAccuracy,
      s.fieldDone,
      save.pretest?.form ?? null,
      s.pre,
      s.post,
      s.gain,
      s.normalizedGain,
      s.tutorAi,
      s.tutorHints,
      s.forcedRepairs,
      minutes(s.timeMs),
      ...topics.map((id) => save.pretest?.correctByTopic[id] ?? null),
      ...topics.map((id) => save.posttest?.correctByTopic[id] ?? null),
      ...lessons.map((id) => (save.rooms[id]?.minigameDone ? save.rooms[id].stars : null)),
      ...topics.map((id) => (save.rooms[id] ? minutes(save.rooms[id].timeMs) : null)),
    ];
  });
  return toCsv([head, ...rows]);
}

export interface WrittenAnswer {
  room: number;
  question: string;
  label: string;
  answer: string;
}

/** คำตอบแบบพิมพ์ของผู้เรียนหนึ่งคน: คำถามทบทวนห้อง 1–5 และบันทึกเพิ่มเติมของภารกิจภาคสนาม ให้ครูอ่านและให้คะแนนเอง */
export function writtenAnswers(save: SaveData): WrittenAnswer[] {
  const answers: WrittenAnswer[] = [];
  for (const room of lessonRooms()) {
    const given = save.rooms[room]?.reviewAnswers ?? [];
    let index = 0;
    for (const block of reviewBlocks(room)) {
      for (const field of block.fields) {
        const answer = given[index++] ?? "";
        if (answer) answers.push({ room, question: block.question, label: field.label, answer });
      }
    }
  }
  const field = save.rooms[ROOM_COUNT]?.field;
  course.finalQuest.notes?.prompts.forEach((prompt, i) => {
    const answer = field?.notes[i] ?? "";
    if (answer) answers.push({ room: ROOM_COUNT, question: prompt, label: "", answer });
  });
  return answers;
}

export function answersCsv(players: readonly Player[], head: readonly string[]): string {
  const rows = players.flatMap((player) => writtenAnswers(player.save).map((a): Cell[] => [player.classCode, player.name, a.room, a.question, a.label, a.answer]));
  return toCsv([head, ...rows]);
}

export function itemsCsv(gain: ClassGain, head: readonly string[]): string {
  return toCsv([head, ...gain.items.map((item): Cell[] => [item.id, item.form, item.topic, item.preN, item.preCorrect, item.postN, item.postCorrect, item.difference])]);
}
