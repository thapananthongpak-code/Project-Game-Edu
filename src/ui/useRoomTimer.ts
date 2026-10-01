import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";
import { IDLE_AFTER_MS, ROOM_TIME_TICK_MS } from "../state/rules";

/**
 * นับเวลาที่ผู้เล่นอยู่ในห้อง สำหรับสรุป "เวลาเฉลี่ยต่อห้อง" ของครู
 * นับเฉพาะตอนที่หน้าเกมเปิดอยู่และผู้เล่นยังแตะจอหรือกดคีย์บอร์ดอยู่ ไม่ใช้ตัดสินผลการเรียน (GDD ข้อ 7.2)
 */
export function useRoomTimer(): void {
  const room = useGameStore((s) => (s.screen === "room" ? s.room : null));

  useEffect(() => {
    if (room === null) return;
    let last = performance.now();
    let active = last;
    const touch = () => {
      active = performance.now();
    };
    const commit = () => {
      const now = performance.now();
      // ช่วงที่ยาวผิดปกติ (เครื่องพักหรือแท็บถูกพัก) นับได้ไม่เกินหนึ่งช่วง
      const elapsed = Math.min(now - last, ROOM_TIME_TICK_MS * 2);
      last = now;
      if (document.visibilityState === "visible" && now - active < IDLE_AFTER_MS && elapsed > 0) useGameStore.getState().addRoomTime(room, Math.round(elapsed));
    };
    const timer = window.setInterval(commit, ROOM_TIME_TICK_MS);
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      commit();
    };
  }, [room]);
}
