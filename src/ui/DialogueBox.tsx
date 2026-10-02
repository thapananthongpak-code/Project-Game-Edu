import { useCallback, useEffect, useMemo, useState } from "react";
import { archiveOf, stationsOf } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { ARCHIVE, useGameStore } from "../state/gameStore";
import { PageView } from "./ContentView";
import { useBit } from "./useBit";

/**
 * กล่องบทสนทนาของพี่บิต: บทสอนเป็นข้อความจาก course.json ทีละหน้า
 * เปิดได้สองแบบ: สถานีเดียว (ระดับง่าย) หรือคลังความรู้ทั้งหัวข้อ (ระดับกลาง ไม่บังคับอ่าน)
 */
export function DialogueBox() {
  const room = useGameStore((s) => s.room);
  const stationIndex = useGameStore((s) => s.stationIndex);
  const tutorOpen = useGameStore((s) => s.tutorOpen);
  const closeDialogue = useGameStore((s) => s.closeDialogue);
  const bit = useBit();
  const [pageIndex, setPageIndex] = useState(0);

  const pages = useMemo(() => {
    if (room === null || stationIndex === null) return [];
    if (stationIndex === ARCHIVE) return archiveOf(room);
    const station = stationsOf(room)[stationIndex];
    return station ? station.pages.map((page) => ({ title: station.title, page })) : [];
  }, [room, stationIndex]);
  const total = pages.length;
  const current = pages[pageIndex];
  const page = current?.page;
  const isLast = pageIndex >= total - 1;

  const goTo = setPageIndex;
  const advance = useCallback(() => {
    if (isLast) closeDialogue(true);
    else goTo(pageIndex + 1);
  }, [isLast, closeDialogue, goTo, pageIndex]);

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

  if (!current || !page) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center p-2 sm:p-3" data-testid="dialogue" data-archive={stationIndex === ARCHIVE || undefined}>
      <div className="panel flex w-full max-w-3xl gap-3 p-3">
        <div className="hidden shrink-0 flex-col items-center sm:flex">
          <img src={bit} alt="" className="pixelated h-20 w-20" />
          <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-bold">{ui.mentorName}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-extrabold text-teal-dark" data-testid="dialogue-title">
              {current.title}
            </h2>
            <span className="shrink-0 text-xs text-slate" data-testid="dialogue-page">
              {fmt(ui.dialogue.page, { n: pageIndex + 1, total })}
            </span>
          </div>
          <div className="min-h-[5.5rem]" data-testid="dialogue-body">
            <PageView page={page} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn btn-ghost !min-h-10 text-sm" onClick={() => closeDialogue(false)}>
              {ui.dialogue.close}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost !min-h-10 text-sm" disabled={pageIndex === 0} onClick={() => goTo(pageIndex - 1)}>
                {ui.dialogue.back}
              </button>
              <button type="button" className="btn !min-h-10 text-sm" data-testid="dialogue-next" onClick={advance}>
                {isLast ? ui.dialogue.done : ui.dialogue.next}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
