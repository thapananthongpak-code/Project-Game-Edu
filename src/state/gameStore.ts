import { create } from "zustand";
import { stationsOf } from "../content";
import type { FormId } from "../content/schema";
import { type MinigameState, roomStartTier, shouldSuggestStyleChange } from "./adaptive";
import type { LearningStyle, Tier } from "./adaptive.config";
import type { FieldProgress } from "./field";
import {
  type AssessmentResult,
  emptyRoom,
  LocalProgressStore,
  type Profile,
  type ProgressStore,
  type RoomProgress,
  SAVE_VERSION,
  type SaveData,
  SyncedProgressStore,
  type SyncStatus,
} from "./progressStore";

export type { RoomProgress } from "./progressStore";

export type Screen = "menu" | "onboarding" | "hall" | "room";
export type Overlay = null | "dialogue" | "minigame" | "review" | "reward" | "questlog" | "field" | "posttest" | "certificate";

/** ป้าย HTML ที่วางทับฉากเกม พิกัดเป็นพิกเซลของความละเอียดฐาน 640×360 */
export interface WorldLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  tone?: "default" | "done" | "locked";
}

interface GameState {
  /** โหลดภาพของเกมเสร็จแล้ว */
  ready: boolean;
  /** อ่านความคืบหน้าจากที่เก็บข้อมูลเสร็จแล้ว */
  hydrated: boolean;
  /** สถานะการส่งขึ้นฐานข้อมูลกลาง local = เก็บในเครื่องอย่างเดียว */
  sync: SyncStatus;
  /** รหัสสำหรับเล่นต่อจากเครื่องอื่น มีเมื่อบันทึกขึ้นฐานข้อมูลกลางแล้ว */
  resumeCode: string | null;
  screen: Screen;
  room: number | null;
  overlay: Overlay;
  stationIndex: number | null;
  /** หน้าต่างถามพี่บิต เปิดซ้อนบนหน้าต่างอื่นได้ */
  tutorOpen: boolean;
  /** พี่บิตเสนอให้เปลี่ยนสไตล์การเรียน หลังถูกบังคับเข้าห้องซ่อมหลายห้องติดกัน (GDD ข้อ 7.2) */
  styleSuggestion: boolean;
  prompt: string | null;
  toast: { id: number; text: string } | null;
  labels: WorldLabel[];

  profile: Profile | null;
  pretest: AssessmentResult | null;
  posttest: AssessmentResult | null;
  progress: Record<number, RoomProgress>;

  setReady: () => void;
  hydrate: (data: SaveData | null) => void;
  setSync: (sync: SyncStatus, resumeCode: string | null) => void;
  newGame: () => void;
  continueGame: () => void;
  toMenu: () => void;
  setProfile: (profile: Profile) => void;
  setStyle: (style: LearningStyle) => void;
  completePretest: (result: AssessmentResult) => void;
  completePosttest: (result: AssessmentResult) => void;
  enterRoom: (room: number) => void;
  exitToHall: () => void;
  openStation: (index: number) => void;
  closeDialogue: (finished: boolean) => void;
  openOverlay: (overlay: Exclude<Overlay, "dialogue">) => void;
  closeOverlay: () => void;
  setTutorOpen: (open: boolean) => void;
  completeMinigame: (result: MinigameState) => void;
  recordMisses: (labels: string[]) => void;
  recordTutor: (kind: "ai" | "hints") => void;
  addRoomTime: (room: number, ms: number) => void;
  dismissStyleSuggestion: () => void;
  saveReview: (answers: string[]) => void;
  setField: (field: FieldProgress) => void;
  collectCore: () => void;
  setPrompt: (prompt: string | null) => void;
  showToast: (text: string) => void;
  clearToast: (id: number) => void;
  setLabels: (labels: WorldLabel[]) => void;
}

let toastId = 0;

export const useGameStore = create<GameState>()((set, get) => {
  const updateRoom = (patch: (p: RoomProgress) => Partial<RoomProgress>, room = get().room) => {
    const { progress } = get();
    if (room === null) return;
    const current = progress[room] ?? emptyRoom();
    set({ progress: { ...progress, [room]: { ...current, ...patch(current) } } });
  };
  const closed = { room: null, overlay: null, stationIndex: null, prompt: null, tutorOpen: false } as const;

  return {
    ready: false,
    hydrated: false,
    sync: "local",
    resumeCode: null,
    screen: "menu",
    room: null,
    overlay: null,
    stationIndex: null,
    tutorOpen: false,
    styleSuggestion: false,
    prompt: null,
    toast: null,
    labels: [],
    profile: null,
    pretest: null,
    posttest: null,
    progress: {},

    setReady: () => set({ ready: true }),
    hydrate: (data) => set({ hydrated: true, profile: data?.profile ?? null, pretest: data?.pretest ?? null, posttest: data?.posttest ?? null, progress: data?.rooms ?? {} }),
    setSync: (sync, resumeCode) => set({ sync, resumeCode }),

    // เริ่มใหม่: ล้างทุกอย่างแล้วเข้าขั้นตั้งชื่อ เลือกสไตล์ และแบบทดสอบก่อนเรียน (GDD ข้อ 3)
    newGame: () => set({ ...closed, profile: null, pretest: null, posttest: null, progress: {}, styleSuggestion: false, screen: "onboarding" }),
    continueGame: () => {
      const { profile, pretest } = get();
      set({ ...closed, screen: profile && pretest ? "hall" : "onboarding" });
    },
    toMenu: () => set({ ...closed, screen: "menu" }),
    setProfile: (profile) => set({ profile }),
    setStyle: (style) => {
      const { profile } = get();
      if (profile) set({ profile: { ...profile, style } });
    },
    completePretest: (result) => set({ pretest: result, screen: "hall" }),
    completePosttest: (result) => set({ posttest: result }),

    enterRoom: (room) => {
      const { progress } = get();
      set({ ...closed, screen: "room", room, progress: { ...progress, [room]: progress[room] ?? emptyRoom() } });
    },
    exitToHall: () => set({ ...closed, screen: "hall" }),

    openStation: (index) => set({ overlay: "dialogue", stationIndex: index, prompt: null }),
    closeDialogue: (finished) => {
      const { stationIndex, room } = get();
      if (finished && stationIndex !== null && room !== null) {
        const total = stationsOf(room).length;
        // นับเฉพาะสถานีถัดไปที่ยังไม่เคยฟังจบ การฟังซ้ำไม่เพิ่มตัวนับ
        updateRoom((p) => (stationIndex === p.stationsSeen ? { stationsSeen: Math.min(total, p.stationsSeen + 1) } : {}));
      }
      set({ overlay: null, stationIndex: null });
    },
    openOverlay: (overlay) => set({ overlay, prompt: null }),
    closeOverlay: () => set({ overlay: null, stationIndex: null }),
    setTutorOpen: (tutorOpen) => set({ tutorOpen }),

    completeMinigame: (result) => {
      updateRoom((p) => ({
        minigameDone: true,
        stars: Math.max(p.stars, result.stars),
        outcome: { totalMisses: result.totalMisses, requiredRepair: result.requiredRepair },
        summary: { checks: result.summary.checks, correct: result.summary.correct, totalTimeMs: result.summary.totalTimeMs, repairVisits: result.repairVisits },
      }));
      // ผลของห้องที่เล่นจบแล้วเรียงตามลำดับห้อง จนถึงห้องนี้
      const { progress, room } = get();
      const outcomes = Array.from({ length: room ?? 0 }, (_, i) => progress[i + 1]?.outcome).filter((o) => o != null);
      if (result.requiredRepair && shouldSuggestStyleChange(outcomes)) set({ styleSuggestion: true });
    },
    recordMisses: (labels) =>
      updateRoom((p) => {
        const missed = { ...p.missed };
        for (const label of labels) missed[label] = (missed[label] ?? 0) + 1;
        return { missed };
      }),
    recordTutor: (kind) => updateRoom((p) => ({ tutor: { ...p.tutor, [kind]: p.tutor[kind] + 1 } })),
    // รับเลขห้องตรง ๆ เพราะช่วงเวลาสุดท้ายถูกบันทึกหลังผู้เล่นออกจากห้องแล้ว
    addRoomTime: (room, ms) => updateRoom((p) => ({ timeMs: p.timeMs + ms }), room),
    dismissStyleSuggestion: () => set({ styleSuggestion: false }),
    saveReview: (answers) => updateRoom(() => ({ reviewAnswers: answers, reviewDone: true })),
    setField: (field) => updateRoom(() => ({ field })),
    collectCore: () => updateRoom((p) => (p.core ? {} : { core: true, coreAt: new Date().toISOString() })),

    setPrompt: (prompt) => {
      if (get().prompt !== prompt) set({ prompt });
    },
    showToast: (text) => set({ toast: { id: ++toastId, text } }),
    clearToast: (id) => {
      if (get().toast?.id === id) set({ toast: null });
    },
    setLabels: (labels) => set({ labels }),
  };
});

type Saved = Pick<GameState, "profile" | "pretest" | "posttest" | "progress">;

export const roomProgress = (state: Pick<GameState, "progress">, room: number): RoomProgress => state.progress[room] ?? emptyRoom();

/** ห้อง N เปิดเมื่อเป็นห้องแรก หรือมีแกน AI ของห้อง N-1 (GDD ข้อ 4.4) */
export const isRoomUnlocked = (state: Pick<GameState, "progress">, room: number): boolean =>
  room === 1 || roomProgress(state, room - 1).core;

export const coreCount = (state: Pick<GameState, "progress">): number =>
  Object.values(state.progress).filter((p) => p.core).length;

/** ระดับเริ่มต้นของมินิเกมในห้อง จากแบบทดสอบก่อนเรียนและผลของห้องก่อนหน้า (GDD ข้อ 7.1–7.2) */
export const startTierOf = (state: Pick<GameState, "pretest" | "progress">, room: number): Tier =>
  roomStartTier(state.pretest?.correctByTopic[room] ?? 0, state.progress[room - 1]?.outcome ?? null);

export const hasSave = (state: Saved): boolean => state.profile !== null || Object.keys(state.progress).length > 0;

const toSaveData = (state: Saved): SaveData => ({
  version: SAVE_VERSION,
  updatedAt: new Date().toISOString(),
  profile: state.profile,
  pretest: state.pretest,
  posttest: state.posttest,
  rooms: state.progress,
});

/** ชุดข้อสอบก่อนเรียนของผู้เล่นใหม่: สุ่มครึ่งหนึ่งได้ชุด A อีกครึ่งได้ชุด B (docs/EVALUATION_PLAN.md) */
export const randomForm = (): FormId => (Math.random() < 0.5 ? "A" : "B");

let activeStore: ProgressStore | null = null;
/** วิธีล้างข้อมูลของการเริ่มเกมใหม่ครั้งถัดไป (ดู startNewGame) */
let clearMode: "restart" | "switch" = "restart";

/**
 * เริ่มเกมใหม่
 * - restart: ผู้เรียนคนเดิมเริ่มใหม่ทั้งหมด ข้อมูลชุดเดิมในฐานข้อมูลกลางถูกเก็บถาวร
 * - switch: ผู้เรียนคนใหม่มาใช้เครื่องนี้ ข้อมูลของคนเดิมในฐานข้อมูลกลางยังอยู่และเล่นต่อได้ด้วยรหัส
 * ถ้าเก็บในเครื่องอย่างเดียว สองแบบให้ผลเหมือนกัน คือสำเนาในเครื่องถูกลบ
 */
export function startNewGame(mode: "restart" | "switch"): void {
  clearMode = mode;
  useGameStore.getState().newGame();
}

/** ที่เก็บข้อมูลตามการตั้งค่า: มีค่า Supabase จึงซิงก์กับฐานข้อมูลกลาง ไม่มีก็เก็บในเครื่องอย่างเดียว */
export async function createProgressStore(): Promise<ProgressStore> {
  const local = new LocalProgressStore(window.localStorage);
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return local;
  // โหลดไลบรารี Supabase เฉพาะเมื่อใช้จริง
  const { createSupabaseBackend } = await import("./supabaseBackend");
  return new SyncedProgressStore(local, createSupabaseBackend(url, anonKey), { onStatus: (sync, code) => useGameStore.getState().setSync(sync, code) });
}

/**
 * ต่อ store ของเกมเข้ากับที่เก็บความคืบหน้า: อ่านครั้งแรก แล้วบันทึกทุกครั้งที่ข้อมูลผู้เล่นเปลี่ยน
 * คืนฟังก์ชันสำหรับเลิกติดตาม
 */
export async function connectProgressStore(store?: ProgressStore): Promise<() => void> {
  const target = store ?? (await createProgressStore());
  activeStore = target;
  useGameStore.getState().hydrate(await target.load());
  const flush = () => {
    if (document.visibilityState === "hidden" && target instanceof SyncedProgressStore) void target.flush();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", flush);
  const unsubscribe = useGameStore.subscribe((state, previous) => {
    if (state.profile === previous.profile && state.pretest === previous.pretest && state.posttest === previous.posttest && state.progress === previous.progress) return;
    if (hasSave(state)) void target.save(toSaveData(state));
    else void (clearMode === "switch" && target instanceof SyncedProgressStore ? target.detach() : target.clear());
    clearMode = "restart";
  });
  return () => {
    unsubscribe();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", flush);
  };
}

/** ที่เก็บข้อมูลซิงก์กับฐานข้อมูลกลางอยู่หรือไม่ (ใช้ตัดสินว่าจะแสดงช่องรหัสห้องเรียนและรหัสเล่นต่อ) */
export const cloudEnabled = (): boolean => activeStore instanceof SyncedProgressStore;

/** เล่นต่อจากเครื่องอื่นด้วยรหัสเล่นต่อ คืน false ถ้ารหัสไม่ถูก โยน error ถ้าเชื่อมต่อไม่ได้ */
export async function claimProgress(code: string): Promise<boolean> {
  if (!(activeStore instanceof SyncedProgressStore)) return false;
  const data = await activeStore.claim(code);
  if (!data) return false;
  useGameStore.getState().hydrate(data);
  return true;
}
