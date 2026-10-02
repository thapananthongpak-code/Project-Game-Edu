import { useEffect, useSyncExternalStore } from "react";
import { isFieldRoom } from "../content";
import { coreCount, useGameStore } from "../state/gameStore";
import { getAudioSettings, installAudioLifecycle, playSfx, setMusic, subscribeAudioSettings } from "./engine";

/** การตั้งค่าเสียงปัจจุบัน (เปลี่ยนแล้วคอมโพเนนต์วาดใหม่) */
export const useAudioSettings = () => useSyncExternalStore(subscribeAudioSettings, getAudioSettings);

/**
 * ผู้กำกับเสียง: เลือกเพลงตามหน้าจอ และเล่นเสียงประกอบตามเหตุการณ์ใน store (เปิดปิดหน้าต่าง เข้าออกห้อง ได้แกน AI ข้อความแจ้ง)
 * ปุ่มทุกปุ่มมีเสียงคลิกจากตัวจับ event ที่ document
 */
export function useAudioDirector(): void {
  useEffect(() => {
    const removeLifecycle = installAudioLifecycle();

    const pickMusic = () => {
      const { screen, room, overlay, battleRoom } = useGameStore.getState();
      if (overlay === "battle" && battleRoom !== null) return setMusic(isFieldRoom(battleRoom) ? "boss" : "battle");
      if (overlay === "story") return setMusic("story");
      if (overlay === "certificate") return setMusic("victory");
      if (screen === "room" && room !== null) return setMusic("study", room);
      setMusic("lab");
    };
    pickMusic();

    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.screen !== previous.screen || state.room !== previous.room || state.overlay !== previous.overlay || state.battleRoom !== previous.battleRoom) pickMusic();
      if (coreCount(state) > coreCount(previous)) playSfx("core");
      else if (state.overlay !== previous.overlay && state.overlay !== null && previous.overlay === null) playSfx("open");
      else if (state.overlay === null && previous.overlay !== null) playSfx("close");
      if ((state.screen === "room" || state.screen === "hangar" || state.screen === "hall") && state.screen !== previous.screen && previous.screen !== "menu" && previous.screen !== "onboarding") playSfx("door");
      if (state.toast && state.toast.id !== previous.toast?.id) playSfx("toast");
    });

    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("button, a[href]")) playSfx("click");
    };
    document.addEventListener("click", click);
    return () => {
      removeLifecycle();
      unsubscribe();
      document.removeEventListener("click", click);
    };
  }, []);
}
