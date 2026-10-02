// ที่อยู่ของภาพที่หน้า HTML ใช้ (ไฟล์สร้างโดย npm run assets:build ตาม public/assets/assets-manifest.json)
import type { Avatar, Outfit } from "../state/shop.config";

export const art = {
  mentor: "assets/characters/ch_mentor_south.png",
  professor: "assets/portraits/pt_professor.png",
  robot: "assets/battle/bt_robot.png",
  player: (avatar: Avatar, outfit: Outfit): string => `assets/characters/ch_${avatar}_${outfit}_south.png`,
  kaiju: (room: number): string => `assets/battle/bt_kaiju_${room}.png`,
  backdrop: (room: number): string => `assets/battle/bg_battle_${room}.png`,
  core: (room: number): string => `assets/cores/core_${room}.png`,
} as const;
