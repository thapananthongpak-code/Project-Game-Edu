import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOM_COUNT, stationsOf } from "../content";
import { MAP_COLS, MAP_ROWS, TILE } from "./constants";
import { accessCells, blockedCells, type GameMap, hallMap, hangarMap, isFloorCell, type MapObject, reachableCells, roomMaps } from "./maps";

interface ManifestAsset {
  size: [number, number];
  files: Record<string, string>;
  wang?: unknown;
}
const manifest = JSON.parse(readFileSync(new URL("../../public/assets/assets-manifest.json", import.meta.url), "utf8")) as { assets: ManifestAsset[] };
const sizes = new Map(manifest.assets.flatMap((asset) => Object.keys(asset.files).map((key) => [key, asset.size] as const)));
const tilesets = new Set(manifest.assets.flatMap((asset) => Object.keys(asset.files).map((key) => key.replace(/_(floor|wall)$/, ""))));

const maps: [string, GameMap][] = [["โถง", hallMap], ["โรงเก็บหุ่น", hangarMap], ...Object.entries(roomMaps).map(([room, map]): [string, GameMap] => [`ห้อง ${room}`, map])];
const count = (map: GameMap, kind: MapObject["kind"]) => map.objects.filter((object) => object.kind === kind).length;
const canReach = (map: GameMap, object: MapObject) => {
  const reachable = reachableCells(map);
  return accessCells(object).some((cell) => reachable.has(`${cell.col},${cell.row}`));
};

describe("แผนที่ของทุกฉาก", () => {
  it("มีแผนที่ครบทุกห้อง และผังของแต่ละห้องไม่ซ้ำกัน", () => {
    expect(Object.keys(roomMaps).map(Number)).toEqual(Array.from({ length: ROOM_COUNT }, (_, i) => i + 1));
    const layouts = Object.values(roomMaps).map((map) => map.shape.join("\n"));
    expect(new Set(layouts).size).toBe(ROOM_COUNT);
    const arrangements = Object.values(roomMaps).map((map) => JSON.stringify(map.objects.map((o) => [o.kind, o.col, o.row])));
    expect(new Set(arrangements).size).toBe(ROOM_COUNT);
  });

  it.each(maps)("%s: ผังมีขนาดถูกต้อง มีผนังล้อมรอบ และจุดเริ่มอยู่บนพื้น", (_, map) => {
    expect(map.shape).toHaveLength(MAP_ROWS);
    for (const line of map.shape) expect(line).toMatch(new RegExp(`^[#.]{${MAP_COLS}}$`));
    for (let col = 0; col < MAP_COLS; col++) expect(isFloorCell(map, col, 0) || isFloorCell(map, col, MAP_ROWS - 1)).toBe(false);
    for (let row = 0; row < MAP_ROWS; row++) expect(isFloorCell(map, 0, row) || isFloorCell(map, MAP_COLS - 1, row)).toBe(false);
    expect(isFloorCell(map, map.spawn.col, map.spawn.row)).toBe(true);
    expect(tilesets.has(map.tileset)).toBe(true);
  });

  it.each(maps)("%s: วัตถุทุกชิ้นมีภาพใน manifest ขนาดตรงกับผัง ตั้งบนพื้น (หรือติดผนังที่มีพื้นอยู่ข้างหน้า) และไม่ทับกัน", (_, map) => {
    const taken = new Set<string>();
    for (const object of map.objects) {
      const size = sizes.get(object.prop);
      expect(size, object.prop).toBeDefined();
      expect(size?.[0], object.prop).toBe((object.w ?? 1) * TILE);
      if (object.mount) {
        expect(isFloorCell(map, Math.floor(object.col), object.row), `${object.prop} ต้องอยู่บนผนัง`).toBe(false);
        expect(isFloorCell(map, Math.floor(object.col), object.row + 1), `${object.prop} ต้องมีพื้นอยู่ข้างหน้า`).toBe(true);
      }
      for (const cell of blockedCells(object)) {
        const key = `${cell.col},${cell.row}`;
        expect(isFloorCell(map, cell.col, cell.row), `${object.prop} ที่ ${key} ต้องอยู่บนพื้น`).toBe(true);
        expect(taken.has(key), `${object.prop} ทับวัตถุอื่นที่ ${key}`).toBe(false);
        taken.add(key);
      }
    }
    expect(taken.has(`${map.spawn.col},${map.spawn.row}`)).toBe(false);
  });

  it.each(maps)("%s: ผู้เล่นเดินถึงจุดโต้ตอบทุกจุด", (_, map) => {
    for (const object of map.objects.filter((o) => o.kind !== "decor")) expect(canReach(map, object), `${object.kind} ${object.prop}`).toBe(true);
  });

  it("ห้อง 1–5 มีสถานีครบตามเนื้อหา เครื่องฝึก โต๊ะสมุดบันทึก แท่นแกน AI และประตูกลับโถงอย่างละหนึ่ง", () => {
    for (let room = 1; room < ROOM_COUNT; room++) {
      const map = roomMaps[room];
      const stations = map.objects.filter((o) => o.kind === "station").map((o) => o.index);
      expect([...stations].sort(), `ห้อง ${room}`).toEqual(stationsOf(room).map((_, i) => i));
      expect([count(map, "minigame"), count(map, "review"), count(map, "core"), count(map, "door")], `ห้อง ${room}`).toEqual([1, 1, 1, 1]);
    }
  });

  it("ห้องสุดท้ายมีจอภารกิจ แท่นแกน AI และประตู ไม่มีสถานี", () => {
    const map = roomMaps[ROOM_COUNT];
    expect([count(map, "field"), count(map, "core"), count(map, "door"), count(map, "station")]).toEqual([1, 1, 1, 0]);
  });

  it("โถงมีประตูครบทุกห้องเรียงตามลำดับ ประตูโรงเก็บหุ่น และร้าน ส่วนโรงเก็บหุ่นมีแผงสั่งปฏิบัติการ", () => {
    const doors = hallMap.objects.filter((o) => o.kind === "door");
    expect(doors.map((door) => door.index)).toEqual(Array.from({ length: ROOM_COUNT }, (_, i) => i + 1));
    expect(doors.map((door) => door.col)).toEqual([...doors.map((door) => door.col)].sort((a, b) => a - b));
    expect([count(hallMap, "gate"), count(hallMap, "shop")]).toEqual([1, 1]);
    expect(["console", "robot", "wardrobe", "hologram", "door"].map((kind) => count(hangarMap, kind as MapObject["kind"]))).toEqual([1, 1, 1, 1, 1]);
  });
});
