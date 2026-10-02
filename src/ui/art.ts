// ที่อยู่ของภาพที่หน้า HTML ใช้ (ไฟล์สร้างโดย npm run assets:build ตาม public/assets/assets-manifest.json)
import type { FoeArt } from "../state/campaign";
import type { Avatar, Outfit } from "../state/shop.config";

export const art = {
  mentor: "assets/characters/ch_mentor_south.png",
  professor: "assets/portraits/pt_professor.png",
  robot: "assets/battle/bt_robot.png",
  player: (avatar: Avatar, outfit: Outfit): string => `assets/characters/ch_${avatar}_${outfit}_south.png`,
  /** คู่ต่อสู้: ไคจูของด่าน 1–6 หรือร่างที่ 2 และ 3 ของบอส */
  foe: (foe: FoeArt): string => `assets/battle/bt_${foe}.png`,
  backdrop: (room: number): string => `assets/battle/bg_battle_${room}.png`,
  core: (room: number): string => `assets/cores/core_${room}.png`,
  /** ภาพประกอบเนื้อเรื่องหนึ่งช่อง */
  story: (panel: string): string => `assets/story/${panel}.png`,
} as const;
