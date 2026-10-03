import type * as Phaser from "phaser";
import { audioDebug } from "../audio/engine";
import { useGameStore } from "../state/gameStore";
import { SCENE } from "./constants";
import type { HangarScene } from "./scenes/HangarScene";
import type { WorldScene } from "./scenes/WorldScene";

/** ข้อมูลอ่านอย่างเดียวสำหรับการทดสอบอัตโนมัติ (เปิดเฉพาะตอน dev): ตำแหน่งผู้เล่นและจุดโต้ตอบ */
export function installDebugHook(game: Phaser.Game): void {
  (window as unknown as { __aitq: unknown }).__aitq = {
    // สำหรับสคริปต์ถ่ายภาพหน้าจอ (ข้ามไปฉากที่ต้องการ) การทดสอบการเล่นจริงไม่ใช้ทางนี้
    store: useGameStore,
    snapshot: () => {
      const key = [SCENE.room, SCENE.hangar, SCENE.hall].find((k) => game.scene.isActive(k));
      const scene = key ? (game.scene.getScene(key) as WorldScene) : null;
      const { ready, screen, zone, room, overlay, stationIndex, prompt, toast, progress, battles, npcs, profile, pretest, posttest, sync, resumeCode, tutorOpen, story, shop, battleId, storyBeat, npcId, shopVendor } = useGameStore.getState();
      return {
        scene: key ?? null,
        // ผังของฉากปัจจุบัน ให้สคริปต์ทดสอบหาเส้นทางเดินเองได้
        map: scene?.mapInfo ?? null,
        player: scene?.player ? { x: scene.player.x, y: scene.player.y } : null,
        interactables: scene?.interactables.map(({ id, x, y, enabled }) => ({ id, x, y, enabled: enabled ? enabled() : true })) ?? [],
        companion: scene?.companionPosition ?? null,
        avatar: scene?.player ? scene.avatarState : null,
        bay: key === SCENE.hangar ? (scene as HangarScene).bayState : null,
        audio: audioDebug(),
        store: { ready, screen, zone, room, overlay, stationIndex, prompt, toast: toast?.text ?? null, progress, battles, npcs, profile, pretest, posttest, sync, resumeCode, tutorOpen, story, shop, battleId, storyBeat, npcId, shopVendor },
      };
    },
  };
}
