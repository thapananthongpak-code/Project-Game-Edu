import { ui } from "../content/ui-strings";
import { BASE_HEIGHT, BASE_WIDTH } from "../game/constants";
import { useGameStore } from "../state/gameStore";
import { useCanvasRect } from "./useCanvasRect";

const TONE = {
  default: "bg-hint text-ink",
  done: "bg-correct text-ink",
  locked: "bg-steel text-paper",
} as const;

/** ป้ายและคำแนะนำการโต้ตอบที่วางทับฉากเกม ข้อความแสดงด้วยฟอนต์ของเบราว์เซอร์ ไม่อยู่ในภาพพิกเซล */
export function StageOverlay({ touch }: { touch: boolean }) {
  const ready = useGameStore((s) => s.ready);
  const labels = useGameStore((s) => s.labels);
  const prompt = useGameStore((s) => s.prompt);
  const overlay = useGameStore((s) => s.overlay);
  const rect = useCanvasRect(ready);
  if (!rect) return null;
  // ขนาดตัวอักษรของป้ายตามอัตราขยายของฉาก ไม่เล็กกว่าที่อ่านได้
  const labelSize = Math.max(12, (rect.width / BASE_WIDTH) * 6.5);

  return (
    <div className="pointer-events-none fixed z-10" style={rect}>
      {labels.map((label) => (
        <span
          key={label.id}
          className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border-2 border-ink px-[0.5em] font-bold leading-[1.5] ${TONE[label.tone ?? "default"]}`}
          style={{ fontSize: labelSize, left: `${(label.x / BASE_WIDTH) * 100}%`, top: `${(label.y / BASE_HEIGHT) * 100}%` }}
        >
          {label.text}
        </span>
      ))}
      {prompt && overlay === null && (
        <div
          className="absolute bottom-[4%] left-1/2 max-w-[92%] -translate-x-1/2 truncate rounded-lg border-[3px] border-ink bg-cream px-3 py-1 text-sm font-semibold shadow-[0_3px_0_0_#1a1c2c]"
          data-testid="prompt"
        >
          <span className="mr-2 rounded border-2 border-ink bg-hint px-1.5 text-xs font-extrabold">
            {touch ? ui.hud.touchAction + " A" : ui.hud.action + " E"}
          </span>
          {prompt}
        </div>
      )}
    </div>
  );
}
