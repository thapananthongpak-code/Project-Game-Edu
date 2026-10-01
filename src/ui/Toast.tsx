import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";

const TOAST_MS = 2600;

export function Toast() {
  const toast = useGameStore((s) => s.toast);
  const clearToast = useGameStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => clearToast(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-3" role="status" data-testid="toast">
      <div className="rounded-lg border-[3px] border-ink bg-hint px-4 py-2 text-sm font-bold shadow-[0_3px_0_0_#1a1c2c]">{toast.text}</div>
    </div>
  );
}
