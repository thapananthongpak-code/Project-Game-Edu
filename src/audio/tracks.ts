// เพลงประกอบแบบชิปทูน สร้างจากทางคอร์ดและแพตเทิร์นจังหวะ (ไม่มีไฟล์เสียง) เป็นข้อมูลล้วน ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
// เวลาแบ่งเป็นสเต็ป (โน้ตตัวเขบ็ตสองชั้น) 16 สเต็ปต่อห้อง โน้ตเป็นเลข MIDI

export type TrackName = "lab" | "study" | "story" | "battle" | "boss" | "victory";

export interface Note {
  step: number;
  /** เลข MIDI (ช่องกลองใช้เป็นชนิดเสียง: 0 = กระเดื่อง, 1 = สแนร์, 2 = ไฮแฮต) */
  pitch: number;
  /** ความยาวเป็นสเต็ป */
  length: number;
}

export interface Channel {
  wave: OscillatorType | "drums";
  gain: number;
  notes: Note[];
}

export interface Track {
  bpm: number;
  /** จำนวนสเต็ปทั้งหมดของวนหนึ่งรอบ */
  steps: number;
  channels: Channel[];
}

type Chord = [root: number, kind: "maj" | "min"];
const TONES = { maj: [0, 4, 7], min: [0, 3, 7] } as const;
const BAR = 16;

interface Recipe {
  bpm: number;
  chords: Chord[];
  /** สเต็ปในห้องที่เบสเล่น และโน้ตของคอร์ดที่ใช้ (0 = ราก, 2 = คู่ห้า) */
  bass: [step: number, tone: number][];
  /** ระยะห่างของอาร์เปจโจเป็นสเต็ป (0 = ไม่มี) */
  arpEvery: number;
  /** ทำนอง: สเต็ปในห้อง และโน้ตของคอร์ด (นับต่อขึ้นอ็อกเทฟถัดไปได้ เช่น 3 = รากสูงขึ้นหนึ่งอ็อกเทฟ) */
  motif: [step: number, tone: number, length: number][];
  /** ทำนองของห้องคู่ ถ้าต่างจากห้องคี่ */
  motifAlt?: [step: number, tone: number, length: number][];
  drums: [step: number, kind: number][];
  gains: { bass: number; arp: number; lead: number; drums: number };
  lead: OscillatorType;
}

/** เลข MIDI ของ C ที่แต่ละช่องเริ่มนับ: เบส C2, อาร์เปจโจ C3, ทำนอง C4 */
const BASE = { bass: 36, arp: 48, lead: 60 } as const;

const toneOf = (chord: Chord, index: number, base: number): number => {
  const tones = TONES[chord[1]];
  return base + chord[0] + 12 * Math.floor(index / tones.length) + tones[index % tones.length];
};

/** สร้างเพลงจากสูตร ย้ายคีย์ได้ด้วย transpose (ครึ่งเสียง) */
export function buildTrack(recipe: Recipe, transpose = 0): Track {
  const bass: Note[] = [];
  const arp: Note[] = [];
  const lead: Note[] = [];
  const drums: Note[] = [];
  recipe.chords.forEach((chord, bar) => {
    const shifted: Chord = [chord[0] + transpose, chord[1]];
    const at = bar * BAR;
    for (const [step, tone] of recipe.bass) bass.push({ step: at + step, pitch: toneOf(shifted, tone, BASE.bass), length: 3 });
    if (recipe.arpEvery > 0) {
      for (let step = 0, i = 0; step < BAR; step += recipe.arpEvery, i++) arp.push({ step: at + step, pitch: toneOf(shifted, [0, 1, 2, 1][i % 4], BASE.arp), length: recipe.arpEvery });
    }
    const motif = bar % 2 === 1 && recipe.motifAlt ? recipe.motifAlt : recipe.motif;
    for (const [step, tone, length] of motif) lead.push({ step: at + step, pitch: toneOf(shifted, tone, BASE.lead), length });
    for (const [step, kind] of recipe.drums) drums.push({ step: at + step, pitch: kind, length: 1 });
  });
  return {
    bpm: recipe.bpm,
    steps: recipe.chords.length * BAR,
    channels: [
      { wave: "triangle", gain: recipe.gains.bass, notes: bass },
      { wave: "square", gain: recipe.gains.arp, notes: arp },
      { wave: recipe.lead, gain: recipe.gains.lead, notes: lead },
      { wave: "drums", gain: recipe.gains.drums, notes: drums },
    ],
  };
}

// รากของคอร์ดเป็นจำนวนครึ่งเสียงเหนือ C (C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, Bb = 10)
const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, Bb = 10;

const RECIPES: Record<TrackName, Recipe> = {
  // โถง เมนู โรงเก็บหุ่น: สดใส สบาย ๆ
  lab: {
    bpm: 104,
    chords: [[C, "maj"], [A, "min"], [F, "maj"], [G, "maj"]],
    bass: [[0, 0], [6, 0], [8, 2], [14, 0]],
    arpEvery: 2,
    motif: [[0, 2, 3], [4, 3, 2], [6, 4, 2], [8, 3, 4], [12, 2, 2]],
    motifAlt: [[0, 4, 3], [4, 3, 2], [6, 2, 2], [8, 1, 6]],
    drums: [[0, 0], [4, 2], [8, 1], [10, 2], [12, 2]],
    gains: { bass: 0.5, arp: 0.14, lead: 0.2, drums: 0.3 },
    lead: "square",
  },
  // ห้องเรียน: ช้า เบา ไม่รบกวนการอ่าน
  study: {
    bpm: 80,
    chords: [[F, "maj"], [G, "maj"], [E, "min"], [A, "min"]],
    bass: [[0, 0], [8, 2]],
    arpEvery: 4,
    motif: [[2, 2, 4], [8, 3, 6]],
    motifAlt: [[2, 1, 4], [8, 2, 6]],
    drums: [[4, 2], [12, 2]],
    gains: { bass: 0.4, arp: 0.12, lead: 0.12, drums: 0.12 },
    lead: "triangle",
  },
  // ฉากเนื้อเรื่อง: ช้า เคร่งขรึม
  story: {
    bpm: 66,
    chords: [[A, "min"], [F, "maj"], [C, "maj"], [E, "min"]],
    bass: [[0, 0]],
    arpEvery: 4,
    motif: [[4, 2, 8]],
    motifAlt: [[4, 3, 8]],
    drums: [],
    gains: { bass: 0.45, arp: 0.1, lead: 0.14, drums: 0 },
    lead: "sine",
  },
  // ด่านต่อสู้: เร็ว หนักแน่น
  battle: {
    bpm: 138,
    chords: [[A, "min"], [A, "min"], [F, "maj"], [G, "maj"]],
    bass: [[0, 0], [3, 0], [6, 0], [8, 0], [11, 2], [14, 0]],
    arpEvery: 1,
    motif: [[0, 3, 2], [3, 2, 2], [6, 3, 2], [8, 4, 3], [12, 3, 2], [14, 2, 2]],
    motifAlt: [[0, 4, 2], [3, 3, 2], [6, 2, 2], [8, 3, 6]],
    drums: [[0, 0], [2, 2], [4, 1], [6, 2], [8, 0], [10, 0], [12, 1], [14, 2]],
    gains: { bass: 0.55, arp: 0.09, lead: 0.2, drums: 0.4 },
    lead: "square",
  },
  // ด่านสุดท้าย: เร็วกว่า คีย์ต่ำ
  boss: {
    bpm: 150,
    chords: [[D, "min"], [Bb, "maj"], [C, "maj"], [A, "maj"]],
    bass: [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0], [12, 2], [14, 2]],
    arpEvery: 1,
    motif: [[0, 3, 3], [4, 4, 2], [6, 3, 2], [8, 5, 4], [12, 4, 2], [14, 3, 2]],
    motifAlt: [[0, 5, 2], [2, 4, 2], [4, 3, 4], [8, 4, 2], [10, 3, 2], [12, 2, 4]],
    drums: [[0, 0], [2, 2], [4, 1], [6, 0], [8, 0], [10, 2], [12, 1], [13, 1], [14, 2]],
    gains: { bass: 0.6, arp: 0.09, lead: 0.2, drums: 0.42 },
    lead: "sawtooth",
  },
  // ใบประกาศและบทส่งท้าย: สว่าง ภูมิใจ
  victory: {
    bpm: 112,
    chords: [[C, "maj"], [G, "maj"], [A, "min"], [F, "maj"]],
    bass: [[0, 0], [8, 2], [12, 0]],
    arpEvery: 2,
    motif: [[0, 3, 2], [2, 4, 2], [4, 5, 4], [8, 4, 2], [10, 3, 2], [12, 4, 4]],
    motifAlt: [[0, 5, 4], [4, 4, 4], [8, 3, 8]],
    drums: [[0, 0], [4, 2], [8, 1], [12, 2], [14, 2]],
    gains: { bass: 0.5, arp: 0.14, lead: 0.2, drums: 0.3 },
    lead: "square",
  },
};

/** คีย์ของเพลงห้องเรียนแต่ละห้อง ให้แต่ละห้องฟังต่างกัน */
const STUDY_TRANSPOSE = [0, 2, -2, 4, -1, 3];

/** เพลงตามชื่อ variant = เลขห้อง (ใช้กับเพลงห้องเรียน) */
export function trackOf(name: TrackName, variant = 0): Track {
  return buildTrack(RECIPES[name], name === "study" ? STUDY_TRANSPOSE[(Math.max(1, variant) - 1) % STUDY_TRANSPOSE.length] : 0);
}

export const TRACK_NAMES = Object.keys(RECIPES) as TrackName[];

/** ความถี่ (Hz) ของเลข MIDI */
export const midiToHz = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);
