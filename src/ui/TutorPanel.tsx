import { useEffect, useRef, useState } from "react";
import type { Station } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { planOf, roomProgress, useGameStore } from "../state/gameStore";
import { askTutor, recordTutorUse, type TutorTurn, tutorUsed } from "../tutor/client";
import { TUTOR } from "../tutor/config";
import { fallbackHint } from "../tutor/fallback";
import { useBit } from "./useBit";
import { PageView } from "./ContentView";
import { useDialog } from "./useDialog";

type Entry =
  | { kind: "user"; text: string }
  | { kind: "tutor"; text: string }
  /** คำใบ้สำเร็จรูป: ข้อความจาก course.json ของขั้นที่ผู้เล่นอยู่ */
  | { kind: "hint"; note: string; station: Station };

/** บทสนทนาของแต่ละห้องคงอยู่ตลอดเซสชัน แม้ปิดหน้าต่างแล้วเปิดใหม่ */
const threads = new Map<number, Entry[]>();
// เริ่มเกมใหม่หรือเปลี่ยนผู้เล่น (เล่นต่อจากเครื่องอื่น): บทสนทนาของคนก่อนต้องไม่ตามมา
useGameStore.subscribe((state, previous) => {
  if (state.profile?.name !== previous.profile?.name) threads.clear();
});

/** บทสนทนาที่ส่งให้ API: เฉพาะคู่คำถามกับคำตอบของติวเตอร์ AI คำถามที่ได้คำใบ้สำเร็จรูปไม่นับ */
function apiHistory(entries: Entry[]): TutorTurn[] {
  const turns: TutorTurn[] = [];
  entries.forEach((entry, i) => {
    if (entry.kind === "tutor" && entries[i - 1]?.kind === "user") {
      turns.push({ role: "user", content: (entries[i - 1] as { text: string }).text }, { role: "assistant", content: entry.text });
    }
  });
  return turns;
}

/**
 * หน้าต่างถามพี่บิต: ติวเตอร์ AI ตอบเฉพาะเนื้อหาของห้องปัจจุบัน (ขอบเขตถูกล็อกที่ฝั่งเซิร์ฟเวอร์ใน api/tutor.ts)
 * จำกัดจำนวนคำถามต่อเซสชัน และใช้คำใบ้สำเร็จรูปเมื่อเรียก API ไม่ได้หรือถามครบโควตาแล้ว
 */
export function TutorPanel() {
  const room = useGameStore((s) => s.tutorRoom) as number;
  const progress = useGameStore((s) => roomProgress(s, room));
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const recordTutor = useGameStore((s) => s.recordTutor);
  const dialog = useDialog<HTMLDivElement>();
  const bit = useBit();
  const [entries, setEntries] = useState<Entry[]>(() => threads.get(room) ?? []);
  const [question, setQuestion] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [used, setUsed] = useState(tutorUsed);
  const listEnd = useRef<HTMLDivElement>(null);
  // ระดับความยากสูงถามได้น้อยลง (ไม่เกินขีดจำกัดของเซิร์ฟเวอร์)
  const limit = useGameStore((s) => Math.min(TUTOR.questionsPerSession, planOf(s).tutorQuestions));
  const remaining = Math.max(0, limit - used);

  useEffect(() => {
    threads.set(room, entries);
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [room, entries, waiting]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setTutorOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTutorOpen]);

  const send = async () => {
    const text = question.trim();
    if (!text || waiting) return;
    const asked: Entry[] = [...entries, { kind: "user", text }];
    setEntries(asked);
    setQuestion("");
    const hint = (note: string): Entry => ({ kind: "hint", note, station: fallbackHint(room, progress, asked.filter((e) => e.kind === "hint").length) });

    if (remaining === 0) {
      recordTutor("hints");
      setEntries([...asked, hint(ui.tutor.limitFallback)]);
      return;
    }
    setWaiting(true);
    const answer = await askTutor(room, [...apiHistory(entries), { role: "user", content: text }]);
    setWaiting(false);
    if (answer.kind === "reply") {
      setUsed(recordTutorUse());
      recordTutor("ai");
      setEntries([...asked, { kind: "tutor", text: answer.text }]);
    } else {
      recordTutor("hints");
      setEntries([...asked, hint(ui.tutor.fallback)]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-2 sm:items-center sm:p-4" data-testid="tutor">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.tutor.title} tabIndex={-1} className="panel flex max-h-[90dvh] w-full max-w-xl flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-teal-dark">
            <img src={bit} alt="" className="pixelated h-9 w-9" />
            {ui.tutor.title}
          </h2>
          <div className="flex items-center gap-2">
            <span className="rounded border-2 border-ink bg-paper px-2 py-0.5 text-xs font-bold" data-testid="tutor-remaining" data-limit={limit}>
              {remaining > 0 ? fmt(ui.tutor.remaining, { n: remaining }) : ui.tutor.limitReached}
            </span>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setTutorOpen(false)}>
              {ui.tutor.close}
            </button>
          </div>
        </div>

        <div className="flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto rounded-md border-2 border-ink bg-paper p-2" aria-live="polite">
          {entries.length === 0 && <p className="text-sm text-slate">{ui.tutor.intro}</p>}
          {entries.map((entry, i) =>
            entry.kind === "user" ? (
              <p key={i} className="self-end rounded-lg border-2 border-ink bg-teal-light px-3 py-1.5 text-sm" data-testid="tutor-question">
                {entry.text}
              </p>
            ) : entry.kind === "tutor" ? (
              <p key={i} className="self-start whitespace-pre-line rounded-lg border-2 border-ink bg-cream px-3 py-1.5 text-sm" data-testid="tutor-reply">
                {entry.text}
              </p>
            ) : (
              <div key={i} className="flex flex-col gap-1 self-start rounded-lg border-2 border-dashed border-ink bg-cream px-3 py-1.5 text-sm" data-testid="tutor-hint">
                <p className="font-semibold">{entry.note}</p>
                <p className="font-extrabold text-teal-dark">{entry.station.title}</p>
                {entry.station.pages.map((page, j) => (
                  <PageView key={j} page={page} />
                ))}
              </div>
            ),
          )}
          {waiting && <p className="self-start text-sm text-slate">{ui.tutor.thinking}</p>}
          <div ref={listEnd} />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            value={question}
            maxLength={TUTOR.maxQuestionChars}
            placeholder={ui.tutor.placeholder}
            aria-label={ui.tutor.placeholder}
            data-testid="tutor-input"
            onChange={(event) => setQuestion(event.target.value)}
            className="min-w-0 flex-1 select-text rounded-md border-2 border-ink bg-paper p-2 text-base"
          />
          <button type="submit" className="btn" disabled={!question.trim() || waiting} data-testid="tutor-send">
            {ui.tutor.send}
          </button>
        </form>
      </div>
    </div>
  );
}
