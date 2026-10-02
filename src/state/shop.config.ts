// ร้านสหกรณ์แล็บและรางวัลเครดิตวิจัย (docs/GDD.md ข้อ 13)
// ไฟล์นี้ไม่ import อะไร ตัวเลขและรายการสินค้าทั้งหมดอยู่ที่นี่ ชื่อสินค้าอยู่ใน src/content/ui-strings.ts

/** ตัวละครผู้เล่น: a = ผมสั้น, b = ผมหางม้า (ภาพ CH-01 และ CH-07 ใน docs/ART_GUIDE.md) */
export const AVATARS = ["a", "b"] as const;
export type Avatar = (typeof AVATARS)[number];

/** ชุดของผู้เล่น ชุดแรกเป็นชุดเริ่มต้นที่ทุกคนมี ชุดอื่นเป็นเครื่องแบบที่ให้สิทธิพิเศษในด่านต่อสู้ (ตัวเลขใน battle.config.ts) */
export const OUTFITS = ["lab", "engineer", "pilot", "researcher", "guardian", "commander"] as const;
export type Outfit = (typeof OUTFITS)[number];

/** สีของหุ่นการ์เดียนในฉากต่อสู้ สีแรกเป็นสีเริ่มต้น ค่าคือ CSS filter ที่ย้อมภาพหุ่นทั้งตัว (ตัวหุ่นเป็นสีขาว หมุนสีอย่างเดียวจึงแทบไม่เห็น) */
export const PAINTS = ["standard", "crimson", "violet", "gold"] as const;
export type Paint = (typeof PAINTS)[number];
export const PAINT_FILTER: Record<Paint, string> = {
  standard: "none",
  crimson: "sepia(1) saturate(4.5) hue-rotate(-48deg)",
  violet: "sepia(1) saturate(3.2) hue-rotate(215deg)",
  gold: "sepia(1) saturate(3.4) hue-rotate(2deg) brightness(1.05)",
};

/**
 * ของใช้ในด่านต่อสู้ ใช้แล้วหมดไป
 * repair-kit ฟื้นพลัง, shield กันการโจมตี 1 ครั้ง, overcharge การโจมตีครั้งถัดไปแรง 2 เท่า,
 * analyzer ตัดตัวเลือกที่ผิดออก 1 ข้อ, reboot ฟื้นพลังเองเมื่อพลังหมด (ทำงานอัตโนมัติ)
 */
export const SUPPLIES = ["repair-kit", "shield", "overcharge", "analyzer", "reboot"] as const;
export type Supply = (typeof SUPPLIES)[number];

export type ShopItem =
  | { id: string; kind: "outfit"; value: Outfit; price: number }
  | { id: string; kind: "paint"; value: Paint; price: number }
  | { id: string; kind: "supply"; value: Supply; price: number; max: number };

export const CATALOG: readonly ShopItem[] = [
  { id: "outfit-engineer", kind: "outfit", value: "engineer", price: 100 },
  { id: "outfit-pilot", kind: "outfit", value: "pilot", price: 150 },
  { id: "outfit-researcher", kind: "outfit", value: "researcher", price: 180 },
  { id: "outfit-guardian", kind: "outfit", value: "guardian", price: 250 },
  { id: "outfit-commander", kind: "outfit", value: "commander", price: 300 },
  { id: "paint-crimson", kind: "paint", value: "crimson", price: 60 },
  { id: "paint-violet", kind: "paint", value: "violet", price: 60 },
  { id: "paint-gold", kind: "paint", value: "gold", price: 90 },
  { id: "supply-repair-kit", kind: "supply", value: "repair-kit", price: 25, max: 3 },
  { id: "supply-shield", kind: "supply", value: "shield", price: 20, max: 3 },
  { id: "supply-overcharge", kind: "supply", value: "overcharge", price: 30, max: 3 },
  { id: "supply-analyzer", kind: "supply", value: "analyzer", price: 30, max: 3 },
  { id: "supply-reboot", kind: "supply", value: "reboot", price: 60, max: 1 },
];

/** เครดิตวิจัยที่ได้จากความคืบหน้าแต่ละอย่าง */
export const REWARDS = {
  /** ต่อสถานีที่ฟังจบ */
  station: 5,
  /** ต่อดาวของมินิเกม (ดาวที่ดีที่สุดของห้อง) */
  star: 10,
  review: 10,
  core: 20,
  /** ชนะด่านต่อสู้ครั้งแรก (ไคจูประจำห้อง / บอสของระดับ) */
  battle: 30,
  boss: 60,
  /** ชนะโดยไม่ต้องถอยกลับมาซ่อม */
  firstSortie: 10,
  /** ซ้อมรบชนะซ้ำกับด่านที่ชนะแล้ว ต่อครั้ง (นับไม่เกิน BATTLE.replayRewards ครั้งต่อด่าน) */
  replay: 5,
  /** ทำภารกิจภาคสนามครบ */
  field: 30,
  posttest: 20,
} as const;
