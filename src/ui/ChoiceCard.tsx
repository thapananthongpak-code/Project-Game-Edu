import type { ChoiceItem } from "../content/choices";
import { fmt, ui } from "../content/ui-strings";

interface ChoiceCardProps {
  item: ChoiceItem;
  /** null = ผู้เล่นกดยังไม่รู้ */
  onAnswer: (option: number | null) => void;
  /** แสดงปุ่มยังไม่รู้ (แบบทดสอบก่อนเรียน) */
  allowUnknown?: boolean;
  /** ตัวเลือกที่ตอบไปแล้ว: ล็อกปุ่มและแสดงผลถูกผิด (ห้องซ่อม) */
  answered?: number | null;
}

const question = (item: ChoiceItem): string =>
  item.ask.type === "pick" ? fmt(ui.choice.pick, { label: item.ask.label }) : item.ask.type === "column" ? ui.choice.column : ui.choice.first;

/** โจทย์เลือกตอบหนึ่งข้อ ข้อความบนบัตรและตัวเลือกมาจาก course.json ตรงตัว */
export function ChoiceCard({ item, onAnswer, allowUnknown = false, answered }: ChoiceCardProps) {
  const locked = answered !== undefined;
  return (
    <div className="slide-in flex flex-col gap-3" data-testid="choice" data-topic={item.topic} data-item={item.id}>
      {item.card && (
        <div className="rounded-lg border-[3px] border-ink bg-paper p-3 text-center shadow-[0_3px_0_0_#1a1c2c]">
          {item.caption && <div className="text-xs font-bold text-slate">{item.caption}</div>}
          <div className="text-lg font-bold" data-testid="choice-card">
            {item.card}
          </div>
        </div>
      )}
      <p className="font-semibold" data-testid="choice-question">
        {question(item)}
      </p>
      <div className="flex flex-col gap-2">
        {item.options.map((option, i) => {
          const tone = !locked ? "bg-cream hover:bg-teal-light" : i === item.answer ? "border-correct bg-[#dff5e3]" : i === answered ? "border-wrong bg-[#f8e1e5]" : "bg-cream opacity-60";
          return (
            <button key={option} type="button" disabled={locked} data-testid="choice-option" onClick={() => onAnswer(i)} className={`min-h-11 rounded-lg border-[3px] border-ink px-3 py-2 text-left font-semibold ${tone}`}>
              {option}
            </button>
          );
        })}
        {allowUnknown && (
          <button type="button" disabled={locked} data-testid="choice-unknown" onClick={() => onAnswer(null)} className="min-h-11 rounded-lg border-[3px] border-dashed border-steel bg-paper px-3 py-2 font-semibold text-slate hover:bg-mist">
            {ui.pretest.dontKnow}
          </button>
        )}
      </div>
    </div>
  );
}
