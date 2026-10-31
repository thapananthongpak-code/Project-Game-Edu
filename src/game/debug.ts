import type * as Phaser from "phaser";
import { audioDebug } from "../audio/engine";
import { levelDue, levelStatusOf, pauseLevel, useGameStore } from "../state/gameStore";
import { levelCredits } from "../state/level";
import { SCENE } from "./constants";
import type { HangarScene } from "./scenes/HangarScene";
import type { LabScene } from "./scenes/LabScene";
import type { WorldScene } from "./scenes/WorldScene";

/** ข้อมูลอ่านอย่างเดียวสำหรับการทดสอบอัตโนมัติ (เปิดเฉพาะตอน dev): ตำแหน่งผู้เล่นและจุดโต้ตอบ */
export function installDebugHook(game: Phaser.Game): void {
  // สคริปต์ทดสอบที่ไม่ได้ทดสอบเลเวลตั้ง window.__aitqPauseLevel ไว้ก่อนโหลดหน้า เพื่อปิดการแจกรางวัลเลเวลทั้งรอบ
  pauseLevel((window as unknown as { __aitqPauseLevel?: boolean }).__aitqPauseLevel === true);
  (window as unknown as { __aitq: unknown }).__aitq = {
    // สำหรับสคริปต์ถ่ายภาพหน้าจอ (ข้ามไปฉากที่ต้องการ) การทดสอบการเล่นจริงไม่ใช้ทางนี้
    store: useGameStore,
    // เปิด/ปิดการแจกรางวัลเลเวล (แจ้งผู้ฟังของ store ด้วยเพื่อให้หน้าจอตรวจใหม่)
    pauseLevel: (paused: boolean) => {
      pauseLevel(paused);
      useGameStore.setState({});
    },
    snapshot: () => {
      const key = [SCENE.room, SCENE.hangar, SCENE.hall, SCENE.market, SCENE.lab].find((k) => game.scene.isActive(k));
      const scene = key ? (game.scene.getScene(key) as WorldScene) : null;
      const { adminAvailable, ready, screen, zone, room, overlay, stationIndex, prompt, toast, progress, battles, npcs, profile, pretest, posttest, sync, resumeCode, tutorOpen, story, shop, battleId, storyBeat, npcId, shopVendor, shopStall } = useGameStore.getState();
      return {
        scene: key ?? null,
        // ผังของฉากปัจจุบัน ให้สคริปต์ทดสอบหาเส้นทางเดินเองได้
        map: scene?.mapInfo ?? null,
        player: scene?.player ? { x: scene.player.x, y: scene.player.y } : null,
        interactables: scene?.interactables.map(({ id, x, y, enabled }) => ({ id, x, y, enabled: enabled ? enabled() : true })) ?? [],
        companion: scene?.companionPosition ?? null,
        pointer: scene?.pointerTarget ?? null,
        avatar: scene?.player ? scene.avatarState : null,
        decor: scene?.decorInfo ?? [],
        bay: key === SCENE.hangar ? (scene as HangarScene).bayState : null,
        pots: key === SCENE.lab ? (scene as LabScene).potTextures : null,
        audio: audioDebug(),
        // เลเวลและ EXP ตอนนี้ และมีเลเวลใหม่ที่ยังไม่แจกรางวัลหรือไม่ (ให้สคริปต์ทดสอบรอหน้าต่างเลเวลอัปจัดการเสร็จ)
        level: { ...levelStatusOf(useGameStore.getState()), due: levelDue(useGameStore.getState()), credits: levelCredits(useGameStore.getState().shop.levelSeen) },
        store: { adminAvailable, ready, screen, zone, room, overlay, stationIndex, prompt, toast: toast?.text ?? null, progress, battles, npcs, profile, pretest, posttest, sync, resumeCode, tutorOpen, story, shop, battleId, storyBeat, npcId, shopVendor, shopStall },
      };
    },
  };
}
