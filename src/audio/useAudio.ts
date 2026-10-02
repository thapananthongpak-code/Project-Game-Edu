import { useEffect, useSyncExternalStore } from "react";
import { coreCount, useGameStore } from "../state/gameStore";
import { getAudioSettings, installAudioLifecycle, playSfx, setMusic, subscribeAudioSettings } from "./engine";

/** การตั้งค่าเสียงปัจจุบัน (เปลี่ยนแล้วคอมโพเนนต์วาดใหม่) */
export const useAudioSettings = () => useSyncExternalStore(subscribeAudioSettings, getAudioSettings);

/**
 * ผู้กำกับเสียง: เลือกเพลงตามหน้าจอและอารมณ์ของฉาก และเล่นเสียงประกอบตามเหตุการณ์ใน store
 * หน้าต่างที่อารมณ์เปลี่ยนระหว่างเปิดอยู่ (ด่านต่อสู้ ฉากเนื้อเรื่อง) บอกเพลงที่ต้องการผ่าน musicCue ใน store (เปิดปิดหน้าต่าง เข้าออกห้อง ได้แกน AI ข้อความแจ้ง)
 * ปุ่มทุกปุ่มมีเสียงคลิกจากตัวจับ event ที่ document
 */
export function useAudioDirector(): void {
  useEffect(() => {
    const removeLifecycle = installAudioLifecycle();

    const pickMusic = () => {
      const { screen, zone, overlay, musicCue } = useGameStore.getState();
      if (musicCue) return setMusic(musicCue.name, musicCue.variant ?? 0);
      // ก่อนที่หน้าต่างจะบอกเพลงของตัวเอง: หน้าเตรียมออกปฏิบัติการใช้เพลงตึงเครียด ฉากเนื้อเรื่องใช้เพลงเนื้อเรื่อง
      if (overlay === "battle" || overlay === "missions") return setMusic("tension");
      if (overlay === "storage" || overlay === "decor") return setMusic("shop");
      if (overlay === "story") return setMusic("story");
      if (overlay === "certificate") return setMusic("victory");
      if (overlay === "shop") return setMusic("shop");
      if (screen === "room" && zone !== null) return setMusic("study", zone);
      if (screen === "hangar") return setMusic("hangar");
      setMusic("lab");
    };
    pickMusic();

    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.screen !== previous.screen || state.zone !== previous.zone || state.overlay !== previous.overlay || state.musicCue !== previous.musicCue) pickMusic();
      if (coreCount(state) > coreCount(previous)) playSfx("core");
      else if (state.overlay !== previous.overlay && state.overlay !== null && previous.overlay === null) playSfx("open");
      else if (state.overlay === null && previous.overlay !== null) playSfx("close");
      if ((state.screen === "room" || state.screen === "hangar" || state.screen === "hall") && state.screen !== previous.screen && previous.screen !== "menu" && previous.screen !== "onboarding") playSfx("door");
      if (state.npcs !== previous.npcs) {
        const found = (npcs: typeof state.npcs) => Object.values(npcs).reduce((sum, record) => sum + record.found.length, 0);
        if (found(state.npcs) > found(previous.npcs)) playSfx("pickup");
      } else if (state.toast && state.toast.id !== previous.toast?.id) playSfx("toast");
      if (state.npcId !== previous.npcId && state.npcId !== null) playSfx("npc");
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
