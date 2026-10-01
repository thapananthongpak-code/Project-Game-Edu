import type * as Phaser from "phaser";
import { useGameStore } from "../state/gameStore";
import { SCENE } from "./constants";
import type { WorldScene } from "./scenes/WorldScene";

/** ข้อมูลอ่านอย่างเดียวสำหรับการทดสอบอัตโนมัติ (เปิดเฉพาะตอน dev): ตำแหน่งผู้เล่นและจุดโต้ตอบ */
export function installDebugHook(game: Phaser.Game): void {
  (window as unknown as { __aitq: unknown }).__aitq = {
    snapshot: () => {
      const key = [SCENE.room, SCENE.hall].find((k) => game.scene.isActive(k));
      const scene = key ? (game.scene.getScene(key) as WorldScene) : null;
      const { ready, screen, room, overlay, stationIndex, prompt, toast, progress, profile, pretest, posttest, sync, resumeCode, tutorOpen } = useGameStore.getState();
      return {
        scene: key ?? null,
        player: scene?.player ? { x: scene.player.x, y: scene.player.y } : null,
        interactables: scene?.interactables.map(({ id, x, y }) => ({ id, x, y })) ?? [],
        store: { ready, screen, room, overlay, stationIndex, prompt, toast: toast?.text ?? null, progress, profile, pretest, posttest, sync, resumeCode, tutorOpen },
      };
    },
  };
}
