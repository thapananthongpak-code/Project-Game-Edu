import { useEffect } from "react";
import { fmt, ui } from "../content/ui-strings";
import { GUIDE_STEPS, tipDue } from "../state/guide";
import { guideActive, guideDoorOf, useGameStore } from "../state/gameStore";

/**
 * ไกด์นำทาง (GDD ข้อ 23): แถบใต้ HUD ไม่บังฉาก ไม่ล็อกการเล่น และข้ามได้ทุกเมื่อ
 * - การสอนเล่นครั้งแรก (เฉพาะผู้เล่นใหม่ที่โถง): 4 ขั้น ผ่านเมื่อผู้เล่นทำจริง
 * - คำแนะนำครั้งแรกของแต่ละที่ (ห้องเรียน โรงเก็บหุ่น ย่านร้านค้า ห้องวิจัย) แสดงครั้งเดียว
 */
export function GuideBar() {
  const screen = useGameStore((s) => s.screen);
  const overlay = useGameStore((s) => s.overlay);
  const zone = useGameStore((s) => s.zone);
  const step = useGameStore((s) => s.guideStep);
  const tips = useGameStore((s) => s.shop.tips);
  const due = useGameStore(guideActive);
  const door = useGameStore(guideDoorOf);
  const advance = useGameStore((s) => s.advanceGuide);
  const skip = useGameStore((s) => s.skipGuide);
  const dismiss = useGameStore((s) => s.dismissTip);

  // ขั้น 1: เดินด้วยคีย์บอร์ดหรือปุ่มทิศทางบนจอ
  useEffect(() => {
    if (!due || step !== 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) advance(0);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-testid="touch-controls"]')) advance(0);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [due, step, advance]);

  // ขั้น 2: เปิดสมุดเควส  ขั้น 4: เข้าห้อง (แมพที่ไม่มีห้องเรียน: เข้าโรงเก็บหุ่น) ฉากออกจากโถงแล้ว due เป็น false จึงจบขั้นนี้ตอนกดเข้าประตู
  useEffect(() => {
    if (step === 1 && due && overlay === "questlog") advance(1);
    if (step === 3 && (zone !== null || screen === "hangar")) advance(3);
  }, [due, step, overlay, zone, screen, advance]);

  if (due) {
    const key = GUIDE_STEPS[Math.min(step, GUIDE_STEPS.length - 1)];
    return (
      <section className="flex shrink-0 flex-wrap items-center gap-2 border-b-[3px] border-ink bg-hint px-2 py-1 text-sm" aria-label={ui.guide.stepLabel.replace("{n}", String(step + 1)).replace("{total}", String(GUIDE_STEPS.length))} data-testid="guide" data-step={key}>
        <span className="shrink-0 rounded border-2 border-ink bg-paper px-1 text-xs font-extrabold" data-testid="guide-step">
          {fmt(ui.guide.stepLabel, { n: step + 1, total: GUIDE_STEPS.length })}
        </span>
        <span className="min-w-0 flex-1 font-semibold" data-testid="guide-text">
          {key === "door" && door === "hangar" ? ui.guide.steps.doorHangar : ui.guide.steps[key]}
        </span>
        {key === "goal" && (
          <button type="button" className="btn !min-h-9 text-sm" data-testid="guide-next" onClick={() => advance(2)}>
            {ui.guide.understood}
          </button>
        )}
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="guide-skip" onClick={skip}>
          {ui.guide.skip}
        </button>
      </section>
    );
  }

  const tip = overlay === null ? tipDue(screen, tips) : null;
  if (!tip) return null;
  return (
    <section className="flex shrink-0 flex-wrap items-center gap-2 border-b-[3px] border-ink bg-teal-light px-2 py-1 text-sm" aria-label={ui.guide.tipTitle} data-testid="guide-tip" data-tip={tip}>
      <span className="shrink-0 rounded border-2 border-ink bg-paper px-1 text-xs font-extrabold">{ui.guide.tipTitle}</span>
      <span className="min-w-0 flex-1 font-semibold">{ui.guide.tips[tip]}</span>
      <button type="button" className="btn !min-h-9 text-sm" data-testid="guide-tip-ok" onClick={() => dismiss(tip, false)}>
        {ui.guide.gotIt}
      </button>
      <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="guide-tip-off" onClick={() => dismiss(tip, true)}>
        {ui.guide.tipsOff}
      </button>
    </section>
  );
}
