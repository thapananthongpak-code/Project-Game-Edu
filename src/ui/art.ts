// ที่อยู่ของภาพที่หน้า HTML ใช้ (ไฟล์สร้างโดย npm run assets:build ตาม public/assets/assets-manifest.json)
import type { FoeArt } from "../state/campaign";
import type { Gear } from "../state/gear";
import type { NpcId } from "../state/npcs";
import type { Avatar, BitSkin, Outfit } from "../state/shop.config";

/** เอฟเฟกต์ของฉากต่อสู้ (docs/ART_GUIDE.md FX-01..16) */
export type FxArt = "impact" | "slash" | "bolt" | "fireball" | "shield" | "spark" | "fist" | "sword" | "beam" | "bite" | "scrap" | "pincer" | "swarm" | "wave" | "ruin" | "stun";

const GEAR_ART: Record<string, string> = { fist: "fist", sword: "sword", blaster: "blaster", plate: "armor_plate", heavy: "armor_heavy", guard: "armor_guard", retry: "chip_retry", charger: "chip_charger" };

export const art = {
  professor: "assets/portraits/pt_professor.png",
  robot: "assets/battle/bt_robot.png",
  player: (avatar: Avatar, outfit: Outfit): string => `assets/characters/ch_${avatar}_${outfit}_south.png`,
  /** พี่บิตตามคอสตูมที่ใช้อยู่ */
  bit: (skin: BitSkin): string => (skin === "classic" ? "assets/characters/ch_mentor_south.png" : `assets/characters/ch_mentor_${skin}_south.png`),
  npc: (id: NpcId): string => `assets/characters/npc_${id}.png`,
  /** คู่ต่อสู้: ไคจูของด่าน 1–6 หรือร่างที่ 2 และ 3 ของบอส */
  foe: (foe: FoeArt): string => `assets/battle/bt_${foe}.png`,
  fx: (name: FxArt): string => `assets/battle/fx_${name}.png`,
  /** ไอคอนอุปกรณ์ของการ์เดียน (GR-01..08) ช่องชิปที่ว่างไม่มีภาพ */
  gear: (value: Gear[keyof Gear]): string | null => (GEAR_ART[value] ? `assets/gear/gr_${GEAR_ART[value]}.png` : null),
  backdrop: (room: number): string => `assets/battle/bg_battle_${room}.png`,
  core: (room: number): string => `assets/cores/core_${room}.png`,
  /** ภาพประกอบเนื้อเรื่องหนึ่งช่อง */
  story: (panel: string): string => `assets/story/${panel}.png`,
} as const;
