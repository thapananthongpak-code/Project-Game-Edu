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
  // เอฟเฟกต์ของด่านต่อสู้: กระสุนพลังงาน กรงเล็บ ลูกไฟ ระเบิด เกราะแตก และบอสกลายร่าง
  laser: [blip(1700, 0, 0.16, 0.4, "square", 420), blip(2100, 0.02, 0.1, 0.2, "sawtooth", 700)],
  slash: [{ wave: "noise", from: 5200, to: 900, at: 0, length: 0.12, gain: 0.5 }, { wave: "noise", from: 4200, to: 700, at: 0.07, length: 0.12, gain: 0.4 }],
  fire: [{ wave: "noise", from: 500, to: 1800, at: 0, length: 0.3, gain: 0.45 }, blip(120, 0, 0.3, 0.35, "sawtooth", 260)],
  boom: [{ wave: "noise", from: 900, to: 90, at: 0, length: 0.4, gain: 0.6 }, blip(110, 0, 0.36, 0.5, "sine", 38)],
  crack: [{ wave: "noise", from: 6000, to: 1500, at: 0, length: 0.09, gain: 0.5 }, blip(1250, 0.03, 0.08, 0.3, "square", 500), blip(820, 0.1, 0.1, 0.25, "square", 300)],
  transform: [blip(90, 0, 0.7, 0.4, "sawtooth", 900), { wave: "noise", from: 300, to: 4000, at: 0.1, length: 0.6, gain: 0.35 }, blip(1320, 0.7, 0.2, 0.4, "square", 1760)],
  // ท่าโจมตีตามอาวุธและสกิลของไคจู: หมัด ลำแสง เขี้ยวงับ คริติคอล สตัน และชิปคิดทบทวน
  punch: [{ wave: "noise", from: 1600, to: 200, at: 0, length: 0.12, gain: 0.55 }, blip(180, 0, 0.12, 0.5, "square", 70)],
  beam: [blip(300, 0, 0.42, 0.35, "sawtooth", 1500), blip(2200, 0.03, 0.38, 0.2, "square", 1100), { wave: "noise", from: 3000, to: 6000, at: 0.05, length: 0.36, gain: 0.25 }],
  bite: [{ wave: "noise", from: 3000, to: 600, at: 0, length: 0.07, gain: 0.5 }, blip(240, 0.05, 0.08, 0.45, "square", 110)],
  crit: [blip(1568, 0, 0.06, 0.4, "square"), blip(2093, 0.05, 0.06, 0.4, "square"), blip(2637, 0.1, 0.16, 0.4, "square", 3136)],
  stun: [blip(1319, 0, 0.07, 0.3, "triangle", 988), blip(1175, 0.08, 0.07, 0.3, "triangle", 880), blip(1047, 0.16, 0.12, 0.3, "triangle", 784)],
  retry: [blip(523, 0, 0.08, 0.35, "triangle", 784), blip(784, 0.09, 0.14, 0.35, "triangle", 1047)],
  equip: [blip(330, 0, 0.05, 0.35, "square"), blip(494, 0.05, 0.05, 0.35, "square"), { wave: "noise", from: 2500, to: 900, at: 0.09, length: 0.06, gain: 0.3 }],
  // กิจกรรมเสริมกับ NPC
  npc: [blip(620, 0, 0.06, 0.3, "triangle"), blip(830, 0.07, 0.08, 0.3, "triangle")],
  pickup: run([1047, 1568], 0.05, 0.08, "square", 0.35),
  quest: [...run([523, 659, 784, 1047], 0.09, 0.11, "triangle", 0.45), blip(1319, 0.38, 0.35, 0.45, "square")],
} satisfies Record<string, Tone[]>;

export type SfxName = keyof typeof SFX;
