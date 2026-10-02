import { create } from "zustand";
import { course, ROOM_COUNT, stationsOf } from "../content";
import type { FormId } from "../content/schema";
import { storyBeats, zoneBeat } from "../content/story";
import type { TrackName } from "../audio/tracks";
import { type MinigameState, roomStartTier } from "./adaptive";
import type { Tier } from "./adaptive.config";
import { type BattleSpec, campaignOf, type Difficulty, type DifficultySpec, gateOf } from "./campaign";
import { emptyField, type FieldProgress, fieldStatus } from "./field";
import {
  type AccountInfo,
  type AssessmentResult,
  type BattleRecord,
  emptyBattle,
  emptyRoom,
  emptyShop,
  LocalProgressStore,
  type Profile,
  type ProgressStore,
  type RoomProgress,
  SAVE_VERSION,
  type SaveData,
  type ShopState,
  SyncedProgressStore,
  type SyncStatus,
} from "./progressStore";
import { emptyNpc, type NpcId, type NpcRecord, NPCS } from "./npcs";
import { MIN_ANSWER_CHARS } from "./rules";
import { creditBalance, type Earning, equip, type EquipKind, packBag, powerOf, purchase, type PurchaseError } from "./shop";
import type { Avatar, Supply } from "./shop.config";

export type { RoomProgress } from "./progressStore";

export type Screen = "menu" | "onboarding" | "hall" | "hangar" | "room";
export type Overlay = null | "dialogue" | "minigame" | "review" | "reward" | "questlog" | "field" | "posttest" | "certificate" | "story" | "battle" | "shop" | "missions" | "npc" | "storage";

/** เพลงที่หน้าต่างที่เปิดอยู่ขอให้เล่น (ด่านต่อสู้เปลี่ยนตามร่างของบอสและพลังที่เหลือ ฉากเนื้อเรื่องเปลี่ยนตามอารมณ์ของช่อง) */
export interface MusicCue {
  name: TrackName;
  variant?: number;
}

/** stationIndex พิเศษ: เปิดคลังความรู้ของหัวข้อ (บทสอนทุกสถานีต่อกัน ใช้ในระดับกลางที่ไม่บังคับฟังสถานี) */
export const ARCHIVE = -1;

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
  /** บัญชีที่เครื่องนี้ใช้กับฐานข้อมูลกลาง (null = ยังไม่เคยส่งข้อมูล) */
  account: AccountInfo | null;
  screen: Screen;
  /** ห้องที่ผู้เล่นอยู่ (ลำดับห้องของระดับความยาก นับจาก 1) ห้องหนึ่งสอนได้หลายหัวข้อ */
  zone: number | null;
  /** หัวข้อ (1–6) ที่หน้าต่างและ HUD กำลังทำงานด้วย ในระดับง่ายเท่ากับเลขห้องเสมอ */
  room: number | null;
  overlay: Overlay;
  stationIndex: number | null;
  /** ฉากเนื้อเรื่องที่กำลังแสดง (รหัสใน src/content/story.ts) */
  storyBeat: string | null;
  /** ด่านต่อสู้ที่กำลังเล่น (รหัสด่านใน src/state/campaign.ts) */
  battleId: string | null;
  /** NPC ที่กำลังคุยด้วย */
  npcId: NpcId | null;
  /** ร้านที่เปิดอยู่เป็นร้านพิเศษของ NPC คนนี้ (null = ร้านสหกรณ์แล็บหรือตู้เสื้อผ้า) */
  shopVendor: NpcId | null;
  musicCue: MusicCue | null;
  /** หน้าต่างถามพี่บิต เปิดซ้อนบนหน้าต่างอื่นได้ */
  tutorOpen: boolean;
  /** หัวข้อที่พี่บิตตอบคำถาม: หัวข้อที่ผู้เล่นทำอยู่ หรือหัวข้อของโจทย์ในด่านต่อสู้ */
  tutorRoom: number | null;
  prompt: string | null;
  toast: { id: number; text: string } | null;
  labels: WorldLabel[];

  profile: Profile | null;
  pretest: AssessmentResult | null;
  posttest: AssessmentResult | null;
  progress: Record<number, RoomProgress>;
  battles: Record<string, BattleRecord>;
  npcs: Record<string, NpcRecord>;
  story: string[];
  shop: ShopState;

  setReady: () => void;
  hydrate: (data: SaveData | null) => void;
  setSync: (sync: SyncStatus, resumeCode: string | null) => void;
  setAccount: (account: AccountInfo | null) => void;
  newGame: () => void;
  continueGame: () => void;
  toMenu: () => void;
  setProfile: (profile: Profile) => void;
  setAvatar: (avatar: Avatar) => void;
  completePretest: (result: AssessmentResult) => void;
  completePosttest: (result: AssessmentResult) => void;
  /** เข้าห้องลำดับที่ zone ของระดับความยากนี้ */
  enterRoom: (zone: number) => void;
  /** เลือกหัวข้อที่จะทำงานด้วย (ห้องที่มีหลายหัวข้อ) */
  focusTopic: (topic: number) => void;
  exitToHall: () => void;
  enterHangar: () => void;
  openStory: (beat: string) => void;
  /** ปิดฉากเนื้อเรื่องและบันทึกว่าดูแล้ว */
  finishStory: () => void;
  openBattle: (id: string) => void;
  /** บันทึกผลการออกปฏิบัติการหนึ่งครั้ง */
  recordBattle: (id: string, result: { won: boolean; asked: number; correct: number }) => void;
  buy: (itemId: string) => PurchaseError | null;
  equip: (kind: EquipKind, value: string) => void;
  /** จัดของใช้ลงกระเป๋า (ไม่เกิน BAG_SIZE ชิ้น ที่เหลืออยู่ในกล่องเก็บไอเทม) */
  packBag: (wanted: readonly Supply[]) => void;
  /** เปิดร้าน: ไม่ระบุ = ร้านสหกรณ์แล็บ ระบุ NPC = ร้านพิเศษของคนนั้น */
  openShop: (vendor?: NpcId) => void;
  openNpc: (id: NpcId) => void;
  /** รับเควสเสริมของ NPC */
  acceptQuest: (id: NpcId) => void;
  /** เก็บของชิ้นที่ index ของเควสเสริม คืนจำนวนที่เก็บได้แล้ว */
  collectPickup: (id: NpcId, index: number) => number;
  /** ส่งของที่เก็บครบแล้วให้ NPC */
  completeQuest: (id: NpcId) => void;
  /** บันทึกผลถามตอบพิเศษหนึ่งรอบ */
  recordQuiz: (id: NpcId, correct: number) => void;
  setMusicCue: (cue: MusicCue | null) => void;
  /** ใช้ของหนึ่งชิ้นในด่านต่อสู้ คืน false ถ้าไม่มีของ */
  consumeSupply: (supply: Supply) => boolean;
  openStation: (index: number) => void;
  closeDialogue: (finished: boolean) => void;
  openOverlay: (overlay: Exclude<Overlay, "dialogue">) => void;
  closeOverlay: () => void;
  setTutorOpen: (open: boolean, room?: number) => void;
  completeMinigame: (result: MinigameState) => void;
  recordMisses: (labels: string[]) => void;
  recordTutor: (kind: "ai" | "hints") => void;
  addRoomTime: (room: number, ms: number) => void;
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
  const closed = { zone: null, room: null, overlay: null, stationIndex: null, storyBeat: null, battleId: null, npcId: null, shopVendor: null, musicCue: null, prompt: null, tutorOpen: false, tutorRoom: null } as const;
  const updateNpc = (id: NpcId, patch: (record: NpcRecord) => Partial<NpcRecord>) => {
    const { npcs } = get();
    const current = npcs[id] ?? emptyNpc();
    set({ npcs: { ...npcs, [id]: { ...current, ...patch(current) } } });
  };

  return {
    ready: false,
    hydrated: false,
    sync: "local",
    resumeCode: null,
    account: null,
    screen: "menu",
    zone: null,
    room: null,
    overlay: null,
    stationIndex: null,
    storyBeat: null,
    battleId: null,
    npcId: null,
    shopVendor: null,
    musicCue: null,
    tutorOpen: false,
    tutorRoom: null,
    prompt: null,
    toast: null,
    labels: [],
    profile: null,
    pretest: null,
    posttest: null,
    progress: {},
    battles: {},
    npcs: {},
    story: [],
    shop: emptyShop(),

    setReady: () => set({ ready: true }),
    hydrate: (data) =>
      set({
        hydrated: true,
        profile: data?.profile ?? null,
        pretest: data?.pretest ?? null,
        posttest: data?.posttest ?? null,
        progress: data?.rooms ?? {},
        battles: data?.battles ?? {},
        npcs: data?.npcs ?? {},
        story: data?.story ?? [],
        shop: data?.shop ?? emptyShop(),
      }),
    setSync: (sync, resumeCode) => set({ sync, resumeCode }),
    setAccount: (account) => set({ account }),

    // เริ่มใหม่: ล้างทุกอย่างแล้วเข้าขั้นตั้งชื่อ เลือกระดับความยาก และแบบทดสอบก่อนเรียน (GDD ข้อ 3)
    newGame: () => set({ ...closed, profile: null, pretest: null, posttest: null, progress: {}, battles: {}, npcs: {}, story: [], shop: emptyShop(), screen: "onboarding" }),
    continueGame: () => {
      const { profile, pretest } = get();
      set({ ...closed, screen: profile && pretest ? "hall" : "onboarding" });
    },
    toMenu: () => set({ ...closed, screen: "menu" }),
    setProfile: (profile) => set({ profile }),
    setAvatar: (avatar) => {
      const { profile } = get();
      if (profile) set({ profile: { ...profile, avatar } });
    },
    completePretest: (result) => set({ pretest: result, screen: "hall" }),
    completePosttest: (result) => set({ posttest: result }),

    enterRoom: (zone) => {
      const state = get();
      const topics = planOf(state).zones[zone - 1]?.topics ?? [];
      // หัวข้อที่กำลังทำ = หัวข้อแรกของห้องที่ยังไม่ได้แกน AI (ครบแล้วใช้หัวข้อสุดท้าย)
      const room = topics.find((topic) => !roomProgress(state, topic).core) ?? topics[topics.length - 1] ?? null;
      if (room === null) return;
      set({ ...closed, screen: "room", zone, room, progress: { ...state.progress, [room]: state.progress[room] ?? emptyRoom() } });
    },
    focusTopic: (topic) => {
      const { progress, room } = get();
      if (room !== topic || !progress[topic]) set({ room: topic, progress: { ...progress, [topic]: progress[topic] ?? emptyRoom() } });
    },
    exitToHall: () => set({ ...closed, screen: "hall" }),
    enterHangar: () => set({ ...closed, screen: "hangar" }),

    openStory: (beat) => set({ overlay: "story", storyBeat: beat, prompt: null }),
    finishStory: () => {
      const { storyBeat, story } = get();
      set({ overlay: null, storyBeat: null, musicCue: null, story: storyBeat && !story.includes(storyBeat) ? [...story, storyBeat] : story });
    },
    openBattle: (id) => set({ overlay: "battle", battleId: id, prompt: null }),
    recordBattle: (id, result) => {
      const { battles } = get();
      const before = battles[id] ?? emptyBattle();
      set({ battles: { ...battles, [id]: { won: before.won || result.won, wins: before.wins + (result.won ? 1 : 0), sorties: before.sorties + 1, asked: before.asked + result.asked, correct: before.correct + result.correct } } });
    },
    buy: (itemId) => {
      const state = get();
      const result = purchase(state.shop, itemId, creditBalance(earningOf(state), state.shop));
      if (typeof result === "string") return result;
      set({ shop: result });
      return null;
    },
    equip: (kind, value) => set({ shop: equip(get().shop, kind, value) }),
    packBag: (wanted) => set({ shop: packBag(get().shop, wanted) }),
    openShop: (vendor) => set({ overlay: "shop", shopVendor: vendor ?? null, npcId: null, prompt: null }),
    openNpc: (id) => set({ overlay: "npc", npcId: id, prompt: null }),
    acceptQuest: (id) => updateNpc(id, () => ({ accepted: true })),
    collectPickup: (id, index) => {
      updateNpc(id, (record) => (record.accepted && !record.done && !record.found.includes(index) && index >= 0 && index < NPCS[id].pickups ? { found: [...record.found, index] } : {}));
      return get().npcs[id]?.found.length ?? 0;
    },
    completeQuest: (id) => updateNpc(id, (record) => (record.found.length >= NPCS[id].pickups ? { done: true } : {})),
    recordQuiz: (id, correct) => updateNpc(id, (record) => ({ best: Math.max(record.best, Math.min(NPCS[id].questions, Math.max(0, correct))), tries: record.tries + 1 })),
    setMusicCue: (musicCue) => {
      const current = get().musicCue;
      if (current?.name !== musicCue?.name || (current?.variant ?? 0) !== (musicCue?.variant ?? 0)) set({ musicCue });
    },
    consumeSupply: (supply) => {
      const { shop } = get();
      if (shop.supplies[supply] <= 0) return false;
      set({ shop: { ...shop, supplies: { ...shop.supplies, [supply]: shop.supplies[supply] - 1 } } });
      return true;
    },

    openStation: (index) => set({ overlay: "dialogue", stationIndex: index, prompt: null }),
    closeDialogue: (finished) => {
      const { stationIndex, room } = get();
      if (finished && stationIndex !== null && room !== null) {
        const total = stationsOf(room).length;
        // คลังความรู้: อ่านจบทั้งหัวข้อในครั้งเดียว สถานี: นับเฉพาะสถานีถัดไปที่ยังไม่เคยฟังจบ การฟังซ้ำไม่เพิ่มตัวนับ
        if (stationIndex === ARCHIVE) updateRoom(() => ({ stationsSeen: total }));
        else updateRoom((p) => (stationIndex === p.stationsSeen ? { stationsSeen: Math.min(total, p.stationsSeen + 1) } : {}));
      }
      set({ overlay: null, stationIndex: null, room: focusAfter(get()) });
    },
    openOverlay: (overlay) => set({ overlay, prompt: null }),
    closeOverlay: () => set({ overlay: null, stationIndex: null, storyBeat: null, battleId: null, npcId: null, shopVendor: null, musicCue: null, room: focusAfter(get()) }),
    setTutorOpen: (tutorOpen, room) => set({ tutorOpen, tutorRoom: tutorOpen ? (room ?? get().room) : null }),

    completeMinigame: (result) => {
      updateRoom((p) => ({
        minigameDone: true,
        stars: Math.max(p.stars, result.stars),
        outcome: { totalMisses: result.totalMisses, requiredRepair: result.requiredRepair },
        summary: { checks: result.summary.checks, correct: result.summary.correct, totalTimeMs: result.summary.totalTimeMs, repairVisits: result.repairVisits },
      }));
      // ระดับที่ไม่มีบทสอนและคำถามทบทวน: ผ่านเควสแล้วได้แกน AI ของหัวข้อนั้นทันที
      const state = get();
      if (state.room !== null && autoCore(planOf(state)) && !isFieldTopic(state.room)) updateRoom((p) => (p.core ? {} : { core: true, coreAt: new Date().toISOString() }));
    },
    recordMisses: (labels) =>
      updateRoom((p) => {
        const missed = { ...p.missed };
        for (const label of labels) missed[label] = (missed[label] ?? 0) + 1;
        return { missed };
      }),
    // นับให้หัวข้อที่ถาม: หัวข้อที่ผู้เล่นทำอยู่ หรือหัวข้อของโจทย์ในด่านต่อสู้
    recordTutor: (kind) => updateRoom((p) => ({ tutor: { ...p.tutor, [kind]: p.tutor[kind] + 1 } }), get().tutorRoom ?? get().room),
    // รับเลขหัวข้อตรง ๆ เพราะช่วงเวลาสุดท้ายถูกบันทึกหลังผู้เล่นออกจากห้องแล้ว
    addRoomTime: (room, ms) => updateRoom((p) => ({ timeMs: p.timeMs + ms }), room),
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

type Saved = Pick<GameState, "profile" | "pretest" | "posttest" | "progress" | "battles" | "npcs" | "story" | "shop">;
type Level = Pick<GameState, "profile">;
type Run = Pick<GameState, "profile" | "progress" | "battles">;

export const roomProgress = (state: Pick<GameState, "progress">, room: number): RoomProgress => state.progress[room] ?? emptyRoom();

export const difficultyOf = (state: Level): Difficulty => state.profile?.difficulty ?? "easy";

/** โครงของระดับความยากที่ผู้เล่นเลือก: ห้อง ด่านต่อสู้ และตัวช่วย (src/state/campaign.ts) */
export const planOf = (state: Level): DifficultySpec => campaignOf(state.profile?.difficulty);

/** หัวข้อที่ HUD ควรแสดงหลังปิดหน้าต่าง: ถ้าหัวข้อที่ทำอยู่ได้แกน AI แล้ว เลื่อนไปหัวข้อถัดไปของห้องที่ยังไม่ได้ */
function focusAfter(state: Pick<GameState, "screen" | "zone" | "room" | "profile" | "progress">): number | null {
  if (state.screen !== "room" || state.zone === null || state.room === null || !roomProgress(state, state.room).core) return state.room;
  const topics = planOf(state).zones[state.zone - 1]?.topics ?? [];
  return topics.find((topic) => !roomProgress(state, topic).core) ?? state.room;
}

/** หัวข้อสุดท้ายเป็นภารกิจภาคสนาม ไม่มีเควสและคำถามทบทวน */
const isFieldTopic = (topic: number): boolean => topic === ROOM_COUNT;

/** ระดับที่ผ่านเควสแล้วได้แกน AI ทันที (ไม่มีบทสอนและไม่มีคำถามทบทวน) */
export const autoCore = (level: DifficultySpec): boolean => level.stations === "none" && !level.review;

/** ภารกิจภาคสนามครบตามเงื่อนไขหรือยัง (GDD ข้อ 6.5) */
export const fieldComplete = (p: RoomProgress): boolean => fieldStatus(p.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete;

export type TopicStep = "station" | "minigame" | "review" | "core" | "field" | "posttest" | "done";

/** ขั้นถัดไปของหัวข้อตามระดับความยาก (GDD ข้อ 4.1 และ 15) */
export function nextStepOf(state: Pick<GameState, "profile" | "progress" | "posttest">, topic: number): TopicStep {
  const p = roomProgress(state, topic);
  if (p.core) return "done";
  if (isFieldTopic(topic)) return !fieldComplete(p) ? "field" : state.posttest ? "core" : "posttest";
  const level = planOf(state);
  if (level.stations === "required" && p.stationsSeen < stationsOf(topic).length) return "station";
  if (!p.minigameDone) return "minigame";
  if (level.review && !p.reviewDone) return "review";
  return "core";
}

/** หัวข้อนี้ทำได้แล้วหรือยัง: หัวข้อแรกของห้อง หรือหัวข้อก่อนหน้าในห้องเดียวกันได้แกน AI แล้ว (เนื้อหาต่อยอดกันตามลำดับ) */
export function isTopicOpen(state: Pick<GameState, "profile" | "progress">, topic: number): boolean {
  const zone = planOf(state).zones.find((z) => z.topics.includes(topic));
  const index = zone?.topics.indexOf(topic) ?? 0;
  return index <= 0 || roomProgress(state, (zone as { topics: readonly number[] }).topics[index - 1]).core;
}

/** ห้องลำดับที่ zone เปิดเมื่อเป็นห้องแรก หรือได้แกน AI ครบทุกหัวข้อของห้องก่อนหน้า และชนะด่านที่เฝ้าห้องนี้แล้ว (GDD ข้อ 4.4 และ 12) */
export function isRoomUnlocked(state: Run, zone: number): boolean {
  if (zone <= 1) return true;
  const level = planOf(state);
  const previous = level.zones[zone - 2];
  if (!previous || !previous.topics.every((topic) => roomProgress(state, topic).core)) return false;
  const gate = gateOf(difficultyOf(state), zone);
  return !gate || (state.battles[gate.id]?.won ?? false);
}

/** ด่านต่อสู้ที่ออกปฏิบัติการได้ตอนนี้: ด่านแรกตามลำดับที่ยังไม่ชนะ และมีแกน AI ที่ด่านต้องใช้ครบแล้ว ไม่มีคืน null */
export function pendingBattle(state: Run): BattleSpec | null {
  const next = planOf(state).battles.find((battle) => !state.battles[battle.id]?.won);
  return next && next.requires.every((topic) => roomProgress(state, topic).core) ? next : null;
}

/** ชนะครบทุกด่านของระดับความยากนี้แล้ว */
export const allBattlesWon = (state: Run): boolean => planOf(state).battles.every((battle) => state.battles[battle.id]?.won);

export const battlesWon = (state: Run): number => planOf(state).battles.filter((battle) => state.battles[battle.id]?.won).length;

/** ค่าพลังรวมของการ์เดียนตอนนี้ (เทียบกับ BattleSpec.power ของด่าน เป็นคำแนะนำเท่านั้น) */
export const guardianPowerOf = (state: Pick<GameState, "profile" | "shop">): number => powerOf(state.profile?.difficulty, state.shop);

/**
 * ฉากเนื้อเรื่องที่ควรแสดงตอนนี้ (ยังไม่เคยดู) ไม่มีคืน null
 * บทนำ: เมื่อเข้าแล็บครั้งแรก, ฉากหลังชนะไคจูประจำห้อง: ทันทีที่กลับจากด่านต่อสู้, บรรยายสรุปของห้อง: เมื่อเข้าห้องนั้นครั้งแรก, บทส่งท้าย: เมื่อชนะครบทุกด่าน
 */
export function pendingStory(state: Pick<GameState, "screen" | "zone" | "story" | "pretest" | "progress" | "battles" | "profile">): string | null {
  if (state.screen !== "hall" && state.screen !== "hangar" && state.screen !== "room") return null;
  const unseen = (beat: string) => !state.story.includes(beat);
  if (state.pretest && unseen("prologue")) return "prologue";
  const won = planOf(state).battles.find((battle) => state.battles[battle.id]?.won && winBeat(battle.id) in storyBeats && unseen(winBeat(battle.id)));
  if (won) return winBeat(won.id);
  if (state.screen === "room" && state.zone !== null && unseen(zoneBeat(difficultyOf(state), state.zone))) return zoneBeat(difficultyOf(state), state.zone);
  if (allBattlesWon(state) && unseen("ending")) return "ending";
  return null;
}

/** รหัสฉากเนื้อเรื่องหลังชนะด่านต่อสู้ (มีเฉพาะไคจูประจำห้อง บอสใช้บทส่งท้าย) */
export const winBeat = (battleId: string): string => `win-${battleId}`;

export const coreCount = (state: Pick<GameState, "progress">): number =>
  Object.values(state.progress).filter((p) => p.core).length;

/** ระดับเริ่มต้นของมินิเกมของหัวข้อ จากแบบทดสอบก่อนเรียน ผลของหัวข้อก่อนหน้า และระดับความยากของเกม (GDD ข้อ 7.1–7.2 และ 15) */
export const startTierOf = (state: Pick<GameState, "pretest" | "progress" | "profile">, room: number): Tier =>
  roomStartTier(state.pretest?.correctByTopic[room] ?? 0, state.progress[room - 1]?.outcome ?? null, planOf(state).minTier);

/** ข้อมูลที่ใช้คำนวณเครดิตวิจัย */
export const earningOf = (state: Pick<GameState, "profile" | "progress" | "battles" | "npcs" | "posttest">): Earning => ({ difficulty: state.profile?.difficulty, rooms: state.progress, battles: state.battles, npcs: state.npcs, posttest: state.posttest });

export const creditsOf = (state: Pick<GameState, "profile" | "progress" | "battles" | "npcs" | "posttest" | "shop">): number => creditBalance(earningOf(state), state.shop);

export const hasSave = (state: Saved): boolean => state.profile !== null || Object.keys(state.progress).length > 0;

const toSaveData = (state: Saved): SaveData => ({
  version: SAVE_VERSION,
  updatedAt: new Date().toISOString(),
  profile: state.profile,
  pretest: state.pretest,
  posttest: state.posttest,
  rooms: state.progress,
  battles: state.battles,
  npcs: state.npcs,
  story: state.story,
  shop: state.shop,
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
  return new SyncedProgressStore(local, createSupabaseBackend(url, anonKey), {
    onStatus: (sync, code) => useGameStore.getState().setSync(sync, code),
    onAccount: (account) => useGameStore.getState().setAccount(account),
  });
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
    if (
      state.profile === previous.profile &&
      state.pretest === previous.pretest &&
      state.posttest === previous.posttest &&
      state.progress === previous.progress &&
      state.battles === previous.battles &&
      state.npcs === previous.npcs &&
      state.story === previous.story &&
      state.shop === previous.shop
    )
      return;
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

/** แสดงปุ่มเข้าสู่ระบบด้วย Google หรือไม่: ต้องตั้ง VITE_GOOGLE_LOGIN=1 และเปิดผู้ให้บริการ Google ใน Supabase แล้ว (ดู README) */
export const googleLoginEnabled = (): boolean => activeStore instanceof SyncedProgressStore && activeStore.supportsGoogle && import.meta.env.VITE_GOOGLE_LOGIN === "1";

/** สถานะของการล็อกอินกับ Google ครั้งล่าสุดที่ต้องบอกผู้เล่น */
export const googleNotice = (): "in-use" | "failed" | null =>
  !(activeStore instanceof SyncedProgressStore) ? null : activeStore.googleInUse ? "in-use" : activeStore.googleFailed ? "failed" : null;

/** รหัสและคำอธิบายของข้อผิดพลาดจากการล็อกอินกับ Google ครั้งล่าสุด (สำหรับผู้ดูแลระบบ) */
export const googleErrorDetail = (): string | null => (activeStore instanceof SyncedProgressStore ? activeStore.googleErrorDetail : null);

/** พาไปหน้าล็อกอินของ Google (หน้าเกมถูกเปิดใหม่เมื่อกลับมา) */
export async function signInWithGoogle(): Promise<void> {
  if (activeStore instanceof SyncedProgressStore) await activeStore.signInWithGoogle();
}

/** ออกจากระบบที่เครื่องนี้ ความคืบหน้าของบัญชียังอยู่ในฐานข้อมูลกลาง */
export async function signOutAccount(): Promise<void> {
  if (!(activeStore instanceof SyncedProgressStore)) return;
  await activeStore.signOut();
  useGameStore.getState().hydrate(null);
}
