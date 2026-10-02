// เสียงประกอบแบบชิปทูน แต่ละเสียงเป็นลำดับของโทนสั้น ๆ (ไม่มีไฟล์เสียง)

export interface Tone {
  wave: OscillatorType | "noise";
  /** ความถี่เริ่มต้น (Hz) และความถี่ปลาย ถ้าไล่เสียง */
  from: number;
  to?: number;
  /** เวลาเริ่มหลังสั่งเล่น และความยาว (วินาที) */
  at: number;
  length: number;
  gain: number;
}

const blip = (from: number, at: number, length = 0.07, gain = 0.5, wave: OscillatorType = "square", to?: number): Tone => ({ wave, from, to, at, length, gain });
/** โน้ตไล่ขึ้นหรือลงทีละตัว */
const run = (pitches: number[], gap: number, length: number, wave: OscillatorType = "square", gain = 0.45): Tone[] => pitches.map((from, i) => blip(from, i * gap, length, gain, wave));

export const SFX = {
  click: [blip(880, 0, 0.035, 0.3, "square", 660)],
  open: [blip(440, 0, 0.06, 0.35, "triangle", 660), blip(660, 0.05, 0.07, 0.3, "triangle", 880)],
  close: [blip(660, 0, 0.06, 0.3, "triangle", 440)],
  page: [blip(520, 0, 0.04, 0.3, "square")],
  toast: [blip(700, 0, 0.06, 0.35, "triangle"), blip(700, 0.09, 0.06, 0.3, "triangle")],
  door: [{ wave: "noise", from: 900, to: 300, at: 0, length: 0.22, gain: 0.3 }, blip(196, 0.02, 0.18, 0.3, "triangle", 130)],
  correct: run([659, 784, 1047], 0.07, 0.09),
  wrong: [blip(196, 0, 0.14, 0.4, "sawtooth", 147), blip(147, 0.13, 0.2, 0.4, "sawtooth", 104)],
  star: run([988, 1319], 0.06, 0.1, "triangle", 0.5),
  credit: run([1319, 1568, 2093], 0.05, 0.07, "square", 0.3),
  core: run([523, 659, 784, 1047, 1319, 1568], 0.08, 0.14, "triangle", 0.5),
  hit: [{ wave: "noise", from: 2400, to: 500, at: 0, length: 0.14, gain: 0.5 }, blip(220, 0, 0.14, 0.45, "square", 90)],
  hurt: [{ wave: "noise", from: 1200, to: 200, at: 0, length: 0.22, gain: 0.5 }, blip(150, 0, 0.24, 0.45, "sawtooth", 55)],
  assist: [blip(1400, 0, 0.16, 0.35, "square", 320), blip(1800, 0.05, 0.12, 0.25, "square", 500)],
  charge: [blip(110, 0, 0.5, 0.35, "sawtooth", 440)],
  shield: [blip(330, 0, 0.18, 0.35, "triangle", 990)],
  heal: run([523, 659, 784, 1047], 0.06, 0.1, "sine", 0.5),
  win: [...run([523, 659, 784], 0.11, 0.12), blip(1047, 0.33, 0.4, 0.5), blip(784, 0.33, 0.4, 0.3, "triangle")],
  lose: run([392, 330, 262, 196], 0.16, 0.2, "triangle", 0.45),
  buy: [...run([1319, 1568], 0.05, 0.07, "square", 0.3), blip(2093, 0.12, 0.2, 0.3, "triangle")],
} satisfies Record<string, Tone[]>;

export type SfxName = keyof typeof SFX;
