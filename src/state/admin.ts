// บัญชีผู้ดูแลเกม (ฟังก์ชันล้วน, docs/GDD.md ข้อ 30): บัญชีที่ฐานข้อมูลบอกว่าเป็นผู้ดูแลมีข้อมูลอยู่ในสถานะจบเกมและเครดิตจำนวนมาก
// เกมหน้าตาและโหมดเหมือนบัญชีอื่นทุกอย่าง เป็นแค่ข้อมูลของบัญชีนั้น (บันทึกตามปกติ) ข้อมูลผู้ดูแลอยู่ใต้ห้อง SOLO ไม่ขึ้นแดชบอร์ดผู้สอน
import { storyBeats } from "../content/story";
import { stationsOf } from "../content";
import { CAMPAIGN, DIFFICULTIES, topicsOf } from "./campaign";
import { MAX_LEVEL } from "./level";
import { type BattleRecord, emptyRoom, type RoomProgress, type SaveData } from "./progressStore";
import { CATALOG } from "./shop.config";

/** เครดิตที่เพิ่มให้ผู้ดูแล (ผ่านช่อง spent ที่ติดลบ) ใช้จ่ายจนเหลือไม่ถึงครึ่งแล้วเกมเติมให้เต็มอีกครั้งตอนเปิดเกม */
export const ADMIN_CREDITS = 1_000_000;

/** หัวข้อที่ผ่านแล้ว (ได้แกน AI) หัวข้อ 6 เป็นภารกิจภาคสนามจึงไม่มีมินิเกมและคำถามทบทวน */
function finishedRoom(topic: number, now: string): RoomProgress {
  const learning = topic < 6;
  return {
    ...emptyRoom(),
    stationsSeen: stationsOf(topic).length,
    minigameDone: learning,
    stars: learning ? 3 : 0,
    review: learning ? { correct: 6, total: 6 } : null,
    reviewDone: learning,
    core: true,
    coreAt: now,
    timeMs: 1000,
  };
}

const finishedBattle = (): BattleRecord => ({ won: true, wins: 1, sorties: 1, asked: 0, correct: 0 });

/**
 * บันทึกที่อยู่ในสถานะจบเกม สร้างจากบันทึกจริง: ทุกหัวข้อของทุกแมพได้แกน AI ชนะไคจูทุกด่าน (ด่านที่ผู้ดูแลชนะจริงแล้วคงสถิติเดิม)
 * ดูเรื่องราวครบ มีของทุกชิ้นรวมรางวัลของเลเวล เครดิตเพิ่มไม่จำกัด ปิดแถบไกด์ ข้อมูลส่วนตัวของผู้เล่น (ชื่อ ตัวละคร ชุด ของที่วางไว้) คงเดิม
 */
export function endgameSave(real: SaveData, now = new Date().toISOString()): SaveData {
  const room = (topic: number, existing?: RoomProgress): RoomProgress => (existing?.core ? existing : finishedRoom(topic, now));
  const rooms = Object.fromEntries(topicsOf("easy").map((topic) => [topic, room(topic, real.rooms[topic])]));
  const maps = {
    normal: Object.fromEntries(topicsOf("normal").map((topic) => [topic, room(topic, real.maps.normal[topic])])),
    hard: Object.fromEntries(topicsOf("hard").map((topic) => [topic, room(topic, real.maps.hard[topic])])),
  };
  const battles: Record<string, BattleRecord> = { ...real.battles };
  for (const map of DIFFICULTIES) for (const battle of CAMPAIGN[map].battles) if (!battles[battle.id]?.won) battles[battle.id] = finishedBattle();
  const owned = new Set(real.shop.owned);
  for (const item of CATALOG) if (item.kind !== "supply") owned.add(item.id);
  return {
    ...real,
    pretest: real.pretest,
    // แบบทดสอบหลังเรียนต้องมีเพื่อให้ด่านสุดท้ายเปิด: ใช้ผลจริงถ้ามี ไม่เช่นนั้นใช้ผลว่างในหน่วยความจำ (ไม่บันทึก)
    posttest: real.posttest ?? (real.pretest ? { form: real.pretest.form === "A" ? "B" : "A", correctByTopic: {}, items: [], completedAt: now } : null),
    rooms,
    maps,
    battles,
    story: [...new Set([...real.story, ...Object.keys(storyBeats)])],
    shop: {
      ...real.shop,
      owned: [...owned],
      supplies: Object.fromEntries(CATALOG.flatMap((item) => (item.kind === "supply" ? [[item.value, item.max]] : []))) as SaveData["shop"]["supplies"],
      spent: Math.min(real.shop.spent, -ADMIN_CREDITS),
      levelSeen: MAX_LEVEL,
      tips: [...new Set([...real.shop.tips, "tutorial", "tips-off"])],
    },
  };
}

/** ข้อมูลอยู่ในสถานะจบเกมแล้ว: ชนะทุกด่านของทุกแมพ มีแบบทดสอบหลังเรียน มีของครบ เลเวลที่แจกรางวัลสูงสุด และเครดิตยังเหลือเกินครึ่งของที่ให้ */
export function isEndgame(state: Pick<SaveData, "battles" | "posttest" | "shop">): boolean {
  const owned = new Set(state.shop.owned);
  return (
    state.posttest !== null &&
    DIFFICULTIES.every((map) => CAMPAIGN[map].battles.every((battle) => state.battles[battle.id]?.won)) &&
    CATALOG.every((item) => item.kind === "supply" || owned.has(item.id)) &&
    state.shop.levelSeen === MAX_LEVEL &&
    state.shop.spent <= -ADMIN_CREDITS / 2
  );
}
