import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARMORS, WEAPONS } from "../state/gear";
import { art } from "./art";

const manifest = JSON.parse(readFileSync(new URL("../../public/assets/assets-manifest.json", import.meta.url), "utf8")) as { assets: { id: string; files: Record<string, string> }[] };
const loaded = new Set(manifest.assets.flatMap((asset) => Object.keys(asset.files)));
const onDisk = (url: string) => existsSync(new URL(`../../public/${url}`, import.meta.url));

describe("ชั้นภาพของหุ่นการ์เดียน (GDD 17: สีหุ่นย้อมเฉพาะตัวหุ่น)", () => {
  it("ทุกคู่เกราะ × อาวุธมีชั้นตัวหุ่นและชั้นอุปกรณ์ ทั้งในแมนิเฟสต์ที่ฉากเกมโหลดและในไฟล์ภาพ", () => {
    for (const armor of ARMORS) {
      for (const weapon of WEAPONS) {
        for (const [part, url] of [["body", art.guardianBody(armor, weapon)], ["items", art.guardianItems(armor, weapon)]] as const) {
          expect(loaded.has(`gd_${armor}_${weapon}_${part}`), `${armor} ${weapon} ${part} ในแมนิเฟสต์`).toBe(true);
          expect(onDisk(url), url).toBe(true);
        }
      }
    }
  });
});
