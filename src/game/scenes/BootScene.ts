import * as Phaser from "phaser";
import { useGameStore } from "../../state/gameStore";
import { SCENE } from "../constants";

interface AssetManifest {
  assets: {
    id: string;
    files: Record<string, string>;
    /** ชุดไทล์ Wang: frame ของแต่ละรูปแบบมุม (NW NE SW SE, 1 = ผนัง) */
    wang?: { tileSize: number; frames: Record<string, number> };
  }[];
}

/** คีย์ใน registry ของตารางไทล์ Wang ของชุดไทล์นั้น */
export const wangKey = (tileset: string): string => `wang:${tileset}`;

/** โหลดภาพทั้งหมดตาม public/assets/assets-manifest.json แล้วเปิดโถงทางเดินเป็นฉากหลังของเมนู */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.boot);
  }

  preload(): void {
    this.load.json("manifest", "assets/assets-manifest.json");
  }

  create(): void {
    const manifest = this.cache.json.get("manifest") as AssetManifest;
    for (const asset of manifest.assets) {
      for (const [key, path] of Object.entries(asset.files)) {
        if (asset.wang) {
          this.load.spritesheet(key, `assets/${path}`, { frameWidth: asset.wang.tileSize, frameHeight: asset.wang.tileSize });
          this.registry.set(wangKey(key), asset.wang.frames);
        } else {
          this.load.image(key, `assets/${path}`);
        }
      }
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      useGameStore.getState().setReady();
      this.scene.start(SCENE.hall);
    });
    this.load.start();
  }
}
