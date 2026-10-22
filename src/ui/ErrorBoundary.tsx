import { Component, type ErrorInfo, type ReactNode } from "react";
import { ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { useDialog } from "./useDialog";

/** ข้อความแทนหน้าต่างที่พัง: ปิดแล้วกลับไปเล่นต่อได้ เกมด้านหลังไม่ถูกล้าง */
function OverlayFailed() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/85 p-3" data-testid="overlay-failed">
      <div ref={dialog} role="alertdialog" aria-modal="true" aria-label={ui.errors.overlayTitle} tabIndex={-1} className="panel flex max-w-md flex-col gap-3 p-4">
        <h2 className="text-lg font-extrabold text-wrong">{ui.errors.overlayTitle}</h2>
        <p className="text-sm text-slate">{ui.errors.overlayBody}</p>
        <button type="button" className="btn self-end" data-testid="overlay-failed-close" onClick={closeOverlay}>
          {ui.errors.close}
        </button>
      </div>
    </div>
  );
}

/**
 * กันข้อผิดพลาดของหน้าต่างหนึ่งบาน (GDD ข้อ 10): ถ้าหน้าต่างเรนเดอร์พัง ขึ้นข้อความพร้อมปุ่มปิดแทน
 * เกมด้านหลังเล่นต่อได้ ไม่เป็นจอเปล่าทั้งหน้า เปลี่ยนหน้าต่างแล้วลองใหม่ (resetKey)
 */
export class OverlayBoundary extends Component<{ children: ReactNode; resetKey: string | null }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`หน้าต่างเรนเดอร์ไม่สำเร็จ: ${error.message}`, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey: string | null }): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    return this.state.failed ? <OverlayFailed /> : this.props.children;
  }
}

/** กันข้อผิดพลาดของทั้งแอป: ถ้าพังจริงขึ้นข้อความและปุ่มโหลดใหม่ แทนจอเปล่า (ความคืบหน้าถูกบันทึกไว้แล้ว) */
export class RootBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`เกมพัง: ${error.message}`, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-dvh items-center justify-center bg-ink p-4" data-testid="root-failed">
        <div className="panel flex max-w-md flex-col gap-3 p-4">
          <h1 className="text-lg font-extrabold text-wrong">{ui.errors.rootTitle}</h1>
          <p className="text-sm text-slate">{ui.errors.rootBody}</p>
          <button type="button" className="btn self-end" onClick={() => window.location.reload()}>
            {ui.errors.reload}
          </button>
        </div>
      </div>
    );
  }
}
