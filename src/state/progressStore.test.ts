import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { course } from "../content";
import { emptyField } from "./field";
import {
  type AccountInfo,
  CLASS_CODE_PATTERN,
  emptyBattle,
  emptyRoom,
  emptySave,
  emptyShop,
  LocalProgressStore,
  migrateSave,
  normalizeClassCode,
  type RemoteBackend,
  type RemoteRecord,
  type SaveData,
  SyncedProgressStore,
  type SyncStatus,
  withoutEvidenceImage,
} from "./progressStore";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const won = { won: true, wins: 1, sorties: 1, asked: 5, correct: 4 };

const sample: SaveData = {
  version: 6,
  updatedAt: "2026-10-02T01:00:00.000Z",
  profile: { name: "ทดสอบ", difficulty: "normal", classCode: "PVC1-67", avatar: "b" },
  pretest: { form: "B", correctByTopic: { 1: 2, 2: 0 }, items: [{ id: "B1a", topic: 1, correct: true, timeMs: 1200 }], completedAt: "2026-10-02T00:00:00.000Z" },
  posttest: null,
  rooms: { 1: { ...emptyRoom(), stationsSeen: 5, minigameDone: true, stars: 2, core: true, outcome: { totalMisses: 1, requiredRepair: false } } },
  battles: { n1: won },
  npcs: { mechanic: { accepted: true, found: [0, 2], done: false, best: 0, tries: 0 }, coach: { accepted: false, found: [], done: false, best: 3, tries: 2 } },
  story: ["prologue", "zone-n1", "win-n1"],
  shop: { spent: 325, owned: ["outfit-engineer", "bit-ninja", "module-scanner"], supplies: { ...emptyShop().supplies, "repair-kit": 1, reboot: 1 }, outfit: "engineer", paint: "standard", bit: "ninja" },
};

const withImage = (data: SaveData, image: string | null): SaveData => ({
  ...data,
  rooms: { ...data.rooms, 6: { ...emptyRoom(), field: { ...emptyField(course.finalQuest), evidence: { image, outsideGame: false } } } },
});

describe("LocalProgressStore", () => {
  it("ยังไม่มีข้อมูล: load คืน null", async () => {
    expect(await new LocalProgressStore(fakeStorage()).load()).toBeNull();
  });

  it("save แล้ว load ได้ข้อมูลเดิม", async () => {
    const store = new LocalProgressStore(fakeStorage());
    await store.save(sample);
    expect(await store.load()).toEqual(sample);
  });

  it("clear ลบข้อมูล", async () => {
    const storage = fakeStorage();
    const store = new LocalProgressStore(storage);
    await store.save(sample);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("ข้อมูลเสีย: load คืน null ไม่โยน error", async () => {
    expect(await new LocalProgressStore(fakeStorage({ "ai-trainer-quest-save": "{not json" })).load()).toBeNull();
  });

  it("พื้นที่เก็บเต็ม: บันทึกความคืบหน้าโดยไม่มีภาพหลักฐาน", async () => {
    const storage = fakeStorage();
    const setItem = storage.setItem;
    storage.setItem = (key, value) => {
      if (value.includes("data:image")) throw new DOMException("full", "QuotaExceededError");
      setItem(key, value);
    };
    const store = new LocalProgressStore(storage);
    await store.save(withImage(sample, "data:image/jpeg;base64,AAAA"));
    const loaded = await store.load();
    expect(loaded?.rooms[1].core).toBe(true);
    expect(loaded?.rooms[6].field?.evidence).toEqual({ image: null, outsideGame: false, onDevice: true });
  });
});

describe("migrateSave", () => {
  it("รุ่น 1 ของต้นแบบห้อง 1: เก็บความคืบหน้าของห้องไว้ โปรไฟล์และแบบทดสอบก่อนเรียนว่าง", () => {
    const v1 = { state: { progress: { 1: { stationsSeen: 5, minigameDone: true, stars: 3, reviewAnswers: ["a"], reviewDone: true, core: true } } }, version: 1 };
    expect(migrateSave(v1)).toEqual({
      ...emptySave(),
      rooms: { 1: { ...emptyRoom(), stationsSeen: 5, minigameDone: true, stars: 3, reviewAnswers: ["a"], reviewDone: true, core: true } },
      battles: { k1: { ...emptyBattle(), won: true, wins: 1 } },
      story: ["win-k1"],
    });
  });

  it("รุ่น 2: เติมรหัสห้องเรียนว่าง ผลก่อนเรียนเหลือคะแนนรายหัวข้อ ห้องได้ช่องข้อมูลใหม่", () => {
    const v2 = {
      version: 2,
      profile: { name: "ทดสอบ", style: "hands" },
      pretest: { correctByTopic: { 1: 1 }, items: [{ topic: 1, correct: true, timeMs: 5 }], completedAt: "2026-09-01T00:00:00.000Z" },
      rooms: { 1: { stationsSeen: 2, minigameDone: false, stars: 0, outcome: null, summary: null, reviewAnswers: [], reviewDone: false, field: null, core: false, coreAt: null } },
    };
    expect(migrateSave(v2)).toEqual({
      ...emptySave(),
      profile: { name: "ทดสอบ", difficulty: "easy", classCode: "", avatar: "a" },
      pretest: { form: "A", correctByTopic: { 1: 1 }, items: [], completedAt: "2026-09-01T00:00:00.000Z" },
      rooms: { 1: { ...emptyRoom(), stationsSeen: 2 } },
    });
  });

  it("รุ่น 3 (ก่อนมีเนื้อเรื่อง ด่านต่อสู้ และร้านค้า): ห้องที่ได้แกน AI แล้วถือว่าผ่านด่านต่อสู้ ห้องถัดไปจึงไม่ถูกล็อกย้อนหลัง", () => {
    const v3 = {
      version: 3,
      updatedAt: "2026-10-01T00:00:00.000Z",
      profile: { name: "ทดสอบ", style: "read", classCode: "PVC1" },
      pretest: sample.pretest,
      posttest: null,
      rooms: { 1: { ...emptyRoom(), core: true }, 2: { ...emptyRoom(), stationsSeen: 2 } },
    };
    const save = migrateSave(JSON.parse(JSON.stringify(v3))) as SaveData;
    expect(save.version).toBe(6);
    expect(save.updatedAt).toBe(v3.updatedAt);
    expect(save.profile).toEqual({ name: "ทดสอบ", difficulty: "easy", classCode: "PVC1", avatar: "a" });
    expect(save.pretest).toEqual(sample.pretest);
    expect(save.battles).toEqual({ k1: { ...emptyBattle(), won: true, wins: 1 } });
    expect(save.story).toEqual(["win-k1"]);
    expect(save.shop).toEqual(emptyShop());
  });

  it("รุ่น 4 (สไตล์การเรียน และผลด่านต่อสู้เก็บไว้กับห้อง): เป็นระดับง่าย ผลด่านย้ายไปเก็บตามรหัสด่าน ความคืบหน้าอื่นคงเดิม", () => {
    const battle = (patch: object) => ({ won: false, sorties: 0, asked: 0, correct: 0, ...patch });
    const v4 = {
      version: 4,
      updatedAt: "2026-10-02T01:00:00.000Z",
      profile: { name: "ทดสอบ", style: "visual", classCode: "PVC1-67", avatar: "b" },
      pretest: sample.pretest,
      posttest: null,
      rooms: {
        1: { ...emptyRoom(), stationsSeen: 5, minigameDone: true, stars: 2, core: true, battle: battle({ won: true, sorties: 2, asked: 9, correct: 6 }) },
        2: { ...emptyRoom(), core: true, battle: battle({ sorties: 1, asked: 4, correct: 1 }) },
        3: { ...emptyRoom(), stationsSeen: 1, battle: battle({}) },
        6: { ...emptyRoom(), core: true, battle: battle({ won: true, sorties: 1, asked: 12, correct: 12 }) },
      },
      story: ["prologue", "room-1"],
      shop: { spent: 125, owned: ["outfit-engineer"], supplies: { "repair-kit": 1, shield: 0 }, outfit: "engineer", paint: "standard" },
    };
    const save = migrateSave(JSON.parse(JSON.stringify(v4))) as SaveData;
    expect(save.version).toBe(6);
    expect(save.profile).toEqual({ name: "ทดสอบ", difficulty: "easy", classCode: "PVC1-67", avatar: "b" });
    expect(save.battles).toEqual({
      k1: { won: true, wins: 1, sorties: 2, asked: 9, correct: 6 },
      k2: { won: false, wins: 0, sorties: 1, asked: 4, correct: 1 },
      omega: { won: true, wins: 1, sorties: 1, asked: 12, correct: 12 },
    });
    expect(save.rooms[1]).toEqual({ ...emptyRoom(), stationsSeen: 5, minigameDone: true, stars: 2, core: true });
    expect("battle" in save.rooms[1]).toBe(false);
    // ด่านที่ชนะไปแล้วถือว่าดูฉากหลังชนะแล้ว ผู้เล่นเดิมจึงไม่เห็นฉากย้อนหลังต่อกันรวดเดียว
    expect(save.story).toEqual(["prologue", "room-1", "win-k1", "win-omega"]);
    expect(save.npcs).toEqual({});
    expect(save.shop).toEqual({ spent: 125, owned: ["outfit-engineer"], supplies: { ...emptyShop().supplies, "repair-kit": 1 }, outfit: "engineer", paint: "standard", bit: "classic" });
    // ย้ายซ้ำได้ผลเดิม
    expect(migrateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it("รุ่น 5 (ก่อนมี NPC ประจำห้อง คอสตูมของพี่บิต และภาพเนื้อเรื่องหลังชนะด่าน): ความคืบหน้าคงเดิม ได้ช่องใหม่เป็นค่าเริ่มต้น", () => {
    const v5 = {
      version: 5,
      updatedAt: "2026-10-02T03:00:00.000Z",
      profile: { name: "ทดสอบ", difficulty: "normal", classCode: "PVC1-67", avatar: "b" },
      pretest: sample.pretest,
      posttest: null,
      rooms: sample.rooms,
      battles: { n1: won, n2: { won: false, wins: 0, sorties: 1, asked: 3, correct: 1 } },
      story: ["prologue", "zone-n1"],
      shop: { spent: 100, owned: ["outfit-engineer"], supplies: { ...emptyShop().supplies, shield: 2 }, outfit: "engineer", paint: "standard" },
    };
    const save = migrateSave(JSON.parse(JSON.stringify(v5))) as SaveData;
    expect(save.version).toBe(6);
    expect([save.profile, save.rooms, save.battles]).toEqual([v5.profile, v5.rooms, v5.battles]);
    expect(save.story).toEqual(["prologue", "zone-n1", "win-n1"]);
    expect(save.npcs).toEqual({});
    expect(save.shop).toEqual({ ...v5.shop, bit: "classic" });
    // ข้อมูลรุ่นปัจจุบันไม่ถูกเติมฉากให้เอง: ผู้เล่นที่เพิ่งชนะด่านต้องได้เห็นฉากหลังชนะ
    const fresh = migrateSave({ ...JSON.parse(JSON.stringify(save)), battles: { ...save.battles, n2: won } }) as SaveData;
    expect(fresh.story).toEqual(save.story);
  });

  it("กิจกรรมเสริมกับ NPC ที่ผิดรูป: ตัด NPC ที่ไม่รู้จัก ชิ้นที่เก็บต้องอยู่ในช่วงของเควส ส่งของได้เมื่อเก็บครบ และคะแนนถามตอบไม่เกินจำนวนข้อ", () => {
    const save = migrateSave({
      ...JSON.parse(JSON.stringify(sample)),
      npcs: {
        mechanic: { accepted: false, found: [0, 0, 1, 7, -1, "x"], done: true, best: 99 },
        foreman: { found: [0, 1, 2, 3], done: true },
        coach: { best: 99, tries: 2.7, done: true, found: [0] },
        archivist: { done: true },
        stranger: { done: true },
        director: null,
      },
    }) as SaveData;
    expect(Object.keys(save.npcs).sort()).toEqual(["archivist", "coach", "director", "foreman", "mechanic"]);
    // เก็บได้ 2 จาก 3 ชิ้น: ยังส่งไม่ได้ แต่ถือว่ารับเควสแล้ว
    expect(save.npcs.mechanic).toEqual({ accepted: true, found: [0, 1], done: false, best: 0, tries: 0 });
    expect(save.npcs.foreman).toMatchObject({ accepted: true, found: [0, 1, 2, 3], done: true });
    expect(save.npcs.coach).toEqual({ accepted: false, found: [], done: false, best: 4, tries: 2 });
    expect(save.npcs.archivist).toMatchObject({ done: false });
    expect(save.npcs.director).toEqual({ accepted: false, found: [], done: false, best: 0, tries: 0 });
  });

  it("คอสตูมและโมดูลของพี่บิต: ใช้คอสตูมได้เฉพาะที่ซื้อแล้ว", () => {
    const shop = (patch: object) => (migrateSave({ ...JSON.parse(JSON.stringify(sample)), shop: { ...sample.shop, ...patch } }) as SaveData).shop;
    expect(shop({}).bit).toBe("ninja");
    expect(shop({ bit: "gold" }).bit).toBe("classic");
    expect(shop({ bit: "robot-dragon" }).bit).toBe("classic");
    expect(shop({ owned: ["module-laser", "bit-star", "module-teleport"], bit: "star" })).toMatchObject({ owned: ["module-laser", "bit-star"], bit: "star" });
  });

  it("ผลด่านต่อสู้ที่ผิดรูป: ตัดรหัสด่านที่ไม่ถูกรูปแบบ เติมตัวเลขที่หายไป และด่านที่ชนะแล้วนับว่าชนะอย่างน้อยหนึ่งครั้ง", () => {
    const save = migrateSave({ ...JSON.parse(JSON.stringify(sample)), battles: { k1: { won: true }, "BAD ID": { won: true }, omega: "x", n2: { won: false, wins: 4, sorties: -2, asked: "9", correct: 3 } } }) as SaveData;
    expect(Object.keys(save.battles).sort()).toEqual(["k1", "n2", "omega"]);
    expect(save.battles.k1).toMatchObject({ won: true, wins: 1 });
    expect(save.battles.omega).toEqual(emptyBattle());
    expect(save.battles.n2).toMatchObject({ won: false, sorties: 0, correct: 3 });
  });

  it("ระดับความยากที่ไม่รู้จัก: เป็นระดับง่าย", () => {
    const save = migrateSave({ ...JSON.parse(JSON.stringify(sample)), profile: { name: "ทดสอบ", difficulty: "nightmare", classCode: "", avatar: "b" } }) as SaveData;
    expect(save.profile?.difficulty).toBe("easy");
  });

  it("ร้านค้าที่ผิดรูป: ตัดสินค้าที่ไม่มีในร้าน จำกัดจำนวนของใช้ และไม่ให้สวมของที่ยังไม่ได้ซื้อ", () => {
    const save = migrateSave({
      ...JSON.parse(JSON.stringify(sample)),
      story: ["prologue", 5, "prologue", "x".repeat(99)],
      shop: { spent: -5, owned: ["outfit-pilot", "outfit-pilot", "free-everything", "supply-shield", 7], supplies: { "repair-kit": 99, shield: "x" }, outfit: "guardian", paint: "gold" },
    }) as SaveData;
    expect(save.story).toEqual(["prologue"]);
    expect(save.shop).toEqual({ spent: 0, owned: ["outfit-pilot"], supplies: { ...emptyShop().supplies, "repair-kit": 3 }, outfit: "lab", paint: "standard", bit: "classic" });
  });

  it("ข้อมูลผิดรูป (ไฟล์เสีย หรือถูกแก้จากนอกเกม): เติมค่าเริ่มต้นทีละช่อง ไม่ปล่อยค่าผิดชนิดเข้าเกมหรือแดชบอร์ดครู", () => {
    const hostile = {
      version: 6,
      updatedAt: 5,
      profile: { name: "ก".repeat(200), style: "telepathy", classCode: 7 },
      pretest: { form: "Z", correctByTopic: { 1: "สอง", 2: 2 }, items: [{ id: "A1a", topic: 1, correct: "yes" }, "junk", null], completedAt: {} },
      posttest: "ยังไม่ทำ",
      rooms: {
        1: { stationsSeen: "5", stars: 99, tutor: null, missed: { ก: -1, ข: 2, ค: "x" }, reviewAnswers: ["ดี", 5, null], outcome: "bad", field: { results: "x", notes: [1], evidence: { image: "javascript:alert(1)" } } },
        2: null,
        99: { core: true },
        abc: { core: true },
      },
    };
    const save = migrateSave(hostile) as SaveData;
    expect(save.updatedAt).toBe(emptySave().updatedAt);
    expect(save.profile).toEqual({ name: "ก".repeat(40), difficulty: "easy", classCode: "", avatar: "a" });
    expect(save.battles).toEqual({});
    expect(save.story).toEqual([]);
    expect(save.shop).toEqual(emptyShop());
    expect(save.pretest).toEqual({ form: "A", correctByTopic: { 1: 0, 2: 2 }, items: [{ id: "A1a", topic: 1, correct: false, timeMs: 0 }], completedAt: "" });
    expect(save.posttest).toBeNull();
    expect(Object.keys(save.rooms)).toEqual(["1", "2"]);
    expect(save.rooms[2]).toEqual(emptyRoom());
    expect(save.rooms[1]).toEqual({ ...emptyRoom(), stars: 3, missed: { ข: 2 }, reviewAnswers: ["ดี", "", ""], outcome: { totalMisses: 0, requiredRepair: false }, field: emptyField(course.finalQuest) });
  });

  it("ข้อมูลที่ถูกต้องอ่านกลับได้เหมือนเดิมทุกช่อง", () => {
    const full: SaveData = { ...withImage(sample, "data:image/jpeg;base64,AAAA"), posttest: sample.pretest };
    expect(migrateSave(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });

  it("รูปแบบที่ไม่รู้จัก: คืน null", () => {
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave("text")).toBeNull();
    expect(migrateSave({ version: 99 })).toBeNull();
  });
});

describe("withoutEvidenceImage", () => {
  it("ตัดภาพออกและจดว่าภาพอยู่ในเครื่อง ส่วนอื่นคงเดิม", () => {
    const stripped = withoutEvidenceImage(withImage(sample, "data:image/jpeg;base64,AAAA"));
    expect(JSON.stringify(stripped)).not.toContain("data:image");
    expect(stripped.rooms[6].field?.evidence).toEqual({ image: null, outsideGame: false, onDevice: true });
    expect(stripped.rooms[1]).toBe(sample.rooms[1]);
  });

  it("ไม่มีภาพ: ไม่เปลี่ยนอะไร", () => {
    expect(withoutEvidenceImage(sample)).toEqual(sample);
  });
});

describe("รหัสห้องเรียน", () => {
  it("ตัดช่องว่างและแปลงเป็นตัวพิมพ์ใหญ่ก่อนตรวจ", () => {
    expect(normalizeClassCode("  pvc1-67 ")).toBe("PVC1-67");
    expect(CLASS_CODE_PATTERN.test("PVC1-67")).toBe(true);
    for (const bad of ["", "ปวช1", "A B", "A".repeat(21), "A/1"]) expect(CLASS_CODE_PATTERN.test(bad)).toBe(false);
  });
});

function fakeRemote(initial: RemoteRecord | null = null) {
  const state = { record: initial, saves: [] as SaveData[], resets: 0, failing: false, log: [] as string[], gate: Promise.resolve() };
  const backend: RemoteBackend = {
    load: async () => {
      if (state.failing) throw new Error("offline");
      return state.record;
    },
    save: async (data) => {
      if (state.failing) throw new Error("offline");
      await state.gate;
      state.saves.push(data);
      state.log.push("save");
      state.record = { data, resumeCode: "ABCDE12345" };
      return "ABCDE12345";
    },
    reset: async () => {
      if (state.failing) throw new Error("offline");
      state.resets += 1;
      state.log.push("reset");
      state.record = null;
    },
    detach: async () => {
      state.log.push("detach");
    },
    claim: async (code) => (code === "ABCDE12345" ? state.record : null),
  };
  return { state, backend };
}

describe("SyncedProgressStore", () => {
  const statuses: [SyncStatus, string | null][] = [];
  const make = (remote: RemoteBackend, local = new LocalProgressStore(fakeStorage())) => ({
    local,
    store: new SyncedProgressStore(local, remote, { delayMs: 1000, retryMs: 5000, loadTimeoutMs: 3000, onStatus: (status, code) => statuses.push([status, code]) }),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    statuses.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("save: เก็บในเครื่องทันที ส่งขึ้นฐานข้อมูลกลางครั้งเดียวหลังหน่วง ด้วยข้อมูลล่าสุด", async () => {
    const remote = fakeRemote();
    const { store, local } = make(remote.backend);
    await store.save(sample);
    await store.save({ ...sample, updatedAt: "2026-10-02T02:00:00.000Z" });
    expect((await local.load())?.updatedAt).toBe("2026-10-02T02:00:00.000Z");
    expect(remote.state.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.state.saves.map((data) => data.updatedAt)).toEqual(["2026-10-02T02:00:00.000Z"]);
    expect(statuses.at(-1)).toEqual(["synced", "ABCDE12345"]);
  });

  it("ไม่มีรหัสห้องเรียน: ไม่ส่งออกจากเครื่อง", async () => {
    const remote = fakeRemote();
    const { store, local } = make(remote.backend);
    await store.save({ ...sample, profile: { name: "ทดสอบ", difficulty: "easy", classCode: "", avatar: "a" } });
    await vi.advanceTimersByTimeAsync(10000);
    expect(remote.state.saves).toHaveLength(0);
    expect(await local.load()).not.toBeNull();
  });

  it("ภาพหลักฐานอยู่ในเครื่องเท่านั้น ไม่ถูกส่งขึ้นฐานข้อมูลกลาง", async () => {
    const remote = fakeRemote();
    const { store, local } = make(remote.backend);
    await store.save(withImage(sample, "data:image/jpeg;base64,AAAA"));
    await store.flush();
    expect(JSON.stringify(remote.state.saves)).not.toContain("data:image");
    expect(remote.state.saves[0].rooms[6].field?.evidence.onDevice).toBe(true);
    expect((await local.load())?.rooms[6].field?.evidence.image).toBe("data:image/jpeg;base64,AAAA");
  });

  it("เครือข่ายล่ม: เกมยังบันทึกในเครื่องได้ แล้วส่งใหม่เองเมื่อกลับมา", async () => {
    const remote = fakeRemote();
    remote.state.failing = true;
    const { store, local } = make(remote.backend);
    await store.save(sample);
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses.at(-1)?.[0]).toBe("error");
    expect(await local.load()).toEqual(sample);
    remote.state.failing = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(remote.state.saves).toHaveLength(1);
    expect(statuses.at(-1)).toEqual(["synced", "ABCDE12345"]);
  });

  it("load: ฐานข้อมูลกลางใหม่กว่า ใช้ของฐานข้อมูลกลาง และใส่ภาพหลักฐานของเครื่องนี้คืน", async () => {
    const newer = withoutEvidenceImage(withImage({ ...sample, updatedAt: "2026-10-03T00:00:00.000Z" }, "data:image/jpeg;base64,AAAA"));
    const remote = fakeRemote({ data: newer, resumeCode: "ABCDE12345" });
    const { store, local } = make(remote.backend);
    await local.save(withImage(sample, "data:image/jpeg;base64,AAAA"));
    const loaded = await store.load();
    expect(loaded?.updatedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(loaded?.rooms[6].field?.evidence.image).toBe("data:image/jpeg;base64,AAAA");
    expect(statuses.at(-1)).toEqual(["synced", "ABCDE12345"]);
    expect(remote.state.saves).toHaveLength(0);
  });

  it("load: สำเนาในเครื่องใหม่กว่า ใช้ของเครื่องและส่งขึ้นไปแทน", async () => {
    const remote = fakeRemote({ data: { ...sample, updatedAt: "2026-10-01T00:00:00.000Z" }, resumeCode: "ABCDE12345" });
    const { store, local } = make(remote.backend);
    await local.save(sample);
    expect((await store.load())?.updatedAt).toBe(sample.updatedAt);
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.state.saves.map((data) => data.updatedAt)).toEqual([sample.updatedAt]);
  });

  it("load: ฐานข้อมูลกลางไม่ตอบ ใช้สำเนาในเครื่องโดยไม่ค้าง", async () => {
    const hanging: RemoteBackend = { ...fakeRemote().backend, load: () => new Promise(() => {}) };
    const { store, local } = make(hanging);
    await local.save(sample);
    const loading = store.load();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await loading).toEqual(sample);
    expect(statuses.at(-1)?.[0]).toBe("error");
  });

  it("clear: ลบสำเนาในเครื่อง ยกเลิกรายการที่ค้าง และแจ้งฐานข้อมูลกลางให้เก็บถาวร", async () => {
    const remote = fakeRemote();
    const { store, local } = make(remote.backend);
    await store.save(sample);
    await store.clear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await local.load()).toBeNull();
    expect(remote.state.saves).toHaveLength(0);
    expect(remote.state.resets).toBe(1);
    expect(statuses.at(-1)).toEqual(["local", null]);
  });

  it("clear ระหว่างที่กำลังส่ง: คำสั่งเริ่มใหม่ไปถึงหลังการบันทึกเสมอ", async () => {
    const remote = fakeRemote();
    let open = () => {};
    remote.state.gate = new Promise<void>((resolve) => (open = resolve));
    const { store } = make(remote.backend);
    await store.save(sample);
    const flushing = store.flush();
    await Promise.resolve(); // คำขอบันทึกออกไปแล้ว แต่ยังไม่ได้คำตอบ
    const clearing = store.clear();
    open();
    await Promise.all([flushing, clearing]);
    expect(remote.state.log).toEqual(["save", "reset"]);
  });

  it("detach (ผู้เรียนคนใหม่ใช้เครื่องเดิม): ส่งงานที่ค้างของคนเดิมก่อน แล้วตัดการเชื่อมโดยไม่เก็บถาวร", async () => {
    const remote = fakeRemote();
    const { store, local } = make(remote.backend);
    await store.save(sample);
    await store.detach();
    expect(remote.state.log).toEqual(["save", "detach"]);
    expect(remote.state.resets).toBe(0);
    expect(remote.state.record?.data.profile?.name).toBe("ทดสอบ");
    expect(await local.load()).toBeNull();
    expect(statuses.at(-1)).toEqual(["local", null]);
  });

  it("claim: รหัสถูก ได้ข้อมูลมาเก็บในเครื่อง รหัสผิดคืน null", async () => {
    const remote = fakeRemote({ data: sample, resumeCode: "ABCDE12345" });
    const { store, local } = make(remote.backend);
    expect(await store.claim("WRONG")).toBeNull();
    expect(await local.load()).toBeNull();
    expect(await store.claim("ABCDE12345")).toEqual(sample);
    expect(await local.load()).toEqual(sample);
    expect(statuses.at(-1)).toEqual(["synced", "ABCDE12345"]);
  });

  describe("เข้าสู่ระบบด้วย Google", () => {
    const solo: SaveData = { ...sample, profile: { name: "เล่นคนเดียว", difficulty: "easy", classCode: "", avatar: "a" } };
    /** ฐานข้อมูลกลางจำลองที่มีระบบบัญชี: จำว่าเครื่องนี้ใช้บัญชีอะไร และถูกสั่งให้ไปล็อกอินแบบไหน */
    function googleRemote(account: AccountInfo | null, record: RemoteRecord | null = null, authError: string | null = null) {
      const remote = fakeRemote(record);
      const auth = { account, calls: [] as string[] };
      const backend: RemoteBackend = {
        ...remote.backend,
        authError,
        account: async () => auth.account,
        signInWithGoogle: async (link) => void auth.calls.push(link ? "link" : "signin"),
        signOut: async () => {
          auth.calls.push("signout");
          auth.account = null;
        },
      };
      return { ...remote, auth, backend };
    }
    const makeWith = (backend: RemoteBackend, flags = fakeStorage(), local = new LocalProgressStore(fakeStorage())) => {
      const accounts: (AccountInfo | null)[] = [];
      const store = new SyncedProgressStore(local, backend, { delayMs: 1000, retryMs: 5000, loadTimeoutMs: 3000, flags, onAccount: (account) => accounts.push(account), onStatus: (status, code) => statuses.push([status, code]) });
      return { store, local, flags, accounts };
    };
    const google: AccountInfo = { provider: "google", email: "kaew@example.com" };

    it("บัญชี Google: ส่งความคืบหน้าขึ้นฐานข้อมูลกลางแม้ไม่มีรหัสห้องเรียน", async () => {
      const remote = googleRemote(google);
      const { store, accounts } = makeWith(remote.backend);
      await store.load();
      expect(accounts).toEqual([google]);
      await store.save(solo);
      await vi.advanceTimersByTimeAsync(1000);
      expect(remote.state.saves).toHaveLength(1);
    });

    it("เครื่องที่ยังไม่มีบัญชี: ไปเข้าสู่ระบบ กลับมาแล้วใช้ความคืบหน้าของบัญชี ไม่ให้สำเนาในเครื่องที่ใหม่กว่าไปทับ", async () => {
      const mine: SaveData = { ...sample, updatedAt: "2026-10-01T00:00:00.000Z", profile: { ...solo.profile!, name: "เจ้าของบัญชี" } };
      const other: SaveData = { ...solo, updatedAt: "2026-10-05T00:00:00.000Z" };
      const flags = fakeStorage();
      const local = new LocalProgressStore(fakeStorage());
      await local.save(other);
      const before = googleRemote(null);
      const first = makeWith(before.backend, flags, local);
      await first.store.load();
      await first.store.signInWithGoogle();
      expect(before.auth.calls).toEqual(["signin"]);

      // หน้าเกมเปิดใหม่หลังถูกพากลับมา ตอนนี้เป็นบัญชี Google ที่มีความคืบหน้าอยู่แล้ว
      const after = googleRemote(google, { data: mine, resumeCode: "GOOGLE0001" });
      const second = makeWith(after.backend, flags, local);
      expect((await second.store.load())?.profile?.name).toBe("เจ้าของบัญชี");
      expect((await local.load())?.profile?.name).toBe("เจ้าของบัญชี");
      await vi.advanceTimersByTimeAsync(5000);
      expect(after.state.saves).toHaveLength(0);
      // ธงใช้ได้ครั้งเดียว: เปิดครั้งถัดไปกลับไปใช้กติกาปกติ (สำเนาที่ใหม่กว่าชนะ)
      await local.save(other);
      const third = makeWith(after.backend, flags, local);
      expect((await third.store.load())?.profile?.name).toBe("เล่นคนเดียว");
    });

    it("บัญชี Google ที่ยังไม่มีความคืบหน้า: ความคืบหน้าในเครื่องกลายเป็นของบัญชีนั้น", async () => {
      const flags = fakeStorage({ "ai-trainer-quest-google-signin": "1" });
      const local = new LocalProgressStore(fakeStorage());
      await local.save(solo);
      const remote = googleRemote(google);
      const { store } = makeWith(remote.backend, flags, local);
      expect((await store.load())?.profile?.name).toBe("เล่นคนเดียว");
      await vi.advanceTimersByTimeAsync(1000);
      expect(remote.state.saves.map((data) => data.profile?.name)).toEqual(["เล่นคนเดียว"]);
    });

    it("เครื่องที่มีบัญชีไม่ระบุตัวตน: ผูก Google เข้ากับบัญชีเดิม ถ้าบัญชี Google นั้นมีเจ้าของแล้ว ครั้งถัดไปจึงออกจากบัญชีเดิมแล้วเข้าสู่ระบบแทน", async () => {
      const flags = fakeStorage();
      const linking = googleRemote({ provider: "anonymous", email: null }, { data: sample, resumeCode: "ABCDE12345" });
      const first = makeWith(linking.backend, flags);
      await first.store.load();
      await first.store.signInWithGoogle();
      expect(linking.auth.calls).toEqual(["link"]);

      const refused = googleRemote({ provider: "anonymous", email: null }, { data: sample, resumeCode: "ABCDE12345" }, "identity_already_exists");
      const second = makeWith(refused.backend, flags);
      await second.store.load();
      expect([second.store.googleInUse, second.store.googleFailed]).toEqual([true, false]);
      await second.store.signInWithGoogle();
      expect(refused.auth.calls).toEqual(["signout", "signin"]);
      expect(refused.state.resets).toBe(0);
    });

    it("ออกจากระบบ: ส่งความคืบหน้าที่ค้างอยู่ก่อน ลบสำเนาในเครื่อง ข้อมูลในฐานข้อมูลกลางไม่ถูกเก็บถาวร", async () => {
      const remote = googleRemote(google);
      const { store, local, accounts } = makeWith(remote.backend);
      await store.load();
      await store.save(solo);
      await store.signOut();
      expect(remote.state.log).toEqual(["save"]);
      expect(remote.auth.calls).toEqual(["signout"]);
      expect(await local.load()).toBeNull();
      expect(accounts.at(-1)).toBeNull();
      expect(statuses.at(-1)).toEqual(["local", null]);
    });
  });
});
