// เครื่องเล่นเสียงของเกม: สังเคราะห์ด้วย Web Audio ทั้งหมด (ไม่มีไฟล์เสียงให้ดาวน์โหลด)
// เบราว์เซอร์ให้เริ่มเล่นเสียงได้หลังผู้ใช้แตะหรือกดปุ่มครั้งแรกเท่านั้น จึงต้องเรียก unlockAudio จาก event นั้น
import { SFX, type SfxName, type Tone } from "./sfx";
import { midiToHz, type Track, type TrackName, trackOf } from "./tracks";

const SETTINGS_KEY = "ai-trainer-quest-settings";
const MASTER_GAIN = 0.5;
const MUSIC_GAIN = 0.16;
const SFX_GAIN = 0.4;
/** จัดคิวโน้ตล่วงหน้าเท่านี้ (วินาที) ทุก TICK_MS */
const LOOKAHEAD = 0.25;
const TICK_MS = 60;

export interface AudioSettings {
  music: boolean;
  sfx: boolean;
}

/** การตั้งค่าเสียงเป็นของเครื่อง ไม่อยู่ในความคืบหน้าของผู้เล่น และไม่ส่งขึ้นฐานข้อมูลกลาง */
function loadSettings(): AudioSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AudioSettings>;
    return { music: saved.music !== false, sfx: saved.sfx !== false };
  } catch {
    return { music: true, sfx: true };
  }
}

let settings: AudioSettings = typeof window === "undefined" ? { music: true, sfx: true } : loadSettings();
const listeners = new Set<() => void>();

let context: AudioContext | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noise: AudioBuffer | null = null;

let wanted: { name: TrackName; variant: number } | null = null;
let playing: { key: string; track: Track; nextStep: number; nextTime: number } | null = null;
let timer: number | null = null;
let sfxCount = 0;

function ensureContext(): AudioContext | null {
  // Safari ปิด context ได้ (closed) เมื่อระบบเสียงเปลี่ยน: สร้างใหม่
  if (context && context.state !== "closed") return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  playing = null;
  // กลับมาเล่นได้เมื่อไร (เช่น Safari หายจากสถานะ interrupted) ให้เพลงเริ่มต่อทันที
  context.addEventListener("statechange", () => {
    if (context?.state === "running") syncMusic();
  });
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);
  // ตัดเสียงแหลมของคลื่นสี่เหลี่ยมให้นุ่มลง
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  filter.connect(master);
  musicBus = context.createGain();
  musicBus.gain.value = settings.music ? MUSIC_GAIN : 0;
  musicBus.connect(filter);
  sfxBus = context.createGain();
  sfxBus.gain.value = SFX_GAIN;
  sfxBus.connect(master);
  noise = context.createBuffer(1, context.sampleRate / 2, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return context;
}

/** เล่นโทนหนึ่งตัวที่เวลา at (เวลาของ AudioContext) */
function playTone(ctx: AudioContext, bus: GainNode, tone: Tone, at: number): void {
  const gain = ctx.createGain();
  const end = at + tone.length;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(tone.gain, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(bus);
  if (tone.wave === "noise") {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(tone.from, at);
    if (tone.to) filter.frequency.exponentialRampToValueAtTime(tone.to, end);
    source.connect(filter).connect(gain);
    source.start(at);
    source.stop(end + 0.02);
  } else {
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.from, at);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
    osc.connect(gain);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

const DRUMS: Tone[] = [
  { wave: "sine", from: 150, to: 45, at: 0, length: 0.14, gain: 1 },
  { wave: "noise", from: 1800, to: 900, at: 0, length: 0.1, gain: 0.6 },
  { wave: "noise", from: 7000, at: 0, length: 0.03, gain: 0.35 },
];

function schedule(): void {
  const ctx = context;
  if (!ctx || !musicBus || !playing || ctx.state !== "running") return;
  const { track } = playing;
  const stepTime = 60 / track.bpm / 4;
  // แท็บถูกพักไว้นาน: ข้ามไปเวลาปัจจุบัน ไม่เล่นโน้ตที่ค้างรวดเดียว
  if (playing.nextTime < ctx.currentTime - 0.1) playing.nextTime = ctx.currentTime + 0.05;
  while (playing.nextTime < ctx.currentTime + LOOKAHEAD) {
    const step = playing.nextStep;
    for (const channel of track.channels) {
      if (channel.gain <= 0) continue;
      for (const note of channel.notes) {
        if (note.step !== step) continue;
        if (channel.wave === "drums") playTone(ctx, musicBus, { ...DRUMS[note.pitch], gain: DRUMS[note.pitch].gain * channel.gain }, playing.nextTime);
        else playTone(ctx, musicBus, { wave: channel.wave, from: midiToHz(note.pitch), at: 0, length: note.length * stepTime * 0.95, gain: channel.gain }, playing.nextTime);
      }
    }
    playing.nextStep = (step + 1) % track.steps;
    playing.nextTime += stepTime;
  }
}

function syncMusic(): void {
  const ctx = context;
  const key = wanted && settings.music ? `${wanted.name}:${wanted.variant}` : null;
  if (!ctx || ctx.state !== "running" || !key || !wanted) {
    playing = null;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    return;
  }
  if (playing?.key !== key) playing = { key, track: trackOf(wanted.name, wanted.variant), nextStep: 0, nextTime: ctx.currentTime + 0.08 };
  timer ??= window.setInterval(schedule, TICK_MS);
  schedule();
}

/** เรียกจาก event ของผู้ใช้ (แตะ คลิก กดปุ่ม) เพื่อให้เบราว์เซอร์ยอมเล่นเสียง
 * ทุกสถานะที่ไม่ใช่ running (suspended หรือ interrupted ของ Safari หลังเครื่องพักหรือมีเสียงจากแท็บอื่น) ลองเล่นต่อ ถ้าไม่สำเร็จลองใหม่ในการกดครั้งถัดไป */
export function unlockAudio(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state !== "running" && document.visibilityState === "visible") void ctx.resume().then(syncMusic, () => undefined);
  else syncMusic();
}

/** เลือกเพลงประกอบ null = เงียบ เพลงเดิมที่เล่นอยู่ไม่เริ่มใหม่ */
export function setMusic(name: TrackName | null, variant = 0): void {
  wanted = name ? { name, variant } : null;
  syncMusic();
}

export function playSfx(name: SfxName): void {
  if (!settings.sfx || !context || !sfxBus || context.state !== "running") return;
  sfxCount++;
  for (const tone of SFX[name]) playTone(context, sfxBus, tone, context.currentTime + tone.at);
}

export const getAudioSettings = (): AudioSettings => settings;

export function setAudioSettings(next: Partial<AudioSettings>): void {
  settings = { ...settings, ...next };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // เก็บการตั้งค่าไม่ได้ (โหมดส่วนตัว): ใช้ได้จนปิดหน้า
  }
  if (musicBus && context) musicBus.gain.setTargetAtTime(settings.music ? MUSIC_GAIN : 0, context.currentTime, 0.05);
  syncMusic();
  for (const listener of listeners) listener();
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** พักเสียงเมื่อแท็บถูกซ่อน และเล่นต่อเมื่อกลับมา */
export function installAudioLifecycle(): () => void {
  const unlock = () => unlockAudio();
  const visibility = () => {
    if (!context) return;
    if (document.visibilityState === "hidden") void context.suspend().catch(() => undefined);
    else void context.resume().then(syncMusic, () => undefined);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    document.removeEventListener("visibilitychange", visibility);
  };
}

/** สถานะสำหรับการทดสอบอัตโนมัติ */
export const audioDebug = () => ({ state: context?.state ?? "none", wanted: wanted ? `${wanted.name}:${wanted.variant}` : null, playing: playing?.key ?? null, settings, sfxCount });
