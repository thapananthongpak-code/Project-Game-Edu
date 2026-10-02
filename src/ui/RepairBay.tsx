import { useState } from "react";
import { playSfx } from "../audio/engine";
import type { Station } from "../content";
import { buildRepairItems } from "../content/choices";
import { fmt, ui } from "../content/ui-strings";
import { repairPracticeDone } from "../state/adaptive";
import { ADAPTIVE, type PageStyle } from "../state/adaptive.config";
import { ChoiceCard } from "./ChoiceCard";
import { PageView } from "./ContentView";
import { useDialog } from "./useDialog";

interface RepairBayProps {
  room: number;
  /** เนื้อหาที่ใช้ทบทวน: แผงอ้างอิงของด่านที่ผู้เล่นติดอยู่ */
  stations: Station[];
  onDone: () => void;
}

/**
 * ห้องซ่อม (GDD ข้อ 7.3): ทบทวนเนื้อหาเดิมในรูปแบบเน้นคำสำคัญและการ์ด (ต่างจากที่สถานี) แล้วฝึกโจทย์จากชุดสำรองจนถูกติดต่อกันครบเกณฑ์
 * ต้นแบบนี้ทำเป็นหน้าต่างซ้อนบนมินิเกม ยังไม่มีฉากห้องซ่อมแยก
 */
const REVIEW_STYLE: PageStyle = "visual";

export function RepairBay({ room, stations, onDone }: RepairBayProps) {
  const [practicing, setPracticing] = useState(false);

  const [items, setItems] = useState(() => buildRepairItems(room));
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<number | undefined>(undefined);
  const [results, setResults] = useState<boolean[]>([]);

  // ชุดสำรองที่ไม่มีโจทย์เลือกตอบ: ทบทวนแล้วกลับไปเล่นต่อได้เลย
  const done = items.length === 0 || repairPracticeDone(results);
  const streak = results.length - (results.lastIndexOf(false) + 1);
  const item = items[index];

  const answer = (option: number) => {
    setAnswered(option);
    setResults([...results, option === item.answer]);
    playSfx(option === item.answer ? "correct" : "wrong");
  };
  const nextItem = () => {
    setAnswered(undefined);
    if (index + 1 < items.length) setIndex(index + 1);
    else {
      // โจทย์หมดชุด: สลับแล้ววนใหม่
      setItems(buildRepairItems(room));
      setIndex(0);
    }
  };

  const dialog = useDialog<HTMLDivElement>();
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/90 p-2 sm:p-4" data-testid="repair">
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={ui.repair.title} className="panel mx-auto flex max-w-2xl flex-col gap-3 border-hint p-3 sm:p-4">
        <h2 className="text-lg font-extrabold text-teal-dark">🔧 {ui.repair.title}</h2>

        {!practicing ? (
          <>
            <h3 className="text-sm font-bold text-slate">{ui.repair.reviewStep}</h3>
            {stations.map((station) => (
              <section key={station.title} className="flex flex-col gap-2" data-testid="repair-review">
                <h4 className="font-extrabold text-teal-dark">{station.title}</h4>
                {station.pages.map((page, i) => (
                  <PageView key={i} page={page} style={REVIEW_STYLE} />
                ))}
              </section>
            ))}
            <button type="button" className="btn self-end" data-testid="repair-to-practice" onClick={() => (items.length === 0 ? onDone() : setPracticing(true))}>
              {items.length === 0 ? ui.repair.back : ui.repair.toPractice}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-slate">
                {ui.repair.practiceStep}: {fmt(ui.repair.practiceGoal, { n: ADAPTIVE.repairExitStreak })}
              </h3>
              <span className="rounded border-2 border-ink bg-paper px-2 text-sm font-bold" data-testid="repair-streak">
                {fmt(ui.repair.streak, { n: Math.min(streak, ADAPTIVE.repairExitStreak), total: ADAPTIVE.repairExitStreak })}
              </span>
            </div>
            <ChoiceCard key={results.length - (answered === undefined ? 0 : 1)} item={item} onAnswer={answer} answered={answered} />
            {answered !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className={`font-bold ${answered === item.answer ? "text-correct-dark" : "text-wrong"}`} data-testid="repair-result">
                  {answered === item.answer ? `✓ ${ui.repair.correct}` : `✗ ${ui.repair.wrong}`}
                </span>
                {done ? (
                  <button type="button" className="btn" data-testid="repair-back" onClick={onDone}>
                    {ui.repair.back}
                  </button>
                ) : (
                  <button type="button" className="btn" data-testid="repair-next" onClick={nextItem}>
                    {ui.repair.nextItem}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
