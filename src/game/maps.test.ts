import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOM_COUNT, stationsOf } from "../content";
import { CAMPAIGN, DIFFICULTIES } from "../state/campaign";
import { NPCS, npcsOfMap } from "../state/npcs";
import { DECOR } from "../state/shop.config";
import { MAP_COLS, MAP_ROWS, TILE } from "./constants";
import { accessCells, blockedCells, type GameMap, hallMapOf, hangarMapOf, hardMaps, isFloorCell, type MapObject, normalMaps, reachableCells, roomMaps, zoneMap } from "./maps";

interface ManifestAsset {
  size: [number, number];
  files: Record<string, string>;
  wang?: unknown;
}
const manifest = JSON.parse(readFileSync(new URL("../../public/assets/assets-manifest.json", import.meta.url), "utf8")) as { assets: ManifestAsset[] };
const sizes = new Map(manifest.assets.flatMap((asset) => Object.keys(asset.files).map((key) => [key, asset.size] as const)));
const tilesets = new Set(manifest.assets.flatMap((asset) => Object.keys(asset.files).map((key) => key.replace(/_(floor|wall)$/, ""))));

const hallMap = hallMapOf("easy");
const named = (label: string, rooms: Record<number, GameMap>): [string, GameMap][] => Object.entries(rooms).map(([room, map]) => [`${label} ${room}`, map]);
const maps: [string, GameMap][] = [
  ["โถงแมพ 1 (6 ประตู)", hallMap],
  ["โถงแมพ 2 (3 ประตู)", hallMapOf("normal")],
  ["โถงแมพ 3 (ไม่มีห้องเรียน)", hallMapOf("hard")],
  ["โรงเก็บหุ่นแมพ 1", hangarMapOf("easy")],
  ["โรงเก็บหุ่นแมพ 2", hangarMapOf("normal")],
  ["โรงเก็บหุ่นแมพ 3", hangarMapOf("hard")],
  ...named("ห้อง", roomMaps),
  ...named("ระดับกลาง ห้อง", normalMaps),
  ...named("ระดับยาก ห้อง", hardMaps),
];
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
      // NPC ใช้ภาพตัวละคร 64×64 แบบเดียวกับผู้เล่น ยืนกลางช่องเดียว
      if (object.kind !== "npc") expect(size?.[0], object.prop).toBe((object.w ?? 1) * TILE);
      if (object.mount) {
        for (let col = Math.floor(object.col); col < Math.ceil(object.col + (object.w ?? 1)); col++) {
          expect(isFloorCell(map, col, object.row), `${object.prop} ต้องอยู่บนผนัง`).toBe(false);
          expect(isFloorCell(map, col, object.row + 1), `${object.prop} ต้องมีพื้นอยู่ข้างหน้า`).toBe(true);
        }
      }
      // ของที่วางราบกับพื้น (พรม ลายบนพื้น ของที่เก็บได้) ต้องอยู่บนพื้นทั้งชิ้น
      if (object.flat) {
        for (let col = Math.floor(object.col); col < Math.ceil(object.col + (object.w ?? 1)); col++) expect(isFloorCell(map, col, object.row), `${object.prop} ที่ ${col},${object.row} ต้องอยู่บนพื้น`).toBe(true);
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

  it("โถงมีประตูครบทุกห้องเรียงตามลำดับ ประตูโรงเก็บหุ่น ร้าน และกล่องเก็บไอเทม ส่วนโรงเก็บหุ่นมีแผงสั่งปฏิบัติการและกล่องเก็บไอเทม", () => {
    const doors = hallMap.objects.filter((o) => o.kind === "door");
    expect(doors.map((door) => door.index)).toEqual(Array.from({ length: ROOM_COUNT }, (_, i) => i + 1));
    expect(doors.map((door) => door.col)).toEqual([...doors.map((door) => door.col)].sort((a, b) => a - b));
    // โรงเก็บหุ่นของทุกแมพมีจุดปรับแต่งแยกกัน: แท่นการ์เดียน ตู้เสื้อผ้า แท่นพี่บิต ตู้กระจกเก็บแกน แผงสั่งปฏิบัติการ กล่องเก็บไอเทม เครื่องฉาย และประตู
    for (const difficulty of DIFFICULTIES) {
      const kinds = ["console", "robot", "wardrobe", "bitpad", "corecase", "hologram", "door", "storage", "decorboard"] as const;
      expect(kinds.map((kind) => count(hangarMapOf(difficulty), kind)), difficulty).toEqual(kinds.map(() => 1));
      // แท่นชาร์จพี่บิตเป็นแท่นตั้งพื้น
      expect(hangarMapOf(difficulty).objects.find((o) => o.kind === "bitpad"), difficulty).toMatchObject({ prop: "pr_bit_dock", w: 2 });
    }
    // โรงเก็บหุ่นของแต่ละแมพออกแบบต่างกัน
    expect(new Set(DIFFICULTIES.map((difficulty) => hangarMapOf(difficulty).tileset)).size).toBe(3);
    expect(new Set(DIFFICULTIES.map((difficulty) => hangarMapOf(difficulty).shape.join("\n"))).size).toBe(3);
    // โถงของทุกแมพมีประตูโรงเก็บหุ่น ร้าน กล่องเก็บไอเทม กระดานแผนที่การเดินทาง และกระดานตกแต่ง อย่างละหนึ่ง
    for (const difficulty of DIFFICULTIES) {
      expect(["gate", "shop", "storage", "travel", "decorboard"].map((kind) => count(hallMapOf(difficulty), kind as MapObject["kind"])), difficulty).toEqual([1, 1, 1, 1, 1]);
    }
  });

  it("ทุกระดับความยากมีแผนที่ครบทุกห้อง และโถงมีประตูเท่าจำนวนห้อง", () => {
    for (const difficulty of DIFFICULTIES) {
      const zones = CAMPAIGN[difficulty].zones;
      zones.forEach((_, i) => expect(zoneMap(difficulty, i + 1), `${difficulty} ห้อง ${i + 1}`).toBeDefined());
      expect(hallMapOf(difficulty).objects.filter((o) => o.kind === "door").map((door) => door.index)).toEqual(zones.map((_, i) => i + 1));
    }
    // โถงของแต่ละแมพมีผังและชุดไทล์ของตัวเอง
    expect(new Set(DIFFICULTIES.map((difficulty) => hallMapOf(difficulty).tileset)).size).toBe(3);
    expect(new Set(DIFFICULTIES.map((difficulty) => JSON.stringify(hallMapOf(difficulty).objects.map((o) => [o.kind, o.col, o.row])))).size).toBe(3);
  });

  it("ของตกแต่งทุกชิ้นมีภาพขนาดตรงกับขนาดของมัน (ติดผนัง 64×32 ตั้งพื้นชิ้นใหญ่ 64×64 ชิ้นเล็ก 32×64) และผังของโถงกับโรงเก็บหุ่นไม่มีของตกแต่งตายตัว", () => {
    const width = { wall: 2, big: 2, small: 1 };
    const height = { wall: 32, big: 64, small: 64 };
    for (const [name, decor] of Object.entries(DECOR)) expect(sizes.get(decor.prop), name).toEqual([width[decor.size] * TILE, height[decor.size]]);
    // ของตกแต่งของโถงและโรงเก็บหุ่นเป็นของที่ผู้เล่นวางเองทั้งหมด (src/game/decor.ts)
    for (const difficulty of DIFFICULTIES) for (const map of [hallMapOf(difficulty), hangarMapOf(difficulty)]) expect(count(map, "decor"), difficulty).toBe(0);
  });

  it("ห้องเรียนของแมพ 1 มีจอตัวอย่างและวิดีโอเสริมของหัวข้อนั้นห้องละหนึ่งจอ ติดผนัง", () => {
    for (let room = 1; room <= ROOM_COUNT; room++) {
      const screens = roomMaps[room].objects.filter((o) => o.kind === "extras");
      expect(screens.map((o) => [o.topic, o.mount]), `ห้อง ${room}`).toEqual([[room, true]]);
    }
  });

  it("แมพ 2: แต่ละหัวข้อของห้องมีคลังความรู้ เครื่องฝึก โต๊ะทบทวน และแท่นแกน AI ของตัวเอง ไม่มีภารกิจภาคสนาม (อยู่ที่แมพ 1)", () => {
    CAMPAIGN.normal.zones.forEach((zone, i) => {
      const map = normalMaps[i + 1];
      const of = (kind: MapObject["kind"]) => map.objects.filter((o) => o.kind === kind).map((o) => o.topic).sort();
      for (const kind of ["archive", "minigame", "review", "core"] as const) expect(of(kind), `ห้อง ${i + 1} ${kind}`).toEqual([...zone.topics]);
      expect([count(map, "station"), count(map, "field"), count(map, "door")]).toEqual([0, 0, 1]);
    });
  });

  it("แมพ 3: ไม่มีห้องเรียน (ลุยด่านต่อสู้อย่างเดียว) โถงไม่มีประตูห้อง", () => {
    expect(Object.keys(hardMaps)).toEqual([]);
    expect(CAMPAIGN.hard.zones).toEqual([]);
    expect(count(hallMapOf("hard"), "door")).toBe(0);
  });

  it("NPC ของแต่ละแมพ: อยู่ครบทุกคน คนละหนึ่งที่ ในห้องของหัวข้อตัวเอง และของในเควสเสริมมีครบตามจำนวน", () => {
    for (const difficulty of DIFFICULTIES) {
      const placed = CAMPAIGN[difficulty].zones.flatMap((zone, i) => zoneMap(difficulty, i + 1).objects.filter((o) => o.kind === "npc").map((o) => ({ npc: o.npc, zone })));
      // แมพที่ไม่มีห้องเรียน (แมพ 3): NPC อยู่ในโรงเก็บหุ่นของแมพนั้น
      const inHangar = hangarMapOf(difficulty).objects.filter((o) => o.kind === "npc").map((o) => o.npc);
      expect([...placed.map((p) => p.npc), ...inHangar].sort(), difficulty).toEqual(npcsOfMap(difficulty).map((spec) => spec.id).sort());
      expect(inHangar.length > 0, difficulty).toBe(CAMPAIGN[difficulty].zones.length === 0);
      for (const { npc, zone } of placed) expect(zone.topics, `${difficulty} ${npc}`).toContain(NPCS[npc as keyof typeof NPCS].topic);
      CAMPAIGN[difficulty].zones.forEach((_, i) => {
        const map = zoneMap(difficulty, i + 1);
        const here = map.objects.filter((o) => o.kind === "npc").map((o) => o.npc);
        const found = map.objects.filter((o) => o.kind === "pickup");
        // ของของเควสอยู่ในห้องเดียวกับ NPC เจ้าของเควส ลำดับไม่ซ้ำ และวางราบกับพื้น
        for (const pickup of found) expect(here, `${difficulty} ห้อง ${i + 1} ${pickup.prop}`).toContain(pickup.npc);
        for (const npc of here) {
          const indexes = found.filter((o) => o.npc === npc).map((o) => o.index).sort();
          expect(indexes, `${difficulty} ${npc}`).toEqual(Array.from({ length: NPCS[npc as keyof typeof NPCS].pickups }, (_, n) => n));
        }
        expect(found.every((o) => o.flat)).toBe(true);
        // ของของเควสไม่วางทับกัน และไม่วางบนจุดเริ่มของผู้เล่น
        const cells = found.map((o) => `${o.col},${o.row}`);
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells).not.toContain(`${map.spawn.col},${map.spawn.row}`);
      });
    }
  });

  it("โถงไม่มี NPC ของติดผนังของโถงไม่ชนประตูของทุกแมพ", () => {
    for (const zones of DIFFICULTIES) {
      const map = hallMapOf(zones);
      expect(count(map, "npc") + count(map, "pickup")).toBe(0);
      const mounted = map.objects.filter((o) => o.mount).flatMap((o) => Array.from({ length: o.w ?? 1 }, (_, n) => Math.floor(o.col) + n));
      expect(new Set(mounted).size, `โถงของ ${zones}`).toBe(mounted.length);
    }
    expect(count(hangarMapOf("easy"), "npc") + count(hangarMapOf("normal"), "npc")).toBe(0);
  });
});

