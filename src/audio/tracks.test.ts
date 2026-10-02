import { describe, expect, it } from "vitest";
import { SFX } from "./sfx";
import { bossVariant, midiToHz, TRACK_NAMES, trackOf } from "./tracks";

describe("เพลงประกอบ", () => {
  it("ทุกเพลงวนครบจำนวนห้อง โน้ตทุกตัวอยู่ในวน และอยู่ในช่วงเสียงที่ได้ยินชัด", () => {
    for (const name of TRACK_NAMES) {
      const track = trackOf(name);
      expect(track.steps % 16).toBe(0);
      expect(track.bpm).toBeGreaterThan(40);
      for (const channel of track.channels) {
        for (const note of channel.notes) {
          expect(note.step).toBeGreaterThanOrEqual(0);
          expect(note.step).toBeLessThan(track.steps);
          if (channel.wave === "drums") expect([0, 1, 2]).toContain(note.pitch);
          else {
            const hz = midiToHz(note.pitch);
            expect(hz).toBeGreaterThan(60);
            expect(hz).toBeLessThan(2200);
          }
        }
      }
      expect(track.channels.some((channel) => channel.notes.length > 0)).toBe(true);
    }
  });

  it("เพลงห้องเรียนของแต่ละห้องอยู่คนละคีย์", () => {
    const firstNotes = [1, 2, 3, 4, 5, 6].map((room) => trackOf("study", room).channels[0].notes[0].pitch);
    expect(new Set(firstNotes).size).toBe(6);
  });

  it("เพลงห้องเรียนเบากว่าเพลงต่อสู้ ไม่รบกวนการอ่าน", () => {
    const loudness = (name: "study" | "battle") => trackOf(name).channels.reduce((sum, channel) => sum + channel.gain * channel.notes.length, 0);
    expect(loudness("study")).toBeLessThan(loudness("battle") / 3);
  });
});

describe("เสียงประกอบ", () => {
  it("ทุกเสียงสั้นกว่า 1 วินาที และความดังไม่เกิน 1", () => {
    for (const [name, tones] of Object.entries(SFX)) {
      expect(tones.length, name).toBeGreaterThan(0);
      for (const tone of tones) {
        expect(tone.at + tone.length, name).toBeLessThan(1);
        expect(tone.gain, name).toBeLessThanOrEqual(1);
        expect(tone.from, name).toBeGreaterThan(20);
      }
    }
  });
});

describe("เพลงตามอารมณ์ของฉาก", () => {
  it("เพลงบอสของร่างถัดไปคีย์สูงขึ้นและเร็วขึ้น และเร่งอีกเมื่อการ์เดียนพลังเหลือน้อย", () => {
    const forms = [0, 1, 2].map((form) => trackOf("boss", bossVariant(form, false)));
    expect(forms.map((track) => track.bpm)).toEqual([...forms.map((track) => track.bpm)].sort((a, b) => a - b));
    expect(new Set(forms.map((track) => track.bpm)).size).toBe(3);
    expect(new Set(forms.map((track) => track.channels[0].notes[0].pitch)).size).toBe(3);
    for (const form of [0, 1, 2]) {
      const calm = trackOf("boss", bossVariant(form, false));
      const danger = trackOf("boss", bossVariant(form, true));
      expect(danger.bpm).toBeGreaterThan(calm.bpm);
      expect(danger.channels[0].notes[0].pitch).toBe(calm.channels[0].notes[0].pitch);
      // โน้ตของทุกร่างยังอยู่ในช่วงเสียงที่ได้ยินชัด
      for (const channel of danger.channels) for (const note of channel.notes) if (channel.wave !== "drums") expect(midiToHz(note.pitch)).toBeLessThan(2200);
    }
  });

  it("เพลงลุ้นตอนพลังเหลือน้อยเร็วกว่าเพลงต่อสู้ปกติ เพลงตึงเครียดและเพลงแพ้ช้ากว่า", () => {
    const bpm = (name: Parameters<typeof trackOf>[0]) => trackOf(name).bpm;
    expect(bpm("danger")).toBeGreaterThan(bpm("battle"));
    expect(bpm("tension")).toBeLessThan(bpm("battle"));
    expect(bpm("defeat")).toBeLessThan(bpm("story") + 1);
  });

  it("เพลงของโถง โรงเก็บหุ่น และร้านค้าต่างกัน", () => {
    const shape = (name: Parameters<typeof trackOf>[0]) => JSON.stringify(trackOf(name).channels.map((channel) => channel.notes.slice(0, 8)));
    expect(new Set([shape("lab"), shape("hangar"), shape("shop")]).size).toBe(3);
  });
});
