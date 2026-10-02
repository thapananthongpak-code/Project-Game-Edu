import { useGameStore } from "../state/gameStore";
import { art } from "./art";

/** ที่อยู่ภาพของพี่บิตตามคอสตูมที่ผู้เล่นใช้อยู่ */
export const useBit = (): string => useGameStore((s) => art.bit(s.shop.bit));
