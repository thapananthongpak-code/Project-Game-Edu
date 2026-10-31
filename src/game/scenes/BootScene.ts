import * as Phaser from "phaser";
import { useGameStore } from "../../state/gameStore";
import { type Direction, SCENE } from "../constants";

interface AssetManifest {
  assets: {
    id: string;
    /** ภาพที่ฉากเกมโหลด (ภาพที่หน้า HTML ใช้อย่างเดียวอยู่ใน web และไม่โหลดที่นี่) */
    files: Record<string, string>;
    /** ชุดไทล์ Wang: frame ของแต่ละรูปแบบมุม (NW NE SW SE, 1 = ผนัง) */
    wang?: { tileSize: number; frames: Record<string, number> };
    /** แผ่นสไปรต์ตัวละคร: แถว = ทิศ, คอลัมน์ 0 = ยืน, คอลัมน์ 1..walkFrames = เดิน */
    sheet?: CharacterSheet;
  }[];
}

export interface CharacterSheet {
  frameWidth: number;
  frameHeight: number;
  directions: Direction[];
  walkFrames: number;
}

/** คีย์ใน registry ของตารางไทล์ Wang ของชุดไทล์นั้น */
export const wangKey = (tileset: string): string => `wang:${tileset}`;
/** คีย์ใน registry ของโครงแผ่นสไปรต์ของตัวละครนั้น */
export const sheetKey = (texture: string): string => `sheet:${texture}`;

/** โฟลเดอร์ของภาพที่โหลดตามหลัง (หลังเปิดฉากแรกแล้ว) */
const DEFERRED_DIR = "guardian/";

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
    // ภาพหุ่นการ์เดียนทุกแบบ (ใช้ที่แท่นในโรงเก็บหุ่นเท่านั้น ราว 140 ไฟล์) โหลดตามหลังหลังเกมเปิดแล้ว ให้เครื่องและเน็ตช้าเข้าเกมได้เร็วขึ้น
    const later = (path: string) => path.startsWith(DEFERRED_DIR);
    this.queue(manifest, (path) => !later(path));
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      useGameStore.getState().setReady();
      // ฉากนี้ยังทำงานต่อเพื่อโหลดภาพที่เหลือ (ฉากอื่นถูกสลับด้วย PhaserGame.tsx ซึ่งไม่หยุดฉากนี้)
      this.scene.launch(SCENE.hall);
      this.queue(manifest, later);
      this.load.start();
    });
    this.load.start();
  }

  /** ใส่ภาพตาม manifest ที่ผ่านตัวกรองลงคิวโหลด */
  private queue(manifest: AssetManifest, wanted: (path: string) => boolean): void {
    for (const asset of manifest.assets) {
      for (const [key, path] of Object.entries(asset.files)) {
        if (!wanted(path)) continue;
        if (asset.wang) {
          this.load.spritesheet(key, `assets/${path}`, { frameWidth: asset.wang.tileSize, frameHeight: asset.wang.tileSize });
          this.registry.set(wangKey(key), asset.wang.frames);
        } else if (asset.sheet) {
          this.load.spritesheet(key, `assets/${path}`, { frameWidth: asset.sheet.frameWidth, frameHeight: asset.sheet.frameHeight });
          this.registry.set(sheetKey(key), asset.sheet);
        } else {
          this.load.image(key, `assets/${path}`);
        }
      }
    }
  }
}
