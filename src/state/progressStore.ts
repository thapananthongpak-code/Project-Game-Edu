// ที่เก็บความคืบหน้าของผู้เล่น
//
// เกมเรียกผ่าน interface ProgressStore เท่านั้น (load / save / clear) มีสองตัวที่ implement:
//   - LocalProgressStore: localStorage ของเบราว์เซอร์ ใช้เมื่อยังไม่ได้ตั้งค่า Supabase และเป็นสำเนาในเครื่องเสมอ
//   - SyncedProgressStore: สำเนาในเครื่อง + ฐานข้อมูลกลาง (Supabase) ผ่าน RemoteBackend
// createProgressStore() เลือกตาม VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY (ดู docs/TEACHER_GUIDE.md และ supabase/schema.sql)
import { course } from "../content";
import type { FormId } from "../content/schema";
import { LEARNING_STYLES, type LearningStyle } from "./adaptive.config";
import { emptyField, type FieldProgress } from "./field";
import { MAX_ANSWER_CHARS, MAX_NAME_CHARS } from "./rules";

export const SAVE_VERSION = 3;

export interface Profile {
  /** ชื่อที่แสดง แนะนำให้ใช้ชื่อเล่นหรือเลขที่ ไม่ใช้ชื่อจริง */
  name: string;
  style: LearningStyle;
  /** รหัสห้องเรียนที่ครูกำหนด ว่าง = เล่นคนเดียว ไม่ส่งข้อมูลให้ครู */
  classCode: string;
}

/** ผลแบบทดสอบก่อนเรียนหรือหลังเรียนหนึ่งครั้ง */
export interface AssessmentResult {
  form: FormId;
  /** จำนวนข้อที่ถูกของแต่ละสมรรถนะ (หัวข้อ) */
  correctByTopic: Record<number, number>;
  /** ผลรายข้อ id ตรงกับ quests.json ผู้เล่นไม่เห็นคะแนนจนกว่าจะทำหลังเรียนเสร็จ */
  items: { id: string; topic: number; correct: boolean; timeMs: number }[];
  completedAt: string;
}

export interface RoomProgress {
  /** จำนวนสถานีที่ฟังจบแล้ว นับเรียงจากสถานีแรก */
  stationsSeen: number;
  minigameDone: boolean;
  /** ดาวที่ดีที่สุดของมินิเกม (0 = ยังไม่ผ่าน) */
  stars: number;
  /** ผลของมินิเกมรอบล่าสุดที่เล่นจบ ใช้ตั้งระดับเริ่มต้นของห้องถัดไป */
  outcome: { totalMisses: number; requiredRepair: boolean } | null;
  /** สรุปการตรวจคำตอบของรอบล่าสุด สำหรับครู */
  summary: { checks: number; correct: number; totalTimeMs: number; repairVisits: number } | null;
  /** ชิ้นที่ตอบผิดในมินิเกม (ข้อความบนการ์ด -> จำนวนครั้ง) สะสมทุกรอบ สำหรับครู */
  missed: Record<string, number>;
  reviewAnswers: string[];
  reviewDone: boolean;
  /** ภารกิจภาคสนาม (เฉพาะห้องสุดท้าย) */
  field: FieldProgress | null;
  core: boolean;
  /** เวลาที่ได้แกน AI ของห้องนี้ (ISO) ห้องสุดท้ายใช้เป็นวันที่บนใบประกาศ */
  coreAt: string | null;
  /** เวลาที่อยู่ในห้องนี้สะสม (มิลลิวินาที) นับเฉพาะตอนเปิดหน้าเกมอยู่ */
  timeMs: number;
  /** จำนวนครั้งที่ถามพี่บิตในห้องนี้: ได้คำตอบจาก AI และได้คำใบ้สำเร็จรูป */
  tutor: { ai: number; hints: number };
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** เวลาที่บันทึกล่าสุด (ISO) ใช้เลือกสำเนาที่ใหม่กว่าระหว่างในเครื่องกับฐานข้อมูลกลาง */
  updatedAt: string;
  profile: Profile | null;
  pretest: AssessmentResult | null;
  posttest: AssessmentResult | null;
  rooms: Record<number, RoomProgress>;
}

export interface ProgressStore {
  /** คืน null เมื่อยังไม่มีข้อมูลที่บันทึกไว้ */
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}

export const emptyRoom = (): RoomProgress => ({
  stationsSeen: 0,
  minigameDone: false,
  stars: 0,
  outcome: null,
  summary: null,
  missed: {},
  reviewAnswers: [],
  reviewDone: false,
  field: null,
  core: false,
  coreAt: null,
  timeMs: 0,
  tutor: { ai: 0, hints: 0 },
});

export const emptySave = (): SaveData => ({ version: SAVE_VERSION, updatedAt: new Date(0).toISOString(), profile: null, pretest: null, posttest: null, rooms: {} });

// ---------------------------------------------------------------- อ่านข้อมูลที่บันทึกไว้
// ข้อมูลที่อ่านกลับมาอาจไม่ครบหรือผิดรูป (รุ่นเก่า ไฟล์เสีย หรือถูกแก้จากนอกเกม) ทุกช่องจึงถูกตรวจชนิดและเติมค่าเริ่มต้น
// ทั้งตัวเกมและแดชบอร์ดผู้สอนอ่านผ่านทางนี้ แถวที่ผิดรูปของผู้เรียนคนเดียวจึงไม่ทำให้หน้าของทั้งห้องพัง

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function fieldOf(raw: unknown): FieldProgress | null {
  if (raw === null || typeof raw !== "object") return null;
  const data = raw as Raw;
  const base = emptyField(course.finalQuest);
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const evidence = object(data.evidence);
  return {
    ready: data.ready === true,
    steps: base.steps.map((_, i) => list(data.steps)[i] === true),
    results: base.results.map((_, i) => ({ images: whole(object(list(data.results)[i]).images), correct: whole(object(list(data.results)[i]).correct) })),
    notes: base.notes.map((_, i) => text(list(data.notes)[i], MAX_ANSWER_CHARS)),
    evidence: {
      image: typeof evidence.image === "string" && evidence.image.startsWith("data:image/") ? evidence.image : null,
      outsideGame: evidence.outsideGame === true,
      ...(evidence.onDevice === true ? { onDevice: true } : {}),
    },
  };
}

function roomOf(raw: unknown): RoomProgress {
  const data = object(raw);
  const outcome = data.outcome === null || data.outcome === undefined ? null : object(data.outcome);
  const summary = data.summary === null || data.summary === undefined ? null : object(data.summary);
  const missed: Record<string, number> = {};
  for (const [label, times] of Object.entries(object(data.missed))) if (count(times) > 0) missed[label] = count(times);
  return {
    stationsSeen: count(data.stationsSeen),
    minigameDone: data.minigameDone === true,
    stars: Math.min(3, count(data.stars)),
    outcome: outcome && { totalMisses: count(outcome.totalMisses), requiredRepair: outcome.requiredRepair === true },
    summary: summary && { checks: count(summary.checks), correct: count(summary.correct), totalTimeMs: count(summary.totalTimeMs), repairVisits: count(summary.repairVisits) },
    missed,
    reviewAnswers: Array.isArray(data.reviewAnswers) ? data.reviewAnswers.map((answer) => text(answer, MAX_ANSWER_CHARS)) : [],
    reviewDone: data.reviewDone === true,
    field: fieldOf(data.field),
    core: data.core === true,
    coreAt: typeof data.coreAt === "string" ? data.coreAt : null,
    timeMs: count(data.timeMs),
    tutor: { ai: count(object(data.tutor).ai), hints: count(object(data.tutor).hints) },
  };
}

const roomsOf = (raw: unknown): Record<number, RoomProgress> => {
  const rooms: Record<number, RoomProgress> = {};
  for (const [room, value] of Object.entries(object(raw))) if (Number.isInteger(Number(room)) && Number(room) >= 1 && Number(room) <= course.topics.length) rooms[Number(room)] = roomOf(value);
  return rooms;
};

function profileOf(raw: unknown): Profile | null {
  const data = object(raw);
  const name = text(data.name, MAX_NAME_CHARS).trim();
  if (!name) return null;
  const style = LEARNING_STYLES.find((candidate) => candidate === data.style) ?? "read";
  return { name, style, classCode: text(data.classCode, 20) };
}

function assessmentOf(raw: unknown): AssessmentResult | null {
  if (raw === null || typeof raw !== "object") return null;
  const data = raw as Raw;
  const correctByTopic: Record<number, number> = {};
  for (const [topic, correct] of Object.entries(object(data.correctByTopic))) correctByTopic[Number(topic)] = count(correct);
  const items = (Array.isArray(data.items) ? data.items : []).map(object).filter((item) => typeof item.id === "string" && typeof item.topic === "number");
  return {
    form: data.form === "B" ? "B" : "A",
    correctByTopic,
    items: items.map((item) => ({ id: item.id as string, topic: item.topic as number, correct: item.correct === true, timeMs: count(item.timeMs) })),
    completedAt: text(data.completedAt, 40),
  };
}

/** แปลงข้อมูลที่อ่านได้ให้เป็น SaveData รุ่นปัจจุบัน คืน null ถ้าอ่านไม่ออก */
export function migrateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Raw;
  const hasRooms = typeof data.rooms === "object" && data.rooms !== null;
  if (data.version === SAVE_VERSION && hasRooms) {
    return {
      version: SAVE_VERSION,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : emptySave().updatedAt,
      profile: profileOf(data.profile),
      pretest: assessmentOf(data.pretest),
      posttest: assessmentOf(data.posttest),
      rooms: roomsOf(data.rooms),
    };
  }
  // รุ่น 2: ยังไม่มีรหัสห้องเรียน แบบทดสอบหลังเรียน และรหัสข้อ ผลก่อนเรียนเดิมสุ่มโจทย์ จึงเก็บไว้เฉพาะคะแนนรายหัวข้อ
  if (data.version === 2 && hasRooms) {
    const pretest = assessmentOf(data.pretest);
    return { ...emptySave(), profile: profileOf(data.profile), pretest: pretest && { ...pretest, form: "A", items: [] }, rooms: roomsOf(data.rooms) };
  }
  // รุ่น 1 (ต้นแบบห้อง 1): { state: { progress }, version: 1 }
  const legacy = object(data.state).progress;
  if (legacy && typeof legacy === "object") return { ...emptySave(), rooms: roomsOf(legacy) };
  return null;
}

/** ส่วนของ Web Storage ที่ใช้ รับเข้ามาได้เพื่อทดสอบ */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalProgressStore implements ProgressStore {
  private readonly storage: KeyValueStorage;
  private readonly key: string;

  constructor(storage: KeyValueStorage, key = "ai-trainer-quest-save") {
    this.storage = storage;
    this.key = key;
  }

  async load(): Promise<SaveData | null> {
    const text = this.storage.getItem(this.key);
    if (!text) return null;
    try {
      return migrateSave(JSON.parse(text));
    } catch {
      // ข้อมูลเสีย ถือว่ายังไม่มีข้อมูล
      return null;
    }
  }

  async save(data: SaveData): Promise<void> {
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch {
      // พื้นที่เก็บเต็ม (มักเกิดจากภาพหลักฐาน): บันทึกส่วนที่เหลือโดยไม่มีภาพ ดีกว่าเสียความคืบหน้าทั้งหมด
      this.storage.setItem(this.key, JSON.stringify(withoutEvidenceImage(data)));
    }
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

/** สำเนาที่ไม่มีภาพหลักฐาน ภาพอาจมีใบหน้าผู้เรียนจากกล้อง จึงไม่ส่งออกจากเครื่อง (docs/TEACHER_GUIDE.md) */
export function withoutEvidenceImage(data: SaveData): SaveData {
  const rooms: Record<number, RoomProgress> = {};
  for (const [room, progress] of Object.entries(data.rooms)) {
    const field = progress.field;
    rooms[Number(room)] = field?.evidence.image ? { ...progress, field: { ...field, evidence: { ...field.evidence, image: null, onDevice: true } } } : progress;
  }
  return { ...data, rooms };
}

// ---------------------------------------------------------------- ฐานข้อมูลกลาง

export interface RemoteRecord {
  data: SaveData;
  /** รหัสสำหรับเล่นต่อจากเครื่องอื่น */
  resumeCode: string;
}

/** สิ่งที่ SyncedProgressStore ต้องการจากฐานข้อมูลกลาง ตัวจริงคือ Supabase (src/state/supabaseBackend.ts) */
export interface RemoteBackend {
  load(): Promise<RemoteRecord | null>;
  /** บันทึกความคืบหน้าของผู้เล่นคนนี้ คืนรหัสเล่นต่อ */
  save(data: SaveData): Promise<string>;
  /** ผู้เรียนคนเดิมเริ่มใหม่ทั้งหมด: เก็บข้อมูลเดิมไว้ให้ครูในสถานะเก็บถาวร แล้วตัดการเชื่อมกับเครื่องนี้ */
  reset(): Promise<void>;
  /** ผู้เรียนคนใหม่มาใช้เครื่องนี้: ตัดการเชื่อมอย่างเดียว ข้อมูลของคนเดิมยังอยู่และเล่นต่อได้ด้วยรหัส */
  detach(): Promise<void>;
  /** ย้ายมาเล่นต่อที่เครื่องนี้ด้วยรหัสเล่นต่อ คืน null ถ้ารหัสไม่ถูก */
  claim(code: string): Promise<RemoteRecord | null>;
}

export type SyncStatus = "local" | "pending" | "synced" | "error";

interface SyncOptions {
  /** หน่วงการส่งขึ้นฐานข้อมูลกลาง รวมการเปลี่ยนแปลงถี่ ๆ เป็นครั้งเดียว */
  delayMs?: number;
  /** ส่งไม่สำเร็จ: ลองใหม่หลังเวลานี้ */
  retryMs?: number;
  /** รอฐานข้อมูลกลางตอนเปิดเกมไม่เกินเวลานี้ เกินแล้วเริ่มจากสำเนาในเครื่อง */
  loadTimeoutMs?: number;
  onStatus?: (status: SyncStatus, resumeCode: string | null) => void;
}

/** มีชื่อและรหัสห้องเรียนแล้วจึงส่งขึ้นฐานข้อมูลกลาง ผู้เล่นที่ไม่ใส่รหัสห้องเรียนเก็บในเครื่องอย่างเดียว */
const sharable = (data: SaveData): boolean => Boolean(data.profile?.name && data.profile.classCode);

/**
 * เก็บในเครื่องทันที แล้วส่งขึ้นฐานข้อมูลกลางแบบหน่วง ถ้าเครือข่ายล่มเกมยังเล่นต่อได้จากสำเนาในเครื่อง
 * และส่งใหม่เมื่อบันทึกครั้งถัดไป
 */
export class SyncedProgressStore implements ProgressStore {
  private readonly local: ProgressStore;
  private readonly remote: RemoteBackend;
  private readonly delayMs: number;
  private readonly retryMs: number;
  private readonly loadTimeoutMs: number;
  /** คิวของคำสั่งที่ส่งไปฐานข้อมูลกลาง ให้ทำทีละคำสั่งตามลำดับ (เช่น เริ่มใหม่ต้องไม่แซงการบันทึกที่ค้างอยู่) */
  private chain: Promise<void> = Promise.resolve();
  private readonly onStatus: NonNullable<SyncOptions["onStatus"]>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queued: SaveData | null = null;
  private resumeCode: string | null = null;

  constructor(local: ProgressStore, remote: RemoteBackend, options: SyncOptions = {}) {
    this.local = local;
    this.remote = remote;
    this.delayMs = options.delayMs ?? 2000;
    this.retryMs = options.retryMs ?? 15000;
    this.loadTimeoutMs = options.loadTimeoutMs ?? 6000;
    this.onStatus = options.onStatus ?? (() => {});
  }

  async load(): Promise<SaveData | null> {
    const local = await this.local.load();
    let record: RemoteRecord | null = null;
    try {
      record = await withTimeout(this.remote.load(), this.loadTimeoutMs);
    } catch {
      // เครือข่ายช้าหรือล่ม: เล่นจากสำเนาในเครื่อง แล้วส่งขึ้นเมื่อบันทึกครั้งถัดไป
      this.onStatus("error", null);
      return local;
    }
    if (!record) {
      // ยังไม่มีในฐานข้อมูลกลาง: ใช้สำเนาในเครื่อง และส่งขึ้นถ้ามีรหัสห้องเรียนแล้ว
      if (local && sharable(local)) this.schedule(local);
      else this.onStatus("local", null);
      return local;
    }
    this.resumeCode = record.resumeCode;
    const remote = migrateSave(record.data);
    if (local && (!remote || local.updatedAt > remote.updatedAt)) {
      this.schedule(local);
      return local;
    }
    this.onStatus("synced", this.resumeCode);
    if (!remote) return local;
    const merged = restoreEvidenceImage(remote, local);
    await this.local.save(merged);
    return merged;
  }

  async save(data: SaveData): Promise<void> {
    await this.local.save(data);
    if (sharable(data)) this.schedule(data);
  }

  async clear(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
    this.resumeCode = null;
    await this.local.clear();
    await this.enqueue(async () => {
      try {
        await this.remote.reset();
        this.onStatus("local", null);
      } catch {
        this.onStatus("error", null);
      }
    });
  }

  /**
   * ผู้เรียนคนใหม่มาใช้เครื่องนี้ (เครื่องที่ใช้ร่วมกัน): ส่งความคืบหน้าของคนเดิมที่ค้างอยู่ขึ้นไปก่อน
   * แล้วลบสำเนาในเครื่องและตัดการเชื่อม ข้อมูลของคนเดิมในฐานข้อมูลกลางไม่ถูกแตะ
   */
  async detach(): Promise<void> {
    await this.flush();
    this.queued = null;
    this.resumeCode = null;
    await this.local.clear();
    await this.enqueue(async () => {
      try {
        await this.remote.detach();
        this.onStatus("local", null);
      } catch {
        this.onStatus("error", null);
      }
    });
  }

  /** ย้ายมาเล่นต่อที่เครื่องนี้ คืนข้อมูลของผู้เล่น หรือ null ถ้ารหัสไม่ถูก */
  async claim(code: string): Promise<SaveData | null> {
    // ความคืบหน้าของผู้เล่นที่อยู่ในเครื่องนี้ก่อนหน้า (ถ้ามี) ต้องขึ้นฐานข้อมูลกลางก่อนถูกแทนที่
    await this.flush();
    const record = await this.remote.claim(code);
    const data = record && migrateSave(record.data);
    if (!record || !data) return null;
    this.resumeCode = record.resumeCode;
    await this.local.save(data);
    this.onStatus("synced", this.resumeCode);
    return data;
  }

  /** ส่งรายการที่ค้างอยู่ทันที (ใช้ตอนปิดหน้าเกมและในเทสต์) */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.enqueue(async () => {
      const data = this.queued;
      this.queued = null;
      if (!data) return;
      try {
        this.resumeCode = await this.remote.save(withoutEvidenceImage(data));
        this.onStatus(this.queued ? "pending" : "synced", this.resumeCode);
      } catch {
        // สำเนาในเครื่องยังครบ เก็บรายการไว้แล้วลองส่งใหม่ภายหลัง
        this.queued ??= data;
        this.onStatus("error", this.resumeCode);
        this.timer ??= setTimeout(() => void this.flush(), this.retryMs);
      }
    });
  }

  private schedule(data: SaveData): void {
    this.queued = data;
    this.onStatus("pending", this.resumeCode);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(task, task);
    return this.chain;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}

/** ฐานข้อมูลกลางไม่เก็บภาพหลักฐาน ถ้าเครื่องนี้มีภาพอยู่ให้ใส่คืน */
function restoreEvidenceImage(remote: SaveData, local: SaveData | null): SaveData {
  if (!local) return remote;
  const rooms = { ...remote.rooms };
  for (const [room, progress] of Object.entries(local.rooms)) {
    const image = progress.field?.evidence.image;
    const target = rooms[Number(room)];
    if (image && target?.field && !target.field.evidence.image) rooms[Number(room)] = { ...target, field: { ...target.field, evidence: { ...target.field.evidence, image } } };
  }
  return { ...remote, rooms };
}

/** รหัสห้องเรียน: ตัวอักษรอังกฤษ ตัวเลข ขีด 1–20 ตัว ตรงกับที่ supabase/schema.sql ตรวจ */
export const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{1,20}$/;
export const normalizeClassCode = (text: string): string => text.trim().toUpperCase();
