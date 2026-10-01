import { useEffect, useState } from "react";
import type { AccuracyCase } from "../../content/schema";
import { ui } from "../../content/ui-strings";
import type { MinigameSession } from "./useMinigameSession";

interface AccuracyBoardProps {
  session: MinigameSession;
  /** โจทย์จาก course.json ตรงตัว */
  question: string;
  /** ตัวเลขของโจทย์ คำตอบคำนวณจากตัวเลขนี้ ไม่ฝังค่าคำตอบ */
  problem: AccuracyCase;
  onDone: () => void;
}

/** รับ "60", "60%", "60.0" */
const parseNumber = (text: string): number => Number.parseFloat(text.replace(/[%\s]/g, ""));
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

/**
 * เครื่องคิดความแม่นยำ (GDD ห้อง 4 ส่วน B): เติมสูตร (ถูก ÷ ทดสอบ) × 100
 * ระดับประคองและปกติเติม 3 ช่องและตรวจทีละช่อง ระดับท้าทายมีช่องคำตอบช่องเดียว
 */
export function AccuracyBoard({ session, question, problem, onDone }: AccuracyBoardProps) {
  const expected = [problem.correct, problem.total, (problem.correct / problem.total) * 100];
  const [values, setValues] = useState(["", "", ""]);
  /** จำนวนช่องที่ตรวจผ่านแล้ว (โหมดตรวจทีละช่อง) */
  const [solved, setSolved] = useState(0);
  const [done, setDone] = useState(false);
  const { roundMode } = session;

  useEffect(() => {
    if (done) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const current = roundMode ? 2 : solved;
  const check = () => {
    const correct = same(parseNumber(values[current]), expected[current]);
    session.record(correct, correct ? [] : [question]);
    session.setFeedback(correct ? "correct" : "wrong");
    if (!correct) return;
    if (current === 2) setDone(true);
    else setSolved(solved + 1);
  };

  const field = (index: number) => {
    const locked = done || (!roundMode && index < solved);
    return (
      <input
        inputMode="decimal"
        value={locked && !roundMode ? String(expected[index]) : values[index]}
        disabled={locked || index !== current}
        aria-label={ui.minigame.accuracyFields[index]}
        data-testid="accuracy-input"
        data-field={index}
        onChange={(event) => setValues(values.map((v, i) => (i === index ? event.target.value : v)))}
        onKeyDown={(event) => event.key === "Enter" && values[index].trim() && check()}
        className={`w-20 select-text rounded-md border-[3px] p-2 text-center text-lg font-bold ${locked ? "border-correct bg-[#dff5e3]" : index === current ? "border-ink bg-paper" : "border-dashed border-steel bg-cream"}`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="accuracy-board">
      <p className="rounded-lg border-[3px] border-ink bg-paper p-3 text-base font-semibold">{question}</p>
      <div className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
        {roundMode ? (
          <>
            <span className="text-base">{ui.minigame.answer}</span>
            {field(2)} %
          </>
        ) : (
          <>
            ( {field(0)} ÷ {field(1)} ) × 100 = {field(2)} %
          </>
        )}
        <button type="button" className="btn ml-auto" data-testid={roundMode ? "submit-round" : "accuracy-check"} disabled={done || !values[current].trim()} onClick={check}>
          {roundMode ? ui.minigame.submit : ui.minigame.check}
        </button>
      </div>
    </div>
  );
}
