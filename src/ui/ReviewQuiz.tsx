import { useMemo, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import { topicOf } from "../content";
import { buildReview, type ReviewItem, reviewCorrect } from "../content/review";
import { fmt, ui } from "../content/ui-strings";
import { roomProgress, useGameStore } from "../state/gameStore";
import { ChoiceCard } from "./ChoiceCard";
import { useDialog } from "./useDialog";

/**
 * คำถามทบทวนปิดท้ายเรื่อง (GDD ข้อ 4.5): โจทย์เลือกตอบ 3 แบบ จับคู่ เชื่อมโยง และถูกหรือผิด ไม่มีการเขียนตอบ
 * ข้อที่ตอบผิดวนกลับมาถามท้ายแถวจนตอบถูกครบทุกข้อ เกมบันทึกจำนวนข้อที่ตอบถูกตั้งแต่ครั้งแรก (รอบที่ดีที่สุด)
 * ผลนี้ไม่ใช้ปรับระดับความช่วยเหลือและไม่เป็นคะแนน ข้อความบนบัตรและตัวเลือกมาจาก course.json ตรงตัว
 * คำถามทบทวนของต้นฉบับ (รวมข้อที่เป็นคำถามปลายเปิด) แสดงครบตามเดิมเป็น "คำถามชวนคิด" หลังตอบครบ: ไม่ต้องเขียนส่งและเกมไม่เก็บคำตอบ
 */
export function ReviewQuiz() {
  const room = useGameStore((s) => s.room) as number;
  const saved = useGameStore((s) => roomProgress(s, room).review);
  const done = useGameStore((s) => roomProgress(s, room).reviewDone);
  const saveReview = useGameStore((s) => s.saveReview);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const items = useMemo(() => buildReview(room), [room]);
  /** ลำดับของข้อที่ยังต้องตอบให้ถูก ข้อที่ตอบผิดถูกต่อท้ายแถว */
  const [queue, setQueue] = useState<number[]>(() => items.map((_, i) => i));
  const [answered, setAnswered] = useState<number | undefined>(undefined);
  /** ข้อที่ตอบถูกตั้งแต่ครั้งแรก */
  const [first, setFirst] = useState(0);
  const missed = useRef(new Set<number>());
  const [step, setStep] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);

  const current = queue[0];
  const entry: ReviewItem | undefined = items[current];
  const title = fmt(ui.review.title, { n: room });
  const topic = topicOf(room);

  const answer = (value: number) => {
    if (!entry || answered !== undefined) return;
    const correct = reviewCorrect(entry, value);
    setAnswered(value);
    playSfx(correct ? "correct" : "wrong");
    if (correct && !missed.current.has(current)) setFirst(first + 1);
    if (!correct) missed.current.add(current);
    window.setTimeout(() => nextButton.current?.focus({ preventScroll: true }), 0);
  };

  const next = () => {
    if (!entry || answered === undefined) return;
    const correct = reviewCorrect(entry, answered);
    const rest = queue.slice(1);
    const upcoming = correct ? rest : [...rest, current];
    setQueue(upcoming);
    setAnswered(undefined);
    setStep(step + 1);
    if (upcoming.length === 0) saveReview({ correct: first, total: items.length });
  };

  const finished = queue.length === 0;
  const truthRight = entry ? entry.candidate === entry.item.answer : false;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="review" data-kind={entry?.kind ?? ""} data-left={queue.length} data-total={items.length}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">📝 {title}</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="review-tutor" onClick={() => setTutorOpen(true)}>
              {ui.hud.tutor}
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="review-close" onClick={closeOverlay}>
              {ui.review.close}
            </button>
          </div>
        </div>
        {done && saved && !finished && step === 0 && (
          <p className="rounded-md border-2 border-ink bg-teal-light px-2 py-1 text-sm font-bold" data-testid="review-done-note">
            {fmt(ui.review.again, { n: saved.correct, total: saved.total })}
          </p>
        )}
        <p className="text-sm text-slate">{ui.review.intro}</p>

        {entry && !finished && (
          <div className="flex flex-col gap-2" data-testid="review-item">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded border-2 border-ink bg-hint px-2" data-testid="review-kind">
                {ui.review.kinds[entry.kind]}
              </span>
              <span className="rounded border-2 border-ink bg-paper px-2" data-testid="review-remaining">
                {fmt(ui.review.remaining, { n: queue.length })}
              </span>
            </div>
            {entry.kind === "truth" ? (
              <div className="flex flex-col gap-3" data-testid="review-truth" data-item={entry.item.card}>
                <div className="rounded-lg border-[3px] border-ink bg-paper p-3 text-center shadow-[0_3px_0_0_#1a1c2c]">
                  {entry.item.caption && <div className="text-xs font-bold text-slate">{entry.item.caption}</div>}
                  <div className="text-lg font-bold" data-testid="review-truth-card">
                    {entry.item.card}
                  </div>
                  <div className="my-1 text-xs font-bold text-slate">{ui.review.truthPair}</div>
                  <div className="text-lg font-extrabold text-teal-dark" data-testid="review-truth-candidate">
                    {entry.item.options[entry.candidate]}
                  </div>
                </div>
                <p className="font-semibold">{ui.review.truthQuestion}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 0].map((value) => {
                    const locked = answered !== undefined;
                    const right = (value === 1) === truthRight;
                    const tone = !locked ? "bg-cream hover:bg-teal-light" : right ? "border-correct bg-[#dff5e3]" : value === answered ? "border-wrong bg-[#f8e1e5]" : "bg-cream opacity-60";
                    return (
                      <button key={value} type="button" disabled={locked} data-testid={value === 1 ? "review-true" : "review-false"} onClick={() => answer(value)} className={`min-h-11 rounded-lg border-[3px] border-ink px-3 py-2 font-extrabold ${tone}`}>
                        {value === 1 ? `✓ ${ui.review.truthTrue}` : `✗ ${ui.review.truthFalse}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ChoiceCard key={step} item={entry.item} onAnswer={answer} answered={answered} />
            )}
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2" aria-live="polite">
              <span className={`text-sm font-bold ${answered !== undefined && reviewCorrect(entry, answered) ? "text-correct-dark" : "text-wrong"}`} data-testid="review-feedback">
                {answered === undefined ? "" : reviewCorrect(entry, answered) ? `✓ ${ui.review.correct}` : `✗ ${ui.review.wrong}`}
              </span>
              {answered !== undefined && (
                <button ref={nextButton} type="button" className="btn" data-testid="review-next" onClick={next}>
                  {ui.review.next}
                </button>
              )}
            </div>
          </div>
        )}

        {finished && (
          <div className="flex flex-col items-center gap-2 text-center" data-testid="review-finished">
            <p className="text-xl font-extrabold text-correct-dark">{ui.review.done}</p>
            <p className="font-semibold" data-testid="review-score" data-correct={first} data-total={items.length}>
              {fmt(ui.review.score, { n: first, total: items.length })}
            </p>
            <button type="button" className="btn" data-testid="review-save" onClick={closeOverlay}>
              {ui.review.finish}
            </button>
          </div>
        )}

        {(finished || (done && step === 0)) && topic.reviewQuestions.length > 0 && (
          <section className="rounded-lg border-2 border-ink bg-paper p-3" data-testid="review-think" aria-label={ui.review.think}>
            <h3 className="font-extrabold text-teal-dark">💭 {ui.review.think}</h3>
            <p className="text-xs text-slate">{ui.review.thinkNote}</p>
            {topic.reviewHeading && <p className="mt-2 text-sm font-bold">{topic.reviewHeading}</p>}
            {topic.reviewInstruction && <p className="text-sm">{topic.reviewInstruction}</p>}
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
              {topic.reviewQuestions.map((question) => (
                <li key={question.question}>{question.question}</li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
