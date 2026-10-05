// ร้านสหกรณ์แล็บและรางวัลเครดิตวิจัย (docs/GDD.md ข้อ 13)
// ตัวเลขและรายการสินค้าทั้งหมดอยู่ที่นี่ ชื่อสินค้าอยู่ใน src/content/ui-strings.ts
import type { Difficulty } from "./campaign";
import type { Armor, Chip, Weapon } from "./gear";
import type { NpcId } from "./npcs";

/** ตัวละครผู้เล่น: a = ผมสั้น, b = ผมหางม้า (ภาพ CH-01 และ CH-07 ใน docs/ART_GUIDE.md) */
export const AVATARS = ["a", "b"] as const;
export type Avatar = (typeof AVATARS)[number];

/** ชุดของผู้เล่น ชุดแรกเป็นชุดเริ่มต้นที่ทุกคนมี ชุดอื่นเป็นเครื่องแบบที่ให้สิทธิพิเศษในด่านต่อสู้ (ตัวเลขใน battle.config.ts) */
export const OUTFITS = ["lab", "hoodie", "engineer", "pilot", "researcher", "guardian", "commander", "astronaut", "paramedic", "ninja", "samurai", "hero"] as const;
export type Outfit = (typeof OUTFITS)[number];

/** สีของหุ่นการ์เดียนในฉากต่อสู้ สีแรกเป็นสีเริ่มต้น ค่าคือ CSS filter ที่ย้อมภาพหุ่นทั้งตัว (ตัวหุ่นเป็นสีขาว หมุนสีอย่างเดียวจึงแทบไม่เห็น) */
export const PAINTS = ["standard", "crimson", "violet", "gold", "azure", "shadow", "emerald", "sakura"] as const;
export type Paint = (typeof PAINTS)[number];
export const PAINT_FILTER: Record<Paint, string> = {
  standard: "none",
  crimson: "sepia(1) saturate(4.5) hue-rotate(-48deg)",
  violet: "sepia(1) saturate(3.2) hue-rotate(215deg)",
  gold: "sepia(1) saturate(3.4) hue-rotate(2deg) brightness(1.05)",
  azure: "sepia(1) saturate(3.4) hue-rotate(165deg)",
  shadow: "grayscale(1) brightness(0.55) contrast(1.25)",
  emerald: "sepia(1) saturate(3.6) hue-rotate(75deg)",
  sakura: "sepia(1) saturate(2.6) hue-rotate(-75deg) brightness(1.1)",
};

/** คอสตูมของพี่บิต (ภาพ CH-02 และ CH-21..26) เป็นของตกแต่ง ไม่มีผลในการต่อสู้ classic = รูปเดิมที่ทุกคนมี */
export const BIT_SKINS = ["classic", "ninja", "pirate", "knight", "wizard", "chef", "dragon", "gold", "explorer", "star"] as const;
export type BitSkin = (typeof BIT_SKINS)[number];

/**
 * โมดูลของพี่บิต ซื้อแล้วติดตั้งที่แท่นชาร์จพี่บิตได้ BIT_SLOTS ชิ้น โมดูลที่ติดตั้งมีผลในด่านต่อสู้ (ตัวเลขใน battle.config.ts)
 * scanner = ขอข้อมูลจากพี่บิตได้เพิ่ม, toolkit = ชุดซ่อมฉุกเฉินฟื้นพลังเพิ่ม, laser = พี่บิตยิงเสริมแรงขึ้น,
 * decoy = ตัวล่อรับการโจมตีครั้งแรกแทน, medic = ทุกครั้งที่ยิงเสริม การ์เดียนฟื้นพลัง
 */
export const BIT_MODULES = ["scanner", "toolkit", "laser", "decoy", "medic"] as const;
export type BitModule = (typeof BIT_MODULES)[number];
/** จำนวนโมดูลที่ติดตั้งให้พี่บิตได้พร้อมกัน (ติดตั้งที่แท่นชาร์จพี่บิตในโรงเก็บหุ่น ShopState.modules) */
export const BIT_SLOTS = 2;

/**
 * ของใช้ในด่านต่อสู้ ใช้แล้วหมดไป
 * repair-kit ฟื้นพลัง, shield กันการโจมตี 1 ครั้ง, overcharge การโจมตีครั้งถัดไปแรง 2 เท่า,
 * analyzer ตัดตัวเลือกที่ผิดออก 1 ข้อ, reboot ฟื้นพลังเองเมื่อพลังหมด (ทำงานอัตโนมัติ)
 */
export const SUPPLIES = ["repair-kit", "shield", "overcharge", "analyzer", "reboot"] as const;
export type Supply = (typeof SUPPLIES)[number];

/**
 * ของตกแต่งห้อง (GDD ข้อ 19): ซื้อแล้วลากวางเองในโถงและโรงเก็บหุ่นของแต่ละแมพได้ ไม่มีผลต่อการเล่น
 * size = ขนาดของช่องที่วางได้: wall = ติดผนัง (64×32), big = ตั้งพื้นชิ้นใหญ่ (64×64), small = ตั้งพื้นชิ้นเล็ก (32×64) prop = คีย์ภาพใน manifest
 */
export const DECOR = {
  window: { prop: "pr_decor_window", size: "wall" },
  screens: { prop: "pr_decor_wall_screens", size: "wall" },
  toolrack: { prop: "pr_decor_tool_rack", size: "wall" },
  neon: { prop: "pr_decor_neon", size: "wall" },
  clock: { prop: "pr_decor_clock", size: "wall" },
  banner: { prop: "pr_decor_banner", size: "wall" },
  trophy: { prop: "pr_decor_trophy_case", size: "big" },
  bookshelf: { prop: "pr_decor_bookshelf", size: "big" },
  tanks: { prop: "pr_decor_energy_tanks", size: "big" },
  aquarium: { prop: "pr_decor_aquarium", size: "big" },
  arcade: { prop: "pr_decor_arcade", size: "big" },
  sofa: { prop: "pr_decor_sofa", size: "big" },
  statue: { prop: "pr_decor_statue", size: "big" },
  fountain: { prop: "pr_decor_fountain", size: "big" },
  plant: { prop: "pr_hall_plant", size: "small" },
  lamp: { prop: "pr_decor_lamp", size: "small" },
  vending: { prop: "pr_decor_vending", size: "small" },
  cooler: { prop: "pr_decor_water_cooler", size: "small" },
  crates: { prop: "pr_decor_crates", size: "small" },
  pet: { prop: "pr_decor_robot_pet", size: "small" },
  telescope: { prop: "pr_decor_telescope", size: "small" },
  flag: { prop: "pr_decor_flag", size: "small" },
  starmap: { prop: "pr_decor_starmap", size: "wall" },
  shelf: { prop: "pr_decor_shelf", size: "wall" },
  terrarium: { prop: "pr_decor_terrarium", size: "big" },
  workbench: { prop: "pr_decor_workbench", size: "big" },
  jukebox: { prop: "pr_decor_jukebox", size: "small" },
  beanbag: { prop: "pr_decor_beanbag", size: "small" },
  globe: { prop: "pr_decor_globe", size: "small" },
} as const satisfies Record<string, { prop: string; size: DecorSize }>;
export type DecorSize = "wall" | "big" | "small";
export type Decor = keyof typeof DECOR;
export const DECORS = Object.keys(DECOR) as Decor[];
/** ของตกแต่งที่ทุกคนมีตั้งแต่เริ่ม (ไม่ต้องซื้อ) */
export const STARTER_DECOR: readonly Decor[] = ["window", "plant"];

/**
 * ธีมสีของห้อง (GDD ข้อ 19): ซื้อแล้วเลือกใช้แทนพื้นและผนังของโถงหรือโรงเก็บหุ่นของแมพใดก็ได้ที่กระดานตกแต่ง ไม่มีผลต่อการเล่น
 * tileset = คีย์ชุดไทล์ใน manifest (ภาพ TS-12..17) ห้องที่ไม่ได้เลือกธีมใช้ชุดไทล์ของแมพนั้นตามเดิม
 */
export const THEMES = {
  sakura: { tileset: "ts_theme_sakura" },
  ocean: { tileset: "ts_theme_ocean" },
  sunset: { tileset: "ts_theme_sunset" },
  royal: { tileset: "ts_theme_royal" },
  snow: { tileset: "ts_theme_snow" },
  midnight: { tileset: "ts_theme_midnight" },
  lemon: { tileset: "ts_theme_lemon" },
  crimson: { tileset: "ts_theme_crimson" },
  steel: { tileset: "ts_theme_steel" },
  gold: { tileset: "ts_theme_gold" },
} as const satisfies Record<string, { tileset: string }>;
export type Theme = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as Theme[];

/**
 * vendor = ขายเฉพาะที่ร้านพิเศษของ NPC คนนั้น (ไม่ระบุ = ร้านสหกรณ์แล็บและตู้เสื้อผ้า)
 * tier = แมพแรกที่ของชิ้นนี้วางขาย (ไม่ระบุ = แมพ 1) ผู้เล่นซื้อได้เมื่อไปถึงแมพนั้นแล้ว (GDD ข้อ 15)
 */
interface Sold {
  id: string;
  price: number;
  vendor?: NpcId;
  tier?: Difficulty;
}
export type ShopItem =
  | (Sold & { kind: "outfit"; value: Outfit })
  | (Sold & { kind: "paint"; value: Paint })
  | (Sold & { kind: "bit"; value: BitSkin })
  | (Sold & { kind: "module"; value: BitModule })
  /** อุปกรณ์ของการ์เดียน (src/state/gear.ts) ใส่ได้ช่องละหนึ่งชิ้น */
  | (Sold & { kind: "weapon"; value: Weapon })
  | (Sold & { kind: "armor"; value: Armor })
  | (Sold & { kind: "chip"; value: Chip })
  | (Sold & { kind: "decor"; value: Decor })
  | (Sold & { kind: "theme"; value: Theme })
  /** max = จำนวนที่ถือได้พร้อมกัน, stock = จำนวนที่ร้านขายต่อแมพ (ของใช้มีจำกัด ต้องเลือกว่าจะใช้กับด่านไหน) */
  | (Sold & { kind: "supply"; value: Supply; max: number; stock: number });

export const CATALOG: readonly ShopItem[] = [
  { id: "outfit-hoodie", kind: "outfit", value: "hoodie", price: 80 },
  { id: "outfit-engineer", kind: "outfit", value: "engineer", price: 100 },
  { id: "outfit-pilot", kind: "outfit", value: "pilot", price: 150 },
  { id: "outfit-researcher", kind: "outfit", value: "researcher", price: 180 },
  { id: "outfit-guardian", kind: "outfit", value: "guardian", price: 250 },
  { id: "outfit-astronaut", kind: "outfit", value: "astronaut", price: 220, tier: "normal" },
  { id: "outfit-ninja", kind: "outfit", value: "ninja", price: 260, tier: "normal" },
  { id: "outfit-paramedic", kind: "outfit", value: "paramedic", price: 240, tier: "normal" },
  { id: "outfit-commander", kind: "outfit", value: "commander", price: 300, tier: "normal" },
  { id: "outfit-samurai", kind: "outfit", value: "samurai", price: 320, tier: "hard" },
  { id: "outfit-hero", kind: "outfit", value: "hero", price: 350, tier: "hard" },
  { id: "weapon-drill", kind: "weapon", value: "drill", price: 100 },
  { id: "weapon-sword", kind: "weapon", value: "sword", price: 120 },
  { id: "weapon-blaster", kind: "weapon", value: "blaster", price: 120 },
  { id: "weapon-hammer", kind: "weapon", value: "hammer", price: 160, tier: "normal" },
  { id: "weapon-trident", kind: "weapon", value: "trident", price: 150, tier: "normal" },
  { id: "weapon-bow", kind: "weapon", value: "bow", price: 150, tier: "normal" },
  { id: "weapon-lance", kind: "weapon", value: "lance", price: 200, tier: "normal", vendor: "smith" },
  { id: "weapon-cannon", kind: "weapon", value: "cannon", price: 240, tier: "hard" },
  { id: "armor-heavy", kind: "armor", value: "heavy", price: 100 },
  { id: "armor-spike", kind: "armor", value: "spike", price: 160, tier: "normal" },
  { id: "armor-guard", kind: "armor", value: "guard", price: 140, tier: "normal" },
  { id: "armor-titan", kind: "armor", value: "titan", price: 260, tier: "hard", vendor: "keeper" },
  { id: "chip-charger", kind: "chip", value: "charger", price: 80 },
  { id: "chip-focus", kind: "chip", value: "focus", price: 110 },
  { id: "chip-retry", kind: "chip", value: "retry", price: 140, tier: "normal" },
  { id: "chip-regen", kind: "chip", value: "regen", price: 180, tier: "hard" },
  { id: "paint-crimson", kind: "paint", value: "crimson", price: 60 },
  { id: "paint-violet", kind: "paint", value: "violet", price: 60 },
  { id: "paint-gold", kind: "paint", value: "gold", price: 90 },
  { id: "paint-azure", kind: "paint", value: "azure", price: 70 },
  { id: "paint-shadow", kind: "paint", value: "shadow", price: 90, tier: "normal" },
  { id: "paint-emerald", kind: "paint", value: "emerald", price: 70, vendor: "archivist" },
  { id: "paint-sakura", kind: "paint", value: "sakura", price: 70, vendor: "vendor" },
  { id: "bit-ninja", kind: "bit", value: "ninja", price: 80 },
  { id: "bit-pirate", kind: "bit", value: "pirate", price: 90 },
  { id: "bit-knight", kind: "bit", value: "knight", price: 120 },
  { id: "bit-wizard", kind: "bit", value: "wizard", price: 120 },
  { id: "bit-chef", kind: "bit", value: "chef", price: 110, tier: "normal" },
  { id: "bit-dragon", kind: "bit", value: "dragon", price: 160, tier: "hard" },
  { id: "bit-gold", kind: "bit", value: "gold", price: 200 },
  { id: "bit-explorer", kind: "bit", value: "explorer", price: 100, vendor: "archivist" },
  { id: "bit-star", kind: "bit", value: "star", price: 100, vendor: "vendor" },
  { id: "module-scanner", kind: "module", value: "scanner", price: 120 },
  { id: "module-toolkit", kind: "module", value: "toolkit", price: 100 },
  { id: "module-laser", kind: "module", value: "laser", price: 150 },
  { id: "module-decoy", kind: "module", value: "decoy", price: 160, tier: "normal" },
  { id: "module-medic", kind: "module", value: "medic", price: 180, tier: "normal" },
  { id: "decor-screens", kind: "decor", value: "screens", price: 30 },
  { id: "decor-lamp", kind: "decor", value: "lamp", price: 30 },
  { id: "decor-cooler", kind: "decor", value: "cooler", price: 30 },
  { id: "decor-vending", kind: "decor", value: "vending", price: 40 },
  { id: "decor-bookshelf", kind: "decor", value: "bookshelf", price: 50 },
  { id: "decor-trophy", kind: "decor", value: "trophy", price: 50 },
  { id: "decor-neon", kind: "decor", value: "neon", price: 60 },
  { id: "decor-sofa", kind: "decor", value: "sofa", price: 60 },
  { id: "decor-pet", kind: "decor", value: "pet", price: 70 },
  { id: "decor-aquarium", kind: "decor", value: "aquarium", price: 80 },
  { id: "decor-beanbag", kind: "decor", value: "beanbag", price: 40 },
  { id: "decor-starmap", kind: "decor", value: "starmap", price: 50 },
  { id: "decor-jukebox", kind: "decor", value: "jukebox", price: 60 },
  { id: "decor-terrarium", kind: "decor", value: "terrarium", price: 70 },
  { id: "decor-crates", kind: "decor", value: "crates", price: 30, tier: "normal" },
  { id: "decor-toolrack", kind: "decor", value: "toolrack", price: 40, tier: "normal" },
  { id: "decor-tanks", kind: "decor", value: "tanks", price: 50, tier: "normal" },
  { id: "decor-flag", kind: "decor", value: "flag", price: 50, tier: "normal" },
  { id: "decor-clock", kind: "decor", value: "clock", price: 60, tier: "normal" },
  { id: "decor-banner", kind: "decor", value: "banner", price: 60, tier: "normal" },
  { id: "decor-telescope", kind: "decor", value: "telescope", price: 70, tier: "normal" },
  { id: "decor-arcade", kind: "decor", value: "arcade", price: 90, tier: "normal" },
  { id: "decor-shelf", kind: "decor", value: "shelf", price: 50, tier: "normal" },
  { id: "decor-globe", kind: "decor", value: "globe", price: 60, tier: "normal" },
  { id: "decor-workbench", kind: "decor", value: "workbench", price: 70, tier: "normal" },
  { id: "decor-fountain", kind: "decor", value: "fountain", price: 100, tier: "hard" },
  { id: "decor-statue", kind: "decor", value: "statue", price: 120, tier: "hard" },
  { id: "theme-sakura", kind: "theme", value: "sakura", price: 90 },
  { id: "theme-ocean", kind: "theme", value: "ocean", price: 90 },
  { id: "theme-sunset", kind: "theme", value: "sunset", price: 110 },
  { id: "theme-lemon", kind: "theme", value: "lemon", price: 90 },
  { id: "theme-crimson", kind: "theme", value: "crimson", price: 110 },
  { id: "theme-royal", kind: "theme", value: "royal", price: 130, tier: "normal" },
  { id: "theme-snow", kind: "theme", value: "snow", price: 130, tier: "normal" },
  { id: "theme-steel", kind: "theme", value: "steel", price: 110, tier: "normal" },
  { id: "theme-gold", kind: "theme", value: "gold", price: 150, tier: "normal" },
  { id: "theme-midnight", kind: "theme", value: "midnight", price: 160, tier: "hard" },
  { id: "supply-repair-kit", kind: "supply", value: "repair-kit", price: 25, max: 3, stock: 3 },
  { id: "supply-shield", kind: "supply", value: "shield", price: 20, max: 3, stock: 3 },
  { id: "supply-overcharge", kind: "supply", value: "overcharge", price: 30, max: 3, stock: 2 },
  { id: "supply-analyzer", kind: "supply", value: "analyzer", price: 30, max: 3, stock: 2 },
  { id: "supply-reboot", kind: "supply", value: "reboot", price: 60, max: 1, stock: 1 },
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
