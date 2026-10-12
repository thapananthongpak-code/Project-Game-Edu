import { describe, expect, it } from "vitest";
import { stationsOf } from "../content";
import { CAMPAIGN, topicsOf } from "./campaign";
import { codexCount, gardenCredits, growthOf, harvest, plant, potCount } from "./lab";
import { emptyRoom, emptyShop } from "./progressStore";
import { creditBalance, mapCredits, purchase, stockLeft } from "./shop";
import { CATALOG, LAB, SEEDS } from "./shop.config";

const T0 = 1_800_000_000_000;
const withSeed = (seed: (typeof SEEDS)[number] = "glowfern") => ({ ...emptyShop(), seeds: { ...emptyShop().seeds, [seed]: 1 } });
const earning = { maps: { normal: {}, hard: {} } as never, battles: {}, npcs: {}, posttest: null };

describe("ห้องวิจัยพืชต่างดาว (GDD 21)", () => {
  it("กระถางเพิ่มตามแมพที่ไปถึง", () => {
    expect([potCount("easy"), potCount("normal"), potCount("hard")]).toEqual([4, 6, 8]);
  });

  it("ปลูกแล้วโตตามเวลาจริง: ต้นอ่อน → กำลังโต → พร้อมเก็บ และคำนวณจากเวลาที่ปลูกเสมอ (โตต่อแม้ปิดเกม)", () => {
    const planted = plant(withSeed(), 0, "glowfern", T0, "easy");
    expect(typeof planted).toBe("object");
    if (typeof planted === "string") return;
    const pot = planted.pots["0"];
    const { growMs } = LAB.seeds.glowfern;
    expect(growthOf(pot, T0).stage).toBe("sprout");
    expect(growthOf(pot, T0 + growMs / 2).stage).toBe("growing");
    expect(growthOf(pot, T0 + growMs - 1).stage).toBe("growing");
    expect(growthOf(pot, T0 + growMs)).toMatchObject({ stage: "ready", ratio: 1, remainingMs: 0 });
    expect(growthOf(pot, T0 + growMs * 50).stage).toBe("ready");
    // เมล็ดถูกใช้ไป 1 เม็ด
    expect(planted.seeds.glowfern).toBe(0);
  });

  it("นาฬิกาเครื่องย้อนหลังกว่าเวลาที่ปลูก: ถือว่าเพิ่งปลูก ไม่ติดลบ", () => {
    const planted = plant(withSeed(), 0, "glowfern", T0, "easy");
    if (typeof planted === "string") throw new Error(planted);
    expect(growthOf(planted.pots["0"], T0 - 3_600_000)).toMatchObject({ stage: "sprout", ratio: 0, remainingMs: LAB.seeds.glowfern.growMs });
  });

  it("ปลูกไม่ได้: ไม่มีเมล็ด กระถางไม่มี หรือกระถางไม่ว่าง", () => {
    expect(plant(emptyShop(), 0, "glowfern", T0, "easy")).toBe("no-seed");
    expect(plant(withSeed(), 4, "glowfern", T0, "easy")).toBe("no-pot");
    expect(plant(withSeed(), -1, "glowfern", T0, "easy")).toBe("no-pot");
    expect(plant(withSeed(), 4, "glowfern", T0, "normal")).toMatchObject({ pots: { "4": { seed: "glowfern" } } });
    const once = plant({ ...withSeed(), seeds: { ...emptyShop().seeds, glowfern: 2 } }, 0, "glowfern", T0, "easy");
    if (typeof once === "string") throw new Error(once);
    expect(plant(once, 0, "glowfern", T0, "easy")).toBe("occupied");
  });

  it("เก็บผลผลิต: ยังไม่โตเก็บไม่ได้ โตแล้วกระถางว่างลงและนับจำนวนครั้งที่เก็บ เครดิตคำนวณจากจำนวนครั้ง", () => {
    const planted = plant(withSeed(), 0, "glowfern", T0, "easy");
    if (typeof planted === "string") throw new Error(planted);
    expect(harvest(planted, 0, T0 + 1000)).toBe("not-ready");
    expect(harvest(planted, 1, T0)).toBe("empty");
    const done = harvest(planted, 0, T0 + LAB.seeds.glowfern.growMs);
    if (typeof done === "string") throw new Error(done);
    expect(done.gained).toBe(LAB.seeds.glowfern.yield);
    expect(done.shop.pots).toEqual({});
    expect(done.shop.harvests.glowfern).toBe(1);
    expect(gardenCredits(done.shop)).toBe(LAB.seeds.glowfern.yield);
    // เก็บซ้ำไม่ได้ (กระถางว่างแล้ว) จึงไม่เพิ่มเครดิตโดยกดซ้ำ
    expect(harvest(done.shop, 0, T0 + LAB.seeds.glowfern.growMs)).toBe("empty");
  });

  it("เก็บครบทุกพันธุ์ได้ของตกแต่งรางวัลครั้งเดียว", () => {
    let shop = emptyShop();
    let unlocked = 0;
    for (const seed of SEEDS) {
      shop = { ...shop, seeds: { ...shop.seeds, [seed]: 2 } };
      for (let round = 0; round < 2; round++) {
        const planted = plant(shop, 0, seed, T0, "hard");
        if (typeof planted === "string") throw new Error(planted);
        const done = harvest(planted, 0, T0 + LAB.seeds[seed].growMs);
        if (typeof done === "string") throw new Error(done);
        shop = done.shop;
        if (done.unlocked) unlocked++;
      }
    }
    expect(unlocked).toBe(1);
    expect(codexCount(shop)).toBe(SEEDS.length);
    expect(shop.owned).toContain(`decor-${LAB.rewardDecor}`);
    expect(shop.owned.filter((id) => id === `decor-${LAB.rewardDecor}`)).toHaveLength(1);
  });

  it("ซื้อเมล็ด: หักเครดิต เพิ่มเมล็ด นับจำนวนที่ซื้อต่อแมพ ขายหมดแล้วซื้อไม่ได้ และเมล็ดของแมพถัดไปล็อก", () => {
    let shop = emptyShop();
    const item = CATALOG.find((i) => i.id === "seed-glowfern");
    if (item?.kind !== "seed") throw new Error("ไม่มีเมล็ดในแคตตาล็อก");
    for (let n = 0; n < item.stock; n++) {
      const bought = purchase(shop, item.id, 1000, { map: "easy", reached: "easy" });
      if (typeof bought === "string") throw new Error(bought);
      shop = bought;
    }
    expect(shop.seeds.glowfern).toBe(item.stock);
    expect(stockLeft(shop, item, "easy")).toBe(0);
    expect(purchase(shop, item.id, 1000, { map: "easy", reached: "easy" })).toBe("sold-out");
    expect(stockLeft(shop, item, "normal")).toBe(item.stock);
    expect(purchase(emptyShop(), "seed-sunvine", 1000, { map: "easy", reached: "easy" })).toBe("locked");
    expect(purchase(emptyShop(), "seed-glowfern", 5, { map: "easy", reached: "easy" })).toBe("credits");
    expect(purchase(emptyShop(), "decor-alienplant", 1000)).toBe("unknown");
  });

  it("เพดานกำไรของสวน: ซื้อเมล็ดครบจำนวนต่อแมพแล้วเก็บหมดทุกแมพ กำไรสุทธิรวมไม่เกิน 15% ของเครดิตสูงสุดที่เกมให้ และเครดิตคงเหลือรวมผลผลิต", () => {
    const seeds = CATALOG.flatMap((item) => (item.kind === "seed" ? [item] : []));
    const order = ["easy", "normal", "hard"] as const;
    // กำไรสุทธิสูงสุดของแต่ละแมพ: เมล็ดที่ขายตั้งแต่แมพนั้น (จำนวนจำกัดต่อแมพ และรีเซ็ตทุกแมพ)
    const profit = (map: (typeof order)[number]) =>
      seeds.filter((s) => order.indexOf(s.tier ?? "easy") <= order.indexOf(map)).reduce((sum, s) => sum + s.stock * (LAB.seeds[s.value].yield - s.price), 0);
    const total = order.reduce((sum, map) => sum + profit(map), 0);
    // เครดิตสูงสุดที่ได้จากความคืบหน้าของทั้งสามแมพ (ทุกสถานี 3 ดาว ทบทวน แกน ชนะทุกด่านครั้งแรก ไม่นับภารกิจภาคสนาม แบบทดสอบ และ NPC จึงเป็นค่าต่ำสุดที่ระมัดระวัง)
    const credits = order.reduce((sum, map) => {
      const rooms: Record<number, ReturnType<typeof emptyRoom>> = {};
      for (const topic of topicsOf(map)) rooms[topic] = { ...emptyRoom(), stationsSeen: stationsOf(topic).length, stars: 3, reviewDone: true, core: true };
      const maps = { easy: {}, normal: {}, hard: {}, [map]: rooms } as Parameters<typeof mapCredits>[1]["maps"];
      const battles = Object.fromEntries(CAMPAIGN[map].battles.map((b) => [b.id, { won: true, wins: 1, sorties: 1, asked: 0, correct: 0 }]));
      return sum + mapCredits(map, { maps, battles, npcs: {}, posttest: null });
    }, 0);
    expect(credits).toBeGreaterThan(1500);
    expect(total / credits).toBeLessThanOrEqual(0.15);
    // ผลผลิตเข้ายอดเครดิตคงเหลือ
    const shop = { ...emptyShop(), harvests: { ...emptyShop().harvests, moonpod: 2 } };
    expect(creditBalance(earning, shop)).toBe(2 * LAB.seeds.moonpod.yield);
  });
});
