import { useRef, useState } from "react";
import { course } from "../content";
import { buildAssessment } from "../content/choices";
import type { FormId } from "../content/schema";
import { fmt, ui } from "../content/ui-strings";
import { scoreAssessment } from "../state/assessment";
import type { AssessmentResult } from "../state/progressStore";
import { ChoiceCard } from "./ChoiceCard";

interface AssessmentRunProps {
  phase: "pretest" | "posttest";
  form: FormId;
  onFinish: (result: AssessmentResult) => void;
  /** มีเมื่อออกจากแบบทดสอบได้ก่อนเริ่มตอบ (หลังเรียน) */
  onCancel?: () => void;
}

/**
 * แบบทดสอบก่อนเรียน ("ด่านสแกนเข้าแล็บ") และหลังเรียน ("ด่านสแกนออกจากแล็บ") ใช้ชุดข้อสอบคู่ขนานคนละชุด
 * บัตรโจทย์เข้ามาทีละใบ ไม่เฉลยรายข้อ ผลก่อนเรียนใช้ตั้งระดับความช่วยเหลือ ไม่ปลดล็อกห้อง (GDD ข้อ 7.1)
 */
export function AssessmentRun({ phase, form, onFinish, onCancel }: AssessmentRunProps) {
  const [items] = useState(() => buildAssessment(form));
  const [results, setResults] = useState<AssessmentResult["items"]>([]);
  const shownAt = useRef(performance.now());
  const index = results.length;
  const text = ui[phase];

  const answer = (option: number | null) => {
    const item = items[index];
    const now = performance.now();
    setResults([...results, { id: item.id ?? String(index), topic: item.topic, correct: option === item.answer, timeMs: Math.round(now - shownAt.current) }]);
    shownAt.current = now;
  };

  const finish = () => onFinish(scoreAssessment(form, results, course.topics.map((topic) => topic.id), new Date().toISOString()));

  return (
    <div className="flex flex-col gap-4" data-testid={phase} data-form={form}>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-teal-dark">{text.title}</h1>
        {index < items.length && (
          <span className="text-sm font-bold text-slate" data-testid="assessment-progress">
            {fmt(ui.pretest.progress, { n: index + 1, total: items.length })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 rounded-md border-2 border-ink bg-teal-light px-3 py-2">
        <img src="assets/characters/ch_mentor_south.png" alt="" className="pixelated h-12 w-12 shrink-0" />
        <p className="text-sm font-semibold">
          <span className="mr-1 font-extrabold">{ui.mentorName}:</span>
          {index < items.length ? text.intro : text.done}
        </p>
      </div>
      {index < items.length ? (
        <>
          <ChoiceCard key={index} item={items[index]} onAnswer={answer} allowUnknown />
          {onCancel && index === 0 && (
            <button type="button" className="btn btn-ghost self-start" data-testid="assessment-cancel" onClick={onCancel}>
              {ui.posttest.later}
            </button>
          )}
        </>
      ) : (
        <button type="button" className="btn self-end" data-testid="assessment-finish" onClick={finish}>
          {text.enter}
        </button>
      )}
    </div>
  );
}
