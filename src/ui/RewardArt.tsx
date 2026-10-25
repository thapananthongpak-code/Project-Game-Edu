import { BIT_SKINS, type BitSkin, type Paint, PAINTS } from "../state/shop.config";
import { art } from "./art";
import { GuardianModel } from "./GuardianModel";

/** หุ่นตัวอย่างที่ใช้โชว์สีรางวัล: เกราะมาตรฐานถือดาบ (เห็นว่าสีย้อมเฉพาะตัวหุ่น อาวุธไม่เปลี่ยนสี) */
const SAMPLE = { weapon: "sword", armor: "plate", chip: "none" } as const;

/**
 * รูปของรางวัลของเลเวล (GDD ข้อ 27): สีหุ่น = หุ่นการ์เดียนที่ทาสีนั้นจริง คอสตูมพี่บิต = ภาพพี่บิตในชุดนั้น
 * ใช้ในโปรไฟล์และหน้าต่างเลเวลอัป รหัสที่ไม่รู้จักไม่แสดงรูป
 */
export function RewardArt({ id, className = "h-16 w-16" }: { id: string; className?: string }) {
  const [kind, value] = id.split("-");
  if (kind === "paint" && PAINTS.some((paint) => paint === value)) {
    return <GuardianModel gear={SAMPLE} paint={value as Paint} className={`${className} shrink-0`} />;
  }
  if (kind === "bit" && BIT_SKINS.some((skin) => skin === value)) {
    return <img src={art.bit(value as BitSkin)} alt="" className={`pixelated shrink-0 object-contain ${className}`} data-testid="reward-art-bit" />;
  }
  return null;
}
