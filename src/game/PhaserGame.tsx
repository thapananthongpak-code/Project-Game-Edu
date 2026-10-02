import * as Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useGameStore } from "../state/gameStore";
import { resetTouchInput } from "../state/input";
import { BASE_HEIGHT, BASE_WIDTH, SCENE } from "./constants";
import { installDebugHook } from "./debug";
import { BootScene } from "./scenes/BootScene";
import { HallScene } from "./scenes/HallScene";
import { HangarScene } from "./scenes/HangarScene";
import { RoomScene } from "./scenes/RoomScene";

/** ตัวเกม Phaser: สร้างครั้งเดียว แล้วสลับฉากตาม screen ใน store */
export function PhaserGame() {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current as HTMLDivElement,
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
      backgroundColor: "#1a1c2c",
      pixelArt: true,
      banner: false,
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [BootScene, HallScene, HangarScene, RoomScene],
    });
    if (import.meta.env.DEV) installDebugHook(game);

    // เมื่อหมุนจอ Phaser ปรับขนาด canvas จากขนาดกรอบก่อนหมุน (ช้าไปหนึ่งจังหวะ)
    // จึงสั่งปรับใหม่ทุกครั้งที่กรอบเกมเปลี่ยนขนาดจริง โดยวัดกรอบก่อนเพราะ refresh ใช้ค่าที่วัดไว้ล่าสุด
    const resizeObserver = new ResizeObserver(() => {
      if (!game.isBooted) return;
      game.scale.getParentBounds();
      game.scale.refresh();
    });
    resizeObserver.observe(parent.current as HTMLDivElement);

    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (!state.ready || (state.screen === previous.screen && state.zone === previous.zone)) return;
      resetTouchInput();
      // สลับฉากหลังจบเฟรมปัจจุบัน: การเปลี่ยนหน้าจออาจถูกสั่งจากใน update ของฉาก (เช่น กดประตู)
      // ถ้าหยุดฉากทันที วัตถุของฉากจะถูกทำลายขณะที่ update ยังทำงานไม่จบ
      queueMicrotask(() => {
        const start = (key: string, data?: object) => {
          for (const other of [SCENE.hall, SCENE.hangar, SCENE.room]) if (other !== key) game.scene.stop(other);
          game.scene.start(key, data);
        };
        if (state.screen === "room" && state.zone !== null) start(SCENE.room, { zone: state.zone });
        else if (state.screen === "hangar") start(SCENE.hangar);
        // กลับเมนูจากห้องหรือโรงเก็บหุ่น: ใช้โถงเป็นฉากหลังของเมนู
        else if (state.screen === "hall" || previous.screen === "room" || previous.screen === "hangar") start(SCENE.hall, { fromRoom: previous.zone ?? 1, fromHangar: previous.screen === "hangar" });
      });
    });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      game.destroy(true);
    };
  }, []);

  return <div id="game-root" ref={parent} className="absolute inset-0" />;
}
