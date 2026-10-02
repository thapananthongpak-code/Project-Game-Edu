// ขนาดจาก docs/ART_GUIDE.md ข้อ 1
import type { Avatar, Outfit } from "../state/shop.config";

export const BASE_WIDTH = 640;
export const BASE_HEIGHT = 360;
export const TILE = 32;
export const MAP_COLS = 20;
export const MAP_ROWS = 11;
/** ห้องสูง 352 px แถว 8 px ที่เหลืออยู่ด้านบน */
export const MAP_TOP = BASE_HEIGHT - MAP_ROWS * TILE;
/** ผนังด้านบนสูง 2 ไทล์ พื้นเริ่มที่แถว 2 */
export const FLOOR_TOP = MAP_TOP + 2 * TILE;

export const SCENE = { boot: "Boot", hall: "Hall", hangar: "Hangar", room: "Room" } as const;

export type Direction = "south" | "north" | "east" | "west";

/** คีย์แผ่นสไปรต์ของผู้เล่นตามตัวละครและชุด (ตรงกับ scripts/build-assets.py) */
export const playerTexture = (avatar: Avatar, outfit: Outfit): string => `ch_${avatar}_${outfit}`;
