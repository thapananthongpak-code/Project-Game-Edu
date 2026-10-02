import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPAIGN, DIFFICULTIES } from "../state/campaign";
import { foeName, storyBeats, zoneBeat } from "./story";

interface ManifestAsset {
  files: Record<string, string>;
  web?: Record<string, string>;
}
const manifest = JSON.parse(readFileSync(new URL("../../public/assets/assets-manifest.json", import.meta.url), "utf8")) as { assets: ManifestAsset[] };
/** ภาพที่หน้า HTML ใช้ได้: ชื่อไฟล์ → ที่อยู่ */
const web = new Map(manifest.assets.flatMap((asset) => Object.entries({ ...asset.files, ...asset.web })));

describe("เนื้อเรื่องแบบช่องการ์ตูน (GDD 2)", () => {
  it("ทุกบรรทัดของทุกฉากมีภาพประกอบที่อยู่ใน manifest และอยู่ในโฟลเดอร์ story", () => {
    for (const [beat, lines] of Object.entries(storyBeats)) {
      expect(lines.length, beat).toBeGreaterThan(0);
      for (const line of lines) {
        expect(web.get(line.art), `${beat}: ${line.art}`).toBe(`story/${line.art}.png`);
        expect(line.text.trim().length, beat).toBeGreaterThan(0);
      }
    }
  });

  it("บทนำ 5 ช่องและบทส่งท้าย 3 ช่อง ใช้ภาพไม่ซ้ำกัน", () => {
    for (const [beat, count] of [["prologue", 5], ["ending", 3]] as const) {
      const art = storyBeats[beat].map((line) => line.art);
      expect(art).toHaveLength(count);
      expect(new Set(art).size).toBe(count);
    }
  });

  it("ทุกห้องของทุกระดับความยากมีฉากบรรยายสรุป", () => {
    for (const difficulty of DIFFICULTIES) {
      CAMPAIGN[difficulty].zones.forEach((_, i) => expect(storyBeats[zoneBeat(difficulty, i + 1)], `${difficulty} ห้อง ${i + 1}`).toBeDefined());
    }
  });

  it("คู่ต่อสู้ทุกร่างของทุกด่านมีชื่อและมีภาพ", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const battle of CAMPAIGN[difficulty].battles) {
        for (const form of battle.forms) {
          expect(foeName(form.art), `${battle.id} ${form.art}`).toMatch(/\S/);
          expect(web.get(`bt_${form.art}`), form.art).toBe(`battle/bt_${form.art}.png`);
        }
        expect(web.has(`bg_battle_${battle.backdrop}`), battle.id).toBe(true);
      }
    }
  });
});
