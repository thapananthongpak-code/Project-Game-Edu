import { useRef, useState } from "react";
import { playSfx } from "../../audio/engine";
import { type AdaptiveEvent, evaluateMinigame, type MinigameState } from "../../state/adaptive";
import { planOf, startTierOf, useGameStore } from "../../state/gameStore";

export type Feedback = "start" | "selected" | "correct" | "wrong" | "roundWrong" | "stageDone" | "complete";

export interface MinigameSession {
  /** ผลจากเครื่องยนต์ปรับระดับ ณ ตอนนี้ */
  state: MinigameState;
  /** ระดับท้าทาย: ตรวจเมื่อกดส่งทั้งรอบ */
  roundMode: boolean;
  /** บันทึกการตรวจคำตอบ 1 ครั้ง (GDD ข้อ 4.2) missed = ข้อความบนชิ้นที่ตอบผิด เก็บให้ครูดูว่าชิ้นไหนผิดบ่อย */
  record: (correct: boolean, missed?: string[]) => void;
  peeksLeft: number;
  /** ใช้สิทธิ์เปิดอ่าน 1 ครั้ง คืน false เมื่อไม่เหลือสิทธิ์ */
  takePeek: () => boolean;
  feedback: Feedback;
  setFeedback: (feedback: Feedback) => void;
  repairOffered: boolean;
  repairRequired: boolean;
  inRepair: boolean;
  declineRepair: () => void;
  enterRepair: () => void;
  leaveRepair: () => void;
}

/**
 * สถานะของมินิเกมหนึ่งรอบที่ใช้ร่วมกันทุกด่านของห้อง: ประวัติการตรวจ ระดับ สิทธิ์เปิดอ่าน และห้องซ่อม
 * การตัดสินทั้งหมดมาจาก evaluateMinigame (src/state/adaptive.ts) ด่านต่าง ๆ แค่เรียก record
 */
export function useMinigameSession(room: number): MinigameSession {
  const [startTier] = useState(() => startTierOf(useGameStore.getState(), room));
  // ระดับความยากของเกมกำหนดระดับความช่วยเหลือต่ำสุด: ตอบผิดแล้วระดับไม่ลดต่ำกว่านี้ (GDD ข้อ 15)
  const [floor] = useState(() => planOf(useGameStore.getState()).minTier);
  const [events, setEvents] = useState<AdaptiveEvent[]>([]);
  const [peeksUsed, setPeeksUsed] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>("start");
  const [inRepair, setInRepair] = useState(false);
  const [offerDeclinedAt, setOfferDeclinedAt] = useState(-1);
  const lastEventAt = useRef(performance.now());

  const state = evaluateMinigame(startTier, events, floor);
  const peeksLeft = Math.max(0, state.peeksAllowed - peeksUsed);

  return {
    state,
    roundMode: state.checkMode === "round",
    record: (correct, missed = []) => {
      if (missed.length > 0) useGameStore.getState().recordMisses(missed);
      playSfx(correct ? "correct" : "wrong");
      const now = performance.now();
      const timeMs = Math.round(now - lastEventAt.current);
      lastEventAt.current = now;
      setEvents((old) => [...old, { type: "check", correct, timeMs }]);
    },
    peeksLeft,
    takePeek: () => {
      if (peeksLeft <= 0) return false;
      setPeeksUsed((n) => n + 1);
      return true;
    },
    feedback,
    setFeedback,
    repairOffered: state.repair === "offer" && offerDeclinedAt !== events.length,
    repairRequired: state.repair === "required",
    inRepair,
    declineRepair: () => setOfferDeclinedAt(events.length),
    enterRepair: () => setInRepair(true),
    leaveRepair: () => {
      lastEventAt.current = performance.now();
      setEvents((old) => [...old, { type: "repair" }]);
      setInRepair(false);
      setFeedback("start");
    },
  };
}
