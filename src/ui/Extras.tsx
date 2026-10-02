import { extrasOf } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { useDialog } from "./useDialog";

/**
 * จอตัวอย่างและวิดีโอเสริมของหัวข้อ (ห้องเรียนของแมพ 1): รายการที่ครูกำหนดใน src/content/extras.json
 * ไม่ใช่เนื้อหาจาก course.json ไม่บังคับดู ไม่มีผลต่อความคืบหน้า ลิงก์เปิดในแท็บใหม่
 */
export function Extras() {
  const room = useGameStore((s) => s.room) as number;
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const title = fmt(ui.extras.title, { n: room });
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="extras">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="panel flex w-full max-w-xl flex-col gap-3 p-3 sm:p-4">
        <h2 className="text-lg font-extrabold text-teal-dark">🎬 {title}</h2>
        <p className="text-sm text-slate">{ui.extras.intro}</p>
        <ul className="flex flex-col gap-2">
          {extrasOf(room).map((extra) => (
            <li key={extra.url} className="flex items-center gap-2 rounded-lg border-[3px] border-ink bg-paper p-2">
              <span className="min-w-0 flex-1 font-semibold">{extra.title}</span>
              <a href={extra.url} target="_blank" rel="noopener noreferrer" className="btn !min-h-10 shrink-0 text-sm" data-testid="extras-link">
                {ui.extras.open}
              </a>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost self-end" data-testid="extras-close" onClick={closeOverlay}>
          {ui.extras.close}
        </button>
      </div>
    </div>
  );
}
