import { describe, expect, it } from "vitest";
import { CAMPAIGN, DIFFICULTIES } from "./campaign";
import { battleExp, CHALLENGES, challengeDone, EXP, expAt, expOf, LEVEL_REWARDS, levelCredits, levelOf, type LevelInput, MAX_LEVEL, rewardItemsUpTo, statusOf, TITLE_LEVELS, titleOf } from "./level";
import { emptyNpc, NPCS } from "./npcs";
import { emptyBattle, emptyRoom, emptyShop } from "./progressStore";
import { creditBalance } from "./shop";
import { CATALOG, STALL_KINDS } from "./shop.config";

const fresh = (): LevelInput => ({ earning: { maps: {}, battles: {}, npcs: {}, posttest: null }, shop: emptyShop() });

/** ผู้เล่นที่ชนะทุกด่านด้วยท่าที่ดีที่สุดและทำทุกกิจกรรม: เพดาน EXP ที่ทำได้จริง (ไม่นับซ้อมรบซ้ำเกินเพดาน) */
function finished(): LevelInput {
  const battles = Object.fromEntries(
    DIFFICULTIES.flatMap((map) => CAMPAIGN[map].battles.map((b) => [b.id, { ...emptyBattle(), won: true, wins: 1 + EXP.replayCap, sorties: 1 + EXP.replayCap, asked: 40, correct: 40, streak: 12, untouched: true }])),
  );
  const shop = emptyShop();
  return {
    earning: { maps: { easy: Object.fromEntries([1, 2, 3, 4, 5, 6].map((t) => [t, { ...emptyRoom(), core: true }])) }, battles, npcs: Object.fromEntries(Object.values(NPCS).filter((spec) => spec.role === "quest").slice(0, 3).map((spec) => [spec.id, { ...emptyNpc(), done: true }])), posttest: null },
    shop: { ...shop, harvests: { glowfern: 8, crystalbloom: 4, sunvine: 3, moonpod: 2 }, dash: ["easy:1", "easy:2", "easy:3"], owned: ["weapon-sword"], weapon: "sword", armor: "heavy", chip: "focus", decor: { "easy:hall": ["a", "b", "c", "d", "e", "f"].map((_, i) => ({ decor: "window" as const, col: i, row: 1 })) } },
  };
}

describe("เลเวลและ EXP (GDD 27)", () => {
  it("ผู้เล่นใหม่เป็นเลเวล 1 และ EXP 0", () => {
    expect(expOf(fresh())).toBe(0);
    expect(statusOf(fresh())).toMatchObject({ exp: 0, level: 1, into: 0, max: false });
  });

  it("EXP ที่ต้องใช้เพิ่มขึ้นทีละขั้นและขั้นห่างขึ้นเรื่อย ๆ", () => {
    expect(expAt(1)).toBe(0);
    let gap = 0;
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const next = expAt(level) - expAt(level - 1);
      expect(next).toBeGreaterThan(gap);
      gap = next;
    }
  });

  it("levelOf ตรงกับเกณฑ์ ไม่เกินเลเวลสูงสุด", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(expAt(2) - 1)).toBe(1);
    expect(levelOf(expAt(2))).toBe(2);
    expect(levelOf(expAt(MAX_LEVEL))).toBe(MAX_LEVEL);
    expect(levelOf(10 ** 9)).toBe(MAX_LEVEL);
  });

  it("เลเวลสูงสุดถึงได้ด้วยการเล่นให้ครบ แต่ไม่ใช่ด้วยการชนะด่านอย่างเดียว (ไม่ง่ายเกินไป ไม่ยากเกินไป)", () => {
    const total = expOf(finished());
    expect(total).toBeGreaterThanOrEqual(expAt(MAX_LEVEL));
    expect(total).toBeLessThan(expAt(MAX_LEVEL) * 1.35);
    const battlesOnly = { ...finished(), shop: emptyShop() };
    battlesOnly.earning = { ...battlesOnly.earning, maps: {} };
    expect(expOf(battlesOnly)).toBeLessThan(expAt(MAX_LEVEL));
  });

  it("EXP ของด่านต่อสู้: ชนะครั้งแรก (บอสมากกว่า) ชนะตั้งแต่ครั้งแรก ข้อที่ถูก และซ้อมรบ มีเพดานทุกอย่าง", () => {
    expect(battleExp(undefined, false)).toBe(0);
    expect(battleExp({ ...emptyBattle(), asked: 5, correct: 3, sorties: 1 }, false)).toBe(3 * EXP.correct);
    const win = { ...emptyBattle(), won: true, wins: 1, sorties: 1, correct: 6 };
    expect(battleExp(win, false)).toBe(EXP.battle + EXP.flawless + 6 * EXP.correct);
    expect(battleExp(win, true)).toBe(EXP.boss + EXP.flawless + 6 * EXP.correct);
    // ถอยกลับมาซ่อมก่อนชนะ: ไม่ได้โบนัส
    expect(battleExp({ ...win, sorties: 3 }, false)).toBe(EXP.battle + 6 * EXP.correct);
    // เล่นซ้ำ 100 ครั้งก็ไม่เกินเพดาน
    const farmed = { ...win, wins: 100, sorties: 100, correct: 4000 };
    expect(battleExp(farmed, false)).toBe(EXP.battle + EXP.flawless + EXP.correctCap * EXP.correct + EXP.replayCap * EXP.replay);
  });

  it("ชาเลนจ์ทำได้ครั้งเดียว: ได้ EXP ตอนครบเป้า และรหัสไม่ซ้ำ", () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(18);
    const input = fresh();
    expect(CHALLENGES.some((c) => challengeDone(c, input))).toBe(false);
    const k1 = { ...emptyBattle(), won: true, wins: 1, sorties: 1, streak: 5 };
    const won: LevelInput = { ...input, earning: { ...input.earning, battles: { k1 } } };
    const done = CHALLENGES.filter((c) => challengeDone(c, won)).map((c) => c.id);
    expect(done).toEqual(expect.arrayContaining(["first-win", "streak-3", "streak-5"]));
    expect(done).not.toContain("streak-8");
    expect(done).not.toContain("untouched");
  });

  it("ชาเลนจ์ทุกข้อทำได้จริงเมื่อเล่นครบ และเป้าไม่เกินสิ่งที่เกมมี", () => {
    const input = finished();
    for (const challenge of CHALLENGES) expect(challengeDone(challenge, input), challenge.id).toBe(true);
  });

  it("ชาเลนจ์ไม่นับคะแนนแบบทดสอบ: ผลแบบทดสอบหลังเรียนไม่เปลี่ยน EXP", () => {
    const base = fresh();
    const withTest: LevelInput = { ...base, earning: { ...base.earning, posttest: { score: 12, total: 12, finishedAt: "2026-01-01T00:00:00.000Z" } as never } };
    expect(expOf(withTest)).toBe(expOf(base));
  });

  it("รางวัลของเลเวล: เป็นของที่ไม่วางขาย ไม่ซ้ำกัน และไปถึงตามเลเวล", () => {
    const items = Object.values(LEVEL_REWARDS).flatMap((reward) => reward.items ?? []);
    expect(new Set(items).size).toBe(items.length);
    const sold = Object.values(STALL_KINDS).flat();
    for (const id of items) {
      const item = CATALOG.find((candidate) => candidate.id === id);
      expect(item, id).toBeDefined();
      expect(item?.reward, `${id} ต้องเป็นของรางวัล`).toBe(true);
      expect(sold).toContain(item?.kind);
    }
    expect(rewardItemsUpTo(1)).toEqual([]);
    expect(rewardItemsUpTo(MAX_LEVEL)).toEqual(expect.arrayContaining(items));
    // ของรางวัลมีทั้งสีหุ่นและคอสตูมพี่บิต (ชุดของผู้เล่นรอภาพจาก Pixel Lab)
    expect(new Set(items.map((id) => CATALOG.find((c) => c.id === id)?.kind))).toEqual(new Set(["paint", "bit"]));
  });

  it("เครดิตรางวัลของเลเวลมีเพดาน และรวมเข้ายอดเครดิตคงเหลือเมื่อแจกรางวัลแล้ว (levelSeen)", () => {
    expect(levelCredits(1)).toBe(0);
    expect(levelCredits(MAX_LEVEL)).toBeLessThanOrEqual(250);
    expect(levelCredits(5)).toBeGreaterThan(levelCredits(4));
    const { earning, shop } = fresh();
    expect(creditBalance(earning, { ...shop, levelSeen: 5 })).toBe(creditBalance(earning, shop) + levelCredits(5));
  });

  it("ฉายาเปลี่ยนตามเลเวลที่กำหนด และเลเวล 1 ได้ฉายาแรก", () => {
    expect(titleOf(1)).toBe(0);
    expect(titleOf(MAX_LEVEL)).toBe(TITLE_LEVELS.length - 1);
    expect(titleOf(2)).toBe(0);
    expect(titleOf(3)).toBe(1);
  });
});
