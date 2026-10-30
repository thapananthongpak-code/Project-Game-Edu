import { beforeEach, describe, expect, it } from "vitest";
import { storyBeats } from "../content/story";
import { ADMIN_CREDITS, endgameSave, isEndgame } from "./admin";
import { CAMPAIGN, DIFFICULTIES, topicsOf } from "./campaign";
import { connectProgressStore, creditsOf, mapUnlocked, useGameStore } from "./gameStore";
import { MAX_LEVEL } from "./level";
import { emptySave, emptyShop, type ProgressStore, type SaveData } from "./progressStore";

const profile = { name: "ผู้ดูแล", difficulty: "easy" as const, classCode: "", avatar: "b" as const };
const pretest = { form: "A" as const, correctByTopic: { 1: 1 }, items: [], completedAt: "2026-01-01T00:00:00.000Z" };
const realSave = (): SaveData => ({ ...emptySave(), profile, pretest, shop: { ...emptyShop(), outfit: "lab", paint: "standard", spent: 40 } });

describe("สถานะจบเกมของผู้ดูแล (GDD 30)", () => {
  it("สร้างสถานะจบเกม: ทุกหัวข้อได้แกน AI ชนะทุกด่านของทุกแมพ มีแบบทดสอบหลังเรียน ดูเรื่องราวครบ และเครดิตจำนวนมาก", () => {
    const real = realSave();
    const end = endgameSave(real);
    expect(Object.keys(end.rooms).map(Number).sort()).toEqual(topicsOf("easy"));
    for (const room of Object.values({ ...end.rooms, ...end.maps.normal })) expect(room.core).toBe(true);
    for (const map of DIFFICULTIES) for (const battle of CAMPAIGN[map].battles) expect(end.battles[battle.id]?.won, battle.id).toBe(true);
    expect(end.posttest).not.toBeNull();
    for (const beat of Object.keys(storyBeats)) expect(end.story).toContain(beat);
    expect(end.shop.spent).toBe(-ADMIN_CREDITS);
    expect(end.shop.levelSeen).toBe(MAX_LEVEL);
    // ข้อมูลส่วนตัวของผู้เล่นคงเดิม และไม่แก้บันทึกจริงที่ส่งเข้ามา
    expect(end.profile).toEqual(profile);
    expect(real.battles).toEqual({});
    expect(real.posttest).toBeNull();
    expect(real.shop.spent).toBe(40);
  });

  it("ผลจริงที่ผู้ดูแลทำไว้แล้วคงเดิม (สถิติด่านที่ชนะ ผลแบบทดสอบหลังเรียน)", () => {
    const posttest = { ...pretest, form: "B" as const, correctByTopic: { 1: 2, 2: 2 } };
    const real = { ...realSave(), posttest, battles: { k1: { won: true, wins: 3, sorties: 4, asked: 20, correct: 15, streak: 7 } } };
    const end = endgameSave(real);
    expect(end.posttest).toEqual(posttest);
    expect(end.battles.k1).toEqual(real.battles.k1);
  });
});

describe("บัญชีผู้ดูแลใน store", () => {
  const reset = () => {
    useGameStore.setState({ ...useGameStore.getState(), adminAvailable: false, profile, pretest, posttest: null, progress: {}, others: { normal: {}, hard: {} }, battles: {}, npcs: {}, story: [], shop: emptyShop(), screen: "hall", overlay: null });
  };
  beforeEach(reset);

  it("บัญชีที่ฐานข้อมูลไม่ได้บอกว่าเป็นผู้ดูแลไม่ได้สถานะจบเกม ไม่ว่าจะเรียกกี่ครั้ง (นักเรียนเล่นแล้วไม่จบเกมเอง)", () => {
    const before = useGameStore.getState();
    useGameStore.getState().applyAdminEndgame();
    expect(useGameStore.getState().shop).toBe(before.shop);
    expect(useGameStore.getState().battles).toBe(before.battles);
    expect(creditsOf(useGameStore.getState())).toBe(0);
    expect(mapUnlocked(useGameStore.getState(), "hard")).toBe(false);
    expect(isEndgame(useGameStore.getState())).toBe(false);
  });

  it("ผู้ดูแลที่ยังไม่มีโปรไฟล์หรือยังไม่ผ่านแบบทดสอบก่อนเรียน (ขั้นลงทะเบียน) ยังไม่ถูกตั้งสถานะ", () => {
    useGameStore.setState({ adminAvailable: true, pretest: null });
    useGameStore.getState().applyAdminEndgame();
    expect(isEndgame(useGameStore.getState())).toBe(false);
  });

  it("ผู้ดูแล: ได้สถานะจบเกมและเครดิตจำนวนมาก เล่นต่อได้ตามปกติ ข้อมูลส่วนตัวคงเดิม และเรียกซ้ำไม่เปลี่ยนอะไรอีก", () => {
    useGameStore.getState().setAdminAvailable(true);
    useGameStore.getState().applyAdminEndgame();
    const state = useGameStore.getState();
    expect(isEndgame(state)).toBe(true);
    expect(creditsOf(state)).toBeGreaterThan(900_000);
    expect(mapUnlocked(state, "hard")).toBe(true);
    expect(state.profile).toEqual(profile);
    const shop = state.shop;
    useGameStore.getState().applyAdminEndgame();
    expect(useGameStore.getState().shop).toBe(shop);
  });

  it("ใช้เครดิตจนเหลือไม่ถึงครึ่งแล้วเติมให้เต็มอีกครั้ง แต่ไม่เติมซ้ำถ้ายังเหลือมาก", () => {
    useGameStore.getState().setAdminAvailable(true);
    useGameStore.getState().applyAdminEndgame();
    const spentAfter = (spent: number) => useGameStore.setState({ shop: { ...useGameStore.getState().shop, spent } });
    spentAfter(-ADMIN_CREDITS + 100_000);
    expect(isEndgame(useGameStore.getState())).toBe(true);
    spentAfter(-ADMIN_CREDITS / 4);
    expect(isEndgame(useGameStore.getState())).toBe(false);
    useGameStore.getState().applyAdminEndgame();
    expect(useGameStore.getState().shop.spent).toBeLessThanOrEqual(-ADMIN_CREDITS);
  });

  it("บันทึกตามปกติ: สถานะจบเกมของผู้ดูแลถูกบันทึก (บัญชีนี้อยู่ใต้ห้อง SOLO ในฐานข้อมูล ไม่ขึ้นแดชบอร์ด)", async () => {
    const saved: SaveData[] = [];
    const store: ProgressStore = { load: async () => null, save: async (data) => void saved.push(data), clear: async () => {} };
    const disconnect = await connectProgressStore(store);
    try {
      reset();
      useGameStore.getState().setAdminAvailable(true);
      useGameStore.getState().applyAdminEndgame();
      const last = saved.at(-1);
      expect(Object.keys(last?.battles ?? {})).toHaveLength(13);
      expect(isEndgame({ battles: last?.battles ?? {}, posttest: last?.posttest ?? null, shop: last?.shop ?? emptyShop() })).toBe(true);
    } finally {
      disconnect();
    }
  });
});
