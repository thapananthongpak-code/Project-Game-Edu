import type { ChoiceItem } from "../content/choices";
import { fmt, ui } from "../content/ui-strings";

interface ChoiceCardProps {
  item: ChoiceItem;
  onAnswer: (option: number) => void;
  /** ตัวเลือกที่ตอบไปแล้ว: ล็อกปุ่มและแสดงผลถูกผิด (ห้องซ่อมและด่านต่อสู้) */
  answered?: number;
  /** ตัวเลือกที่ถูกตัดออก กดไม่ได้ (ชิปวิเคราะห์ในด่านต่อสู้) */
  removed?: readonly number[];
}

const question = (item: ChoiceItem): string =>
  item.ask.type === "pick" ? fmt(ui.choice.pick, { label: item.ask.label }) : item.ask.type === "column" ? ui.choice.column : item.ask.type === "next" ? ui.choice.next : ui.choice.first;

/** โจทย์เลือกตอบหนึ่งข้อ ข้อความบนบัตรและตัวเลือกมาจาก course.json ตรงตัว */
export function ChoiceCard({ item, onAnswer, answered, removed = [] }: ChoiceCardProps) {
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
          const cut = removed.includes(i);
          const tone = !locked ? (cut ? "border-dashed bg-mist line-through opacity-60" : "bg-cream hover:bg-teal-light") : i === item.answer ? "border-correct bg-[#dff5e3]" : i === answered ? "border-wrong bg-[#f8e1e5]" : "bg-cream opacity-60";
          return (
            <button
              key={option}
              type="button"
              disabled={locked || cut}
              data-testid="choice-option"
              data-removed={cut || undefined}
              onClick={() => onAnswer(i)}
              className={`min-h-11 rounded-lg border-[3px] border-ink px-3 py-2 text-left font-semibold ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
