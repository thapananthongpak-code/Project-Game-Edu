import { useCallback, useEffect, useState } from "react";
import { stationsOf } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { PageView, revealUnits } from "./ContentView";

const NONE: ReadonlySet<number> = new Set();

/** กล่องบทสนทนาของพี่บิต: บทสอนเป็นข้อความจาก course.json ทีละหน้า นำเสนอตามสไตล์การเรียนของผู้เล่น */
export function DialogueBox() {
  const room = useGameStore((s) => s.room);
  const stationIndex = useGameStore((s) => s.stationIndex);
  const style = useGameStore((s) => s.profile?.style ?? "read");
  const tutorOpen = useGameStore((s) => s.tutorOpen);
  const closeDialogue = useGameStore((s) => s.closeDialogue);
  const [pageIndex, setPageIndex] = useState(0);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(NONE);

  const station = room !== null && stationIndex !== null ? stationsOf(room)[stationIndex] : null;
  const total = station?.pages.length ?? 0;
  const page = station?.pages[pageIndex];
  const isLast = pageIndex >= total - 1;
  const units = page ? revealUnits(page) : 0;
  // สไตล์ลงมือทำ: ต้องเปิดครบทุกชิ้นของหน้านี้ก่อนจึงไปหน้าถัดไปได้
  const pageDone = style !== "hands" || revealed.size >= units;

  const goTo = useCallback((index: number) => {
    setPageIndex(index);
    setRevealed(NONE);
  }, []);
  const reveal = useCallback((unit: number) => setRevealed((old) => new Set(old).add(unit)), []);
  const advance = useCallback(() => {
    if (!pageDone) {
      // ปุ่มถัดไปบนคีย์บอร์ดเปิดชิ้นถัดไปที่ยังคว่ำอยู่
      for (let unit = 0; unit < units; unit++) {
        if (!revealed.has(unit)) return reveal(unit);
      }
    } else if (isLast) closeDialogue(true);
    else goTo(pageIndex + 1);
  }, [pageDone, units, revealed, reveal, isLast, closeDialogue, goTo, pageIndex]);

  useEffect(() => {
    if (tutorOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      // โฟกัสอยู่บนปุ่มของกล่องสนทนา: Enter และ Space เป็นของปุ่มนั้น (เช่น ปุ่มย้อนกลับ) ไม่ใช่คำสั่งไปหน้าถัดไป
      const onControl = event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select") !== null;
      if (onControl && (event.key === "Enter" || event.key === " ")) return;
      if (["Enter", " ", "e", "E", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        advance();
      } else if (event.key === "ArrowLeft") {
        goTo(Math.max(0, pageIndex - 1));
      } else if (event.key === "Escape") {
        closeDialogue(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, goTo, pageIndex, closeDialogue, tutorOpen]);

  if (!station || !page) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center p-2 sm:p-3" data-testid="dialogue" data-style={style}>
      <div className="panel flex w-full max-w-3xl gap-3 p-3">
        <div className="hidden shrink-0 flex-col items-center sm:flex">
          <img src="assets/characters/ch_mentor_south.png" alt="" className="pixelated h-20 w-20" />
          <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-bold">{ui.mentorName}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-extrabold text-teal-dark" data-testid="dialogue-title">
              {station.title}
            </h2>
            <span className="shrink-0 text-xs text-slate" data-testid="dialogue-page">
              {fmt(ui.dialogue.page, { n: pageIndex + 1, total })}
            </span>
          </div>
          <div className="min-h-[5.5rem]" data-testid="dialogue-body">
            <PageView page={page} style={style} revealed={revealed} onReveal={reveal} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn btn-ghost !min-h-10 text-sm" onClick={() => closeDialogue(false)}>
              {ui.dialogue.close}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost !min-h-10 text-sm" disabled={pageIndex === 0} onClick={() => goTo(pageIndex - 1)}>
                {ui.dialogue.back}
              </button>
              <button type="button" className="btn !min-h-10 text-sm" data-testid="dialogue-next" disabled={!pageDone} onClick={advance}>
                {isLast ? ui.dialogue.done : ui.dialogue.next}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
