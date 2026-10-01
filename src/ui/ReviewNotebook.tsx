import { useMemo, useState } from "react";
import { topicOf } from "../content";
import { reviewBlocks } from "../content/review";
import { fmt, ui } from "../content/ui-strings";
import { roomProgress, useGameStore } from "../state/gameStore";
import { MAX_ANSWER_CHARS } from "../state/rules";
import { useDialog } from "./useDialog";

/**
 * คำถามทบทวนปิดท้ายห้อง: คำถามและป้ายช่องจาก course.json ตรงตัว โครงของช่องมาจาก reviewBlocks
 * เกมตรวจแค่ว่าตอบครบและยาวพอ ครูเป็นผู้ตรวจ (GDD ข้อ 4.5)
 */
export function ReviewNotebook() {
  const room = useGameStore((s) => s.room) as number;
  const saved = useGameStore((s) => roomProgress(s, room).reviewAnswers);
  const saveReview = useGameStore((s) => s.saveReview);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const topic = topicOf(room);
  const dialog = useDialog<HTMLFormElement>();
  const blocks = useMemo(() => reviewBlocks(room), [room]);
  const fields = blocks.flatMap((block) => block.fields);
  const [answers, setAnswers] = useState<string[]>(() => fields.map((_, i) => saved[i] ?? ""));

  const lengths = answers.map((a) => a.trim().length);
  const valid = fields.every((field, i) => lengths[i] >= field.minChars);
  const update = (index: number, value: string) => setAnswers(answers.map((a, i) => (i === index ? value : a)));

  let fieldIndex = 0;
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="review">
      <form
        ref={dialog}
        role="dialog" aria-modal="true" tabIndex={-1}
        aria-label={topic.reviewHeading}
        className="panel mx-auto flex max-w-2xl flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          saveReview(answers.map((a) => a.trim()));
          closeOverlay();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">{topic.reviewHeading}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setTutorOpen(true)}>
            {ui.hud.tutor}
          </button>
        </div>
        {topic.reviewInstruction && <p className="font-semibold">{topic.reviewInstruction}</p>}

        {blocks.map((block, number) => (
          <section key={block.question} className="flex flex-col gap-2" data-testid="review-block">
            <p className="font-semibold">
              {number + 1}. {block.question}
            </p>
            {block.facts.length > 0 && (
              <div className="rounded-md border-2 border-ink bg-teal-light p-2 text-sm">
                <div className="text-xs font-bold text-teal-dark">{ui.review.fromQuest}</div>
                {block.facts.map((fact) => (
                  <div key={fact.label} data-testid="review-fact">
                    {fact.label}: <span className="font-bold">{fact.value}</span>
                  </div>
                ))}
              </div>
            )}
            {block.fields.map((field) => {
              const index = fieldIndex++;
              const common = {
                value: answers[index],
                placeholder: ui.review.placeholder,
                maxLength: MAX_ANSWER_CHARS,
                "aria-label": field.label ? `${block.question} ${field.label}` : block.question,
                "data-testid": "review-answer",
                onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(index, event.target.value),
                className: "select-text rounded-md border-2 border-ink bg-paper p-2 text-base",
              };
              return (
                <label key={index} className="flex flex-col gap-1">
                  {field.label && <span className="text-sm font-semibold">{field.label}</span>}
                  {field.short ? <input {...common} /> : <textarea rows={3} {...common} />}
                  <span className={`text-xs ${lengths[index] >= field.minChars ? "text-correct-dark" : "text-slate"}`}>
                    {fmt(ui.review.minChars, { n: field.minChars, count: lengths[index] })}
                  </span>
                </label>
              );
            })}
          </section>
        ))}

        <p className="text-xs text-slate">{ui.review.note}</p>
        <div className="flex justify-between gap-2">
          <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
            {ui.review.close}
          </button>
          <button type="submit" className="btn" disabled={!valid} data-testid="review-save">
            {ui.review.save}
          </button>
        </div>
      </form>
    </div>
  );
}
