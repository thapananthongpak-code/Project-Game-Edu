import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useRef, useState } from "react";

/** ของที่ลากหนึ่งชิ้น: slot = ช่องที่ของชิ้นนี้ใส่ได้ value = ชื่อของ from = ลากมาจากช่องที่ใส่อยู่ (ลากออกเพื่อถอด) */
export interface DragPayload {
  slot: string;
  value: string;
  from?: boolean;
}

interface Drag {
  payload: DragPayload;
  x: number;
  y: number;
  over: string | null;
}

const MOVE_THRESHOLD = 6;

/** ช่องปลายทางที่อยู่ใต้ตำแหน่งนี้ (องค์ประกอบที่มี data-drop) */
const dropAt = (x: number, y: number): string | null => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;

/**
 * ลากวางด้วยเมาส์หรือนิ้ว (pointer events): ลากของจากรายการไปวางบนช่องบนตัวหุ่นหรือตัวพี่บิต และลากออกจากช่องเพื่อถอด
 * ลากไม่ถึงระยะ = ถือว่าเป็นการกดตามปกติ (ปุ่มเดิมของรายการทำงานต่อไป) ผู้ใช้คีย์บอร์ดและผู้ที่ไม่ลากใช้ปุ่มเดิมได้ทั้งหมด
 * ภาพที่ลอยตามเคอร์เซอร์ (ghost) เป็นของตกแต่ง ไม่รับ pointer
 */
export function useGearDrag(onDrop: (payload: DragPayload, target: string | null) => void, ghostOf: (payload: DragPayload) => ReactNode) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<{ payload: DragPayload; x: number; y: number; active: boolean } | null>(null);
  const justDragged = useRef(false);

  const bind = useCallback(
    (payload: DragPayload) => ({
      onPointerDown: (event: ReactPointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        press.current = { payload, x: event.clientX, y: event.clientY, active: false };
        // จับ pointer ไว้ตั้งแต่กด: การเคลื่อนที่ออกนอกองค์ประกอบยังส่งมาที่นี่ (เมาส์) ปล่อยแล้วได้ตำแหน่งปลายทางจริง
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent) => {
        const current = press.current;
        if (!current) return;
        if (!current.active) {
          if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < MOVE_THRESHOLD) return;
          current.active = true;
        }
        setDrag({ payload: current.payload, x: event.clientX, y: event.clientY, over: dropAt(event.clientX, event.clientY) });
      },
      onPointerUp: (event: ReactPointerEvent) => {
        const current = press.current;
        press.current = null;
        if (!current?.active) return;
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
        setDrag(null);
        onDrop(current.payload, dropAt(event.clientX, event.clientY));
      },
      onPointerCancel: () => {
        press.current = null;
        setDrag(null);
      },
      // ลากเสร็จแล้วเบราว์เซอร์ยังส่งคลิกตามมา: ไม่ให้ปุ่มเดิมใส่ของซ้ำ
      onClickCapture: (event: { stopPropagation: () => void; preventDefault: () => void }) => {
        if (justDragged.current) {
          event.stopPropagation();
          event.preventDefault();
        }
      },
      // ภาพในรายการลากแบบเนทีฟของเบราว์เซอร์ได้เอง (ทำให้ pointer ถูกยกเลิก) จึงกันไว้
      onDragStart: (event: { preventDefault: () => void }) => event.preventDefault(),
      style: { touchAction: "none" as const, cursor: "grab" },
    }),
    [onDrop],
  );

  const ghost = drag ? (
    <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-90" style={{ left: drag.x, top: drag.y }} aria-hidden="true" data-testid="drag-ghost">
      {ghostOf(drag.payload)}
    </div>
  ) : null;

  return { bind, drag, ghost };
}
