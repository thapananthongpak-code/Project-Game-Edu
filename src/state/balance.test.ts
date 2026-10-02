import { describe, expect, it } from "vitest";
import { BARE, type Build, buildPower, PAR, parBuild, seeded, simulateBattle, simulateSortie } from "./balance";
import { battleSetup } from "./battle";
import { CAMPAIGN, DIFFICULTIES } from "./campaign";
import { BAG_SIZE } from "./gear";
import { idealBag } from "./loadout";
import { CATALOG } from "./shop.config";

const battles = DIFFICULTIES.flatMap((difficulty) => CAMPAIGN[difficulty].battles.map((spec) => ({ difficulty, spec })));
const FULL = (spec: (typeof battles)[number]["spec"]): Build => ({ ...BARE, gear: { weapon: "sword", armor: "guard", chip: "retry" }, bag: idealBag(spec) });

describe("ความสมดุลของด่านต่อสู้ (GDD 18)", () => {
  it("ผลของแบบจำลองเหมือนเดิมทุกครั้งที่รัน (สุ่มด้วยเมล็ดคงที่)", () => {
    const { difficulty, spec } = battles[2];
    expect(simulateBattle(difficulty, spec, BARE, 0.7, { runs: 200 })).toEqual(simulateBattle(difficulty, spec, BARE, 0.7, { runs: 200 }));
    expect(seeded(1)()).not.toBe(seeded(2)());
  });

  it("ทุกด่านมีชุดอุปกรณ์อ้างอิง และพลังที่แนะนำของด่านไม่เกินค่าพลังรวมของชุดนั้น", () => {
    for (const { difficulty, spec } of battles) {
      expect(PAR[spec.id], spec.id).toBeDefined();
      expect(PAR[spec.id].items).toBeLessThanOrEqual(BAG_SIZE);
      const power = buildPower(difficulty, spec, parBuild(spec));
      expect(power, spec.id).toBeGreaterThanOrEqual(spec.power);
      expect(power - spec.power, spec.id).toBeLessThanOrEqual(10);
    }
  });

  it("พลังที่แนะนำเพิ่มขึ้นตามลำดับด่าน และด่านแรกของระดับง่ายใช้อุปกรณ์เริ่มต้นได้", () => {
    for (const difficulty of DIFFICULTIES) {
      const powers = CAMPAIGN[difficulty].battles.map((spec) => spec.power);
      expect(powers).toEqual([...powers].sort((a, b) => a - b));
    }
    const first = CAMPAIGN.easy.battles[0];
    expect(buildPower("easy", first, BARE)).toBeGreaterThanOrEqual(first.power);
  });

  it("ตอบถูกทุกข้อชนะทุกด่านในการออกปฏิบัติการครั้งแรกด้วยอุปกรณ์เริ่มต้น", () => {
    for (const { difficulty, spec } of battles) expect(simulateBattle(difficulty, spec, BARE, 1, { runs: 5 }).firstTry, spec.id).toBe(1);
  });

  it("ไม่ง่ายเกินไป: ผู้เล่นที่ตอบถูกครึ่งเดียวและไม่อัปเกรดอะไรเลย ชนะรอบแรกไม่ถึงครึ่งตั้งแต่ด่านที่ 3 เป็นต้นไป", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const spec of CAMPAIGN[difficulty].battles.slice(difficulty === "easy" ? 2 : 0)) expect(simulateBattle(difficulty, spec, BARE, 0.5).firstTry, spec.id).toBeLessThanOrEqual(0.5);
    }
  });

  it("ไม่ยากเกินไป: ผู้เล่นที่ตอบถูก 70% และมีพลังถึงที่แนะนำ ชนะรอบแรกอย่างน้อย 8 ใน 10 ครั้ง", () => {
    for (const { difficulty, spec } of battles) expect(simulateBattle(difficulty, spec, parBuild(spec), 0.7).firstTry, spec.id).toBeGreaterThanOrEqual(0.8);
  });

  it("พลังไม่ถึงก็ยังสู้ได้: ผู้เล่นที่ตอบถูก 70% ใช้อุปกรณ์เริ่มต้นชนะระดับง่ายและกลางได้ภายในราว 2 รอบ และไม่มีใครติดค้าง", () => {
    for (const difficulty of ["easy", "normal"] as const) {
      for (const spec of CAMPAIGN[difficulty].battles) {
        const result = simulateBattle(difficulty, spec, BARE, 0.7);
        expect(result.sorties, spec.id).toBeLessThanOrEqual(2);
        expect(result.stuck, spec.id).toBe(0);
      }
    }
  });

  it("ผู้เล่นที่ตอบถูกครึ่งเดียวแต่มีพลังถึงที่แนะนำ ผ่านระดับง่ายและกลางได้ภายในราว 2 รอบต่อด่าน", () => {
    for (const difficulty of ["easy", "normal"] as const) {
      for (const spec of CAMPAIGN[difficulty].battles) {
        const result = simulateBattle(difficulty, spec, parBuild(spec), 0.5);
        expect(result.sorties, spec.id).toBeLessThanOrEqual(2.5);
        expect(result.stuck, spec.id).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it("อุปกรณ์มีผลจริง: พลังถึงที่แนะนำแล้วชนะรอบแรกบ่อยกว่าอุปกรณ์เริ่มต้น และด่านสุดท้ายของทุกระดับต่างกันชัดเจน", () => {
    for (const { difficulty, spec } of battles.filter(({ spec }) => PAR[spec.id].items > 0 || PAR[spec.id].gear.armor !== "plate")) {
      const bare = simulateBattle(difficulty, spec, BARE, 0.6).firstTry;
      const par = simulateBattle(difficulty, spec, parBuild(spec), 0.6).firstTry;
      expect(par, spec.id).toBeGreaterThan(bare);
      if (spec.boss) expect(par - bare, spec.id).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("อุปกรณ์แต่ละชิ้นช่วยได้ แต่ไม่มีชิ้นไหนทำให้ด่านสุดท้ายกลายเป็นชนะแน่นอน", () => {
    const pieces: Build["gear"][] = [
      { weapon: "sword", armor: "plate", chip: "none" },
      { weapon: "blaster", armor: "plate", chip: "none" },
      { weapon: "fist", armor: "heavy", chip: "none" },
      { weapon: "fist", armor: "guard", chip: "none" },
      { weapon: "fist", armor: "plate", chip: "retry" },
      { weapon: "fist", armor: "plate", chip: "charger" },
    ];
    for (const difficulty of DIFFICULTIES) {
      const spec = CAMPAIGN[difficulty].battles.at(-1)!;
      const bare = simulateBattle(difficulty, spec, BARE, 0.6);
      for (const gear of pieces) {
        const one = simulateBattle(difficulty, spec, { ...BARE, gear }, 0.6);
        expect(one.sorties, `${spec.id} ${JSON.stringify(gear)}`).toBeLessThanOrEqual(bare.sorties + 0.05);
        expect(one.firstTry, `${spec.id} ${JSON.stringify(gear)}`).toBeLessThan(0.9);
      }
    }
  });

  it("ของใช้พกได้ไม่เกินกระเป๋า: แบบจำลองไม่ใช้ของเกินที่พก", () => {
    const { difficulty, spec } = battles[0];
    const setup = battleSetup(difficulty, spec, "lab");
    // พกชุดซ่อม 3 ชิ้น แทบตอบไม่ถูกเลย: ซ่อมได้ไม่เกิน 3 ครั้ง จำนวนข้อที่ตอบผิดก่อนแพ้จึงมีขีดจำกัด
    const end = simulateSortie(setup, 0, ["repair-kit", "repair-kit", "repair-kit"], seeded(1));
    expect(end.status).toBe("lost");
    expect(end.turn - end.correct).toBeLessThanOrEqual(setup.robotMax + 3 * setup.repairHeal);
  });
});

describe("เครดิตวิจัยไม่เฟ้อ (GDD 13 และ 18)", () => {
  it("อุปกรณ์ครบสามช่องแบบถูกที่สุดราคาไม่เกิน 300 เครดิต และของใช้เต็มกระเป๋าหนึ่งรอบไม่เกิน 100 เครดิต", () => {
    const cheapest = (kind: string) => Math.min(...CATALOG.filter((item) => item.kind === kind).map((item) => item.price));
    expect(cheapest("weapon") + cheapest("armor") + cheapest("chip")).toBeLessThanOrEqual(300);
    const supplies = CATALOG.filter((item) => item.kind === "supply").map((item) => item.price).sort((a, b) => a - b);
    expect(supplies.slice(0, BAG_SIZE).reduce((sum, price) => sum + price, 0)).toBeLessThanOrEqual(100);
  });
});

// npm run balance: พิมพ์ตารางเต็ม (สัดส่วนชนะรอบแรก / จำนวนรอบเฉลี่ย / จำนวนข้อเฉลี่ย) ของทุกด่าน ทุกชุดอุปกรณ์ และความแม่นยำ 50–90%
describe.runIf(process.env.BALANCE_REPORT === "1")("รายงานความสมดุล", () => {
  it("พิมพ์ตาราง", () => {
    const rows = battles.flatMap(({ difficulty, spec }) =>
      ([["bare", BARE], ["par", parBuild(spec)], ["full", FULL(spec)]] as const).map(([name, build]) => {
        const cells = [0.5, 0.6, 0.7, 0.8, 0.9].map((p) => {
          const r = simulateBattle(difficulty, spec, build, p, { runs: 3000 });
          return `${Math.round(r.firstTry * 100)}%/${r.sorties.toFixed(1)}/${Math.round(r.turns)}`.padEnd(13);
        });
        return `${difficulty.padEnd(7)}${spec.id.padEnd(8)}${spec.forms.map((f) => f.hp).join("+").padEnd(9)}${name.padEnd(5)}${String(buildPower(difficulty, spec, build)).padStart(3)}/${String(spec.power).padEnd(5)}${cells.join("")}`;
      }),
    );
    console.log(`\nlevel  battle  hp       build power/rec p=.5         p=.6         p=.7         p=.8         p=.9\n${rows.join("\n")}`);
  });
});
