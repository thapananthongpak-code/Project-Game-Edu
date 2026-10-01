// คำใบ้สำเร็จรูปเมื่อเรียกติวเตอร์ AI ไม่ได้: ชี้ให้กลับไปอ่านเนื้อหาเดิมของขั้นที่ผู้เล่นอยู่
// ไม่มีข้อความใหม่ ทุกอย่างเป็นหัวข้อย่อยและข้อความจาก course.json (GDD ข้อ 1 หลักข้อ 4)
import { questOf, resolveRefs, type Station, stationsOf } from "../content";
import type { RoomProgress } from "../state/progressStore";

/** เนื้อหาที่เกี่ยวกับขั้นปัจจุบันของผู้เล่นในห้อง */
export function fallbackStations(room: number, progress: RoomProgress): Station[] {
  const stations = stationsOf(room);
  const quest = questOf(room);
  if (progress.stationsSeen < stations.length) return [stations[progress.stationsSeen]];
  if (!progress.minigameDone) {
    const refs = quest?.minigames.flatMap((game) => game.reference ?? []) ?? [];
    if (refs.length > 0) return resolveRefs(room, refs);
  }
  const selfCheck = quest?.selfCheck ?? [];
  return selfCheck.length > 0 ? resolveRefs(room, selfCheck) : stations;
}

/** คำใบ้ของการถามครั้งที่ turn (เริ่มที่ 0) วนตามเนื้อหาที่เกี่ยวข้อง */
export function fallbackHint(room: number, progress: RoomProgress, turn: number): Station {
  const stations = fallbackStations(room, progress);
  return stations[turn % stations.length];
}
