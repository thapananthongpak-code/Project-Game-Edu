import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "../state/campaign";
import { STARTER_PLACEMENT } from "../state/progressStore";
import { DECOR, type Decor, DECORS } from "../state/shop.config";
import { baseMapOf, DECOR_AREAS, DECOR_LIMIT, type DecorPlacement, decoratedMap, decorObject, openCells, placementError, validPlacements } from "./decor";
import { accessCells, hallMapOf, hangarMapOf, reachableCells } from "./maps";

const small = DECORS.filter((decor) => DECOR[decor].size === "small");
const big = DECORS.filter((decor) => DECOR[decor].size === "big");
const walls = DECORS.filter((decor) => DECOR[decor].size === "wall");

/** วางของทีละชิ้นที่ช่องแรกที่วางได้ จนครบจำนวนของห้องหรือของหมด */
function fill(map: ReturnType<typeof baseMapOf>, area: (typeof DECOR_AREAS)[number], decors: readonly Decor[]): DecorPlacement[] {
  const placed: DecorPlacement[] = [];
  for (const decor of decors) {
    const [cell] = openCells(map, area, placed, decor);
    if (cell) placed.push({ decor, ...cell });
  }
  return placed;
}

describe("ของตกแต่งแบบวางอิสระ (GDD 19)", () => {
  it("ของเริ่มต้นวางอยู่ในโถงของแมพ 1 ถูกกติกา และทุกห้องมีที่ว่างให้วางของทุกขนาด", () => {
    expect(validPlacements(hallMapOf("easy"), "hall", STARTER_PLACEMENT)).toEqual(STARTER_PLACEMENT);
    for (const map of DIFFICULTIES) {
      for (const area of DECOR_AREAS) {
        for (const decor of [small[0], big[0], walls[0]]) expect(openCells(baseMapOf(map, area), area, [], decor).length, `${map} ${area} ${decor}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("ของติดผนังเกาะได้เฉพาะผนังด้านบนตรงที่ว่าง ของตั้งพื้นวางได้เฉพาะพื้นที่ว่าง", () => {
    const hall = hallMapOf("easy");
    // ประตูห้อง 1 อยู่ที่ช่อง 2 ประตูโรงเก็บหุ่นอยู่ที่ช่อง 9–10
    expect(placementError(hall, "hall", [], { decor: "window", col: 3, row: 1 })).toBeNull();
    expect(placementError(hall, "hall", [], { decor: "window", col: 2, row: 1 })).toBe("wall");
    expect(placementError(hall, "hall", [], { decor: "window", col: 9, row: 1 })).toBe("wall");
    expect(placementError(hall, "hall", [], { decor: "window", col: 3, row: 4 })).toBe("wall");
    expect(placementError(hall, "hall", [{ decor: "neon", col: 3, row: 1 }], { decor: "window", col: 4, row: 1 })).toBe("wall");
    // ร้านอยู่ที่ช่อง 2–3 แถว 8 ผนังอยู่ที่แถว 10
    expect(placementError(hall, "hall", [], { decor: "sofa", col: 12, row: 5 })).toBeNull();
    expect(placementError(hall, "hall", [], { decor: "sofa", col: 3, row: 8 })).toBe("floor");
    expect(placementError(hall, "hall", [], { decor: "plant", col: 0, row: 5 })).toBe("floor");
    expect(placementError(hall, "hall", [], { decor: "sofa", col: 18, row: 5 })).toBe("floor");
    expect(placementError(hall, "hall", [{ decor: "plant", col: 12, row: 5 }], { decor: "sofa", col: 11, row: 5 })).toBe("floor");
  });

  it("ช่องยืนหน้าประตูและจุดใช้งาน และจุดเริ่มของผู้เล่น วางของไม่ได้", () => {
    const hall = hallMapOf("easy");
    expect(placementError(hall, "hall", [], { decor: "plant", col: 2, row: 2 })).toBe("access");
    expect(placementError(hall, "hall", [], { decor: "plant", col: hall.spawn.col, row: hall.spawn.row })).toBe("access");
    // หน้าร้าน (ร้านอยู่แถว 8 จุดยืนคือแถว 9)
    expect(placementError(hall, "hall", [], { decor: "sofa", col: 2, row: 9 })).toBe("access");
  });

  it("วางแล้วต้องยังเดินถึงทุกจุดใช้งาน: ปิดช่องทางเดียวของโรงเก็บหุ่นแมพ 2 ไม่ได้", () => {
    const hangar = hangarMapOf("normal");
    const two: DecorPlacement[] = [
      { decor: "sofa", col: 7, row: 6 },
      { decor: "aquarium", col: 9, row: 6 },
    ];
    expect(validPlacements(hangar, "hangar", two)).toEqual(two);
    expect(placementError(hangar, "hangar", two, { decor: "arcade", col: 11, row: 6 })).toBe("blocks");
    expect(placementError(hangar, "hangar", two, { decor: "plant", col: 11, row: 6 })).toBeNull();
  });

  it("จำกัดจำนวนชิ้นต่อห้อง และของชิ้นหนึ่งวางได้ครั้งเดียวต่อห้อง", () => {
    expect(DECOR_LIMIT).toEqual({ hall: 8, hangar: 6 });
    for (const area of DECOR_AREAS) {
      const map = baseMapOf("easy", area);
      const full = fill(map, area, DECORS).slice(0, DECOR_LIMIT[area]);
      expect(full, area).toHaveLength(DECOR_LIMIT[area]);
      const extra = DECORS.find((decor) => !full.some((p) => p.decor === decor)) as Decor;
      expect(placementError(map, area, full, { decor: extra, col: 10, row: 6 }), area).toBe("limit");
      expect(placementError(map, area, full.slice(0, 2), { decor: full[0].decor, col: 10, row: 6 }), area).toBe("duplicate");
    }
  });

  it("วางเต็มจำนวนในทุกห้องของทุกแมพแล้ว ทุกจุดใช้งานยังเดินถึงได้ และข้อมูลที่ผิดถูกข้าม", () => {
    for (const map of DIFFICULTIES) {
      for (const area of DECOR_AREAS) {
        const base = baseMapOf(map, area);
        // ของชิ้นใหญ่ก่อน (กินที่มากที่สุด) แล้วชิ้นเล็กและของติดผนัง
        const placed = fill(base, area, [...big, ...small, ...walls].slice(0, 12)).slice(0, DECOR_LIMIT[area]);
        const reachable = reachableCells(decoratedMap(base, placed));
        for (const object of base.objects) expect(accessCells(object).some((cell) => reachable.has(`${cell.col},${cell.row}`)), `${map} ${area} ${object.kind}`).toBe(true);
        expect(validPlacements(base, area, placed)).toEqual(placed);
      }
    }
    const hall = hallMapOf("easy");
    expect(validPlacements(hall, "hall", [{ decor: "sofa", col: 3, row: 8 }, { decor: "plant", col: 1, row: 5 }, { decor: "plant", col: 4, row: 5 }, { decor: "lamp", col: 1.5, row: 5 }])).toEqual([{ decor: "plant", col: 1, row: 5 }]);
    expect(decorObject({ decor: "window", col: 3, row: 1 })).toMatchObject({ kind: "decor", mount: true, w: 2 });
    expect(decorObject({ decor: "plant", col: 1, row: 5 })).toMatchObject({ kind: "decor", mount: false, w: 1 });
  });
});
