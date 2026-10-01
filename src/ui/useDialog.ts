import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** หน้าต่างที่เปิดซ้อนกันอยู่ ตัวท้ายสุดคือตัวบนสุดและเป็นตัวเดียวที่จับโฟกัส */
const stack: HTMLElement[] = [];

/**
 * พฤติกรรมของหน้าต่างแบบ modal สำหรับผู้ใช้คีย์บอร์ดและโปรแกรมอ่านจอ:
 * ย้ายโฟกัสเข้าหน้าต่างเมื่อเปิด วน Tab อยู่ในหน้าต่าง (ไม่หลุดไปปุ่มของเกมที่อยู่ข้างหลัง) คืนโฟกัสให้จุดเดิมเมื่อปิด
 * และปิดด้วย Esc เมื่อส่ง onEscape มา ใช้คู่กับ role="dialog" aria-modal="true" และ tabIndex={-1} บน element ที่ได้ ref นี้
 */
export function useDialog<T extends HTMLElement>(onEscape?: () => void) {
  const ref = useRef<T>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(node);
    node.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== node) return;
      if (event.key === "Escape" && escape.current) {
        event.stopPropagation();
        return escape.current();
      }
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null && !el.closest("[inert]"));
      if (items.length === 0) {
        event.preventDefault();
        return node.focus({ preventScroll: true });
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // โฟกัสหลุดออกนอกหน้าต่าง (เช่น ปุ่มที่กดถูกแทนที่ด้วยโจทย์ข้อใหม่) ให้กลับเข้ามาที่ตัวแรกหรือตัวสุดท้าย
      const outside = !active || active === node || !node.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    // จับที่ document ในช่วง capture เพื่อให้ทำงานแม้โฟกัสอยู่นอกหน้าต่าง และมาก่อนตัวจับปุ่มของเกม
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      stack.splice(stack.indexOf(node), 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return ref;
}
