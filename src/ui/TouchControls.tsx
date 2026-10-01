import { ui } from "../content/ui-strings";
import { touchInput } from "../state/input";

const PAD = [
  { label: ui.touch.up, glyph: "▲", x: 0, y: -1, position: "col-start-2 row-start-1" },
  { label: ui.touch.left, glyph: "◀", x: -1, y: 0, position: "col-start-1 row-start-2" },
  { label: ui.touch.right, glyph: "▶", x: 1, y: 0, position: "col-start-3 row-start-2" },
  { label: ui.touch.down, glyph: "▼", x: 0, y: 1, position: "col-start-2 row-start-3" },
] as const;

const BUTTON = "flex items-center justify-center rounded-xl border-[3px] border-ink bg-cream/85 shadow-[0_0_0_2px_rgba(244,244,244,0.45)] text-lg font-bold text-ink active:bg-hint";

/** ปุ่มสัมผัสสำหรับมือถือ: ปุ่มทิศทาง 4 ปุ่ม และปุ่มโต้ตอบ A */
export function TouchControls() {
  const hold = (x: number, y: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ไม่มี capture ก็ยังปล่อยปุ่มได้จาก pointerup/pointercancel
      }
      if (x !== 0) touchInput.x = x;
      if (y !== 0) touchInput.y = y;
    },
    onPointerUp: () => release(x, y),
    onPointerCancel: () => release(x, y),
    onLostPointerCapture: () => release(x, y),
  });
  const release = (x: number, y: number) => {
    if (x !== 0 && touchInput.x === x) touchInput.x = 0;
    if (y !== 0 && touchInput.y === y) touchInput.y = 0;
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex select-none items-end justify-between p-3 pb-[max(12px,env(safe-area-inset-bottom))]" data-testid="touch-controls">
      <div className="pointer-events-auto grid touch-none grid-cols-3 grid-rows-3 gap-1">
        {PAD.map((button) => (
          <button key={button.label} type="button" tabIndex={-1} aria-label={button.label} className={`${BUTTON} h-12 w-12 ${button.position}`} {...hold(button.x, button.y)}>
            {button.glyph}
          </button>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label={ui.hud.touchAction}
        className={`${BUTTON} pointer-events-auto h-16 w-16 touch-none !rounded-full !bg-hint/90 text-2xl`}
        onPointerDown={() => {
          touchInput.action = true;
        }}
      >
        A
      </button>
    </div>
  );
}
