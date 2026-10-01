import { useEffect, useState } from "react";

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** ตำแหน่งและขนาดของ canvas เกมบนหน้าจอ ใช้วางป้าย HTML ทับฉากให้ตรงพิกัด */
export function useCanvasRect(ready: boolean): CanvasRect | null {
  const [rect, setRect] = useState<CanvasRect | null>(null);

  useEffect(() => {
    if (!ready) return;
    const canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");
    if (!canvas) return;
    const measure = () => {
      const r = canvas.getBoundingClientRect();
      setRect((old) =>
        old && old.left === r.left && old.top === r.top && old.width === r.width && old.height === r.height
          ? old
          : { left: r.left, top: r.top, width: r.width, height: r.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ready]);

  return rect;
}
