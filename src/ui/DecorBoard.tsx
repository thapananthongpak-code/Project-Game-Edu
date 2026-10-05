import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { BASE_HEIGHT, BASE_WIDTH, MAP_COLS, MAP_ROWS, MAP_TOP, TILE } from "../game/constants";
import { baseMapOf, DECOR_LIMIT, type DecorPlacement, decorWidth, openCells, type PlaceError } from "../game/decor";
import { decorAreaOf, difficultyOf, useGameStore } from "../state/gameStore";
import { decorIn, ownedDecor } from "../state/shop";
import { DECOR, type Decor } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
const nameOf = (decor: Decor): string => ui.shop.items[`decor-${decor}` as ItemId].name;
const isWall = (decor: Decor): boolean => DECOR[decor].size === "wall";
/** แถวของผนังด้านบน: ของติดผนังวางที่แถวนี้เสมอ */
const WALL_ROW = 1;

interface Area {
  left: number;
  top: number;
  cell: number;
}

/** ตำแหน่งของผังห้อง (20×11 ช่อง) บนหน้าจอ: ตามขนาดจริงของ canvas ของเกม ปรับเมื่อจอเปลี่ยนขนาด */
function useMapArea(): Area | null {
  const [area, setArea] = useState<Area | null>(null);
  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-root canvas");
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / BASE_WIDTH;
      setArea({ left: rect.left, top: rect.top + (rect.height / BASE_HEIGHT) * MAP_TOP, cell: TILE * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return area;
}

/**
 * กระดานตกแต่ง (GDD ข้อ 19): ลากของตกแต่งที่มีไปวางบนฉากจริงของโถงหรือโรงเก็บหุ่นได้อิสระ ไม่มีช่องที่กำหนดไว้
 * วางได้ทุกจุดที่ว่างและไม่บังทางเดินไปจุดใช้งาน จำกัดจำนวนชิ้นต่อห้อง ของชิ้นหนึ่งวางได้ครั้งเดียวต่อห้อง ไม่มีผลต่อการเล่น
 * ใช้ได้ 3 ทาง: ลากจากแถบของไปวาง, แตะของแล้วแตะจุดที่ต้องการ, หรือคีย์บอร์ด (ลูกศรเลื่อนกรอบ Enter วางหรือหยิบ Delete เอาออก)
 */
export function DecorBoard() {
  const map = useGameStore(difficultyOf);
  const room = useGameStore(decorAreaOf);
  const shop = useGameStore((s) => s.shop);
  const placeDecor = useGameStore((s) => s.placeDecor);
  const removeDecor = useGameStore((s) => s.removeDecor);
  const openShop = useGameStore((s) => s.openShop);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const area = useMapArea();
  const [held, setHeld] = useState<Decor | null>(null);
  const [cursor, setCursor] = useState({ col: 9, row: 5 });
  const [notice, setNotice] = useState<string>(ui.decor.howTo);
  const [onTop, setOnTop] = useState(false);
  /** การลากที่กำลังเกิด: ของที่ลาก ตำแหน่งของนิ้วหรือเมาส์ และลากไปไกลพอจะนับเป็นการลากแล้วหรือยัง */
  const drag = useRef<{ decor: Decor; startX: number; startY: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ decor: Decor; x: number; y: number } | null>(null);
  /** เพิ่งปล่อยจากการลาก: เบราว์เซอร์ส่ง click ตามมา ต้องไม่นับเป็นการแตะช่อง */
  const dragged = useRef(false);

  const kind = room ?? "hall";
  const base = useMemo(() => baseMapOf(map, kind), [map, kind]);
  const placed = useMemo(() => decorIn(shop, map, kind), [shop, map, kind]);
  const owned = ownedDecor(shop);
  const limit = DECOR_LIMIT[kind];
  const title = fmt(ui.decor.title[kind], { map: ui.difficulty[map].name });
  /** ช่องที่วางของที่ถืออยู่ได้ (ไม่นับตัวมันเองถ้ากำลังย้าย) */
  const open = useMemo(() => (held ? openCells(base, kind, placed.filter((p) => p.decor !== held), held) : []), [held, base, kind, placed]);
  const openKeys = useMemo(() => new Set(open.map((cell) => `${cell.col},${cell.row}`)), [open]);

  // ห้องเรียนตกแต่งไม่ได้: ปิดหน้าต่างนี้ทันที
  useEffect(() => {
    if (room === null) closeOverlay();
  }, [room, closeOverlay]);

  const say = (error: PlaceError | "owned" | "room") => setNotice(ui.decor.errors[error === "owned" || error === "room" ? "floor" : error]);

  /** วางของที่ถืออยู่ลงที่ช่องนี้ (ของติดผนังเกาะแถวผนังเสมอ) */
  const drop = (decor: Decor, col: number, row: number) => {
    const target: DecorPlacement = { decor, col, row: isWall(decor) ? WALL_ROW : row };
    const error = placeDecor(target);
    if (error) {
      playSfx("wrong");
      return say(error);
    }
    playSfx("equip");
    setHeld(null);
    setNotice(fmt(ui.decor.placed, { name: nameOf(decor), n: placed.filter((p) => p.decor !== decor).length + 1, limit }));
  };

  const take = (decor: Decor) => {
    removeDecor(decor);
    playSfx("click");
    setHeld(null);
    setNotice(fmt(ui.decor.removed, { name: nameOf(decor) }));
  };

  /** ของที่วางอยู่ในช่องนี้ (ของ 2 ช่องนับทั้งสองช่อง) */
  const itemAt = (col: number, row: number): Decor | null => placed.find((p) => p.row === row && col >= p.col && col < p.col + decorWidth(p.decor))?.decor ?? null;

  /** แตะหรือกด Enter ที่ช่อง: ถือของอยู่ = วาง, ไม่ถือ = หยิบของในช่องนั้นขึ้นมาย้าย */
  const act = (col: number, row: number) => {
    if (held) return drop(held, col, row);
    const item = itemAt(col, row) ?? (row <= WALL_ROW ? itemAt(col, WALL_ROW) : null);
    if (!item) return setNotice(ui.decor.pickFirst);
    setHeld(item);
    setNotice(fmt(ui.decor.holding, { name: nameOf(item) }));
  };

  const cellOf = (clientX: number, clientY: number): { col: number; row: number } | null => {
    if (!area) return null;
    const col = Math.floor((clientX - area.left) / area.cell);
    const row = Math.floor((clientY - area.top) / area.cell);
    return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS ? { col, row } : null;
  };

  // การลาก: เริ่มจากของในแถบหรือของที่วางอยู่บนฉาก ตามนิ้วไปจนปล่อย ปล่อยบนฉาก = วาง ปล่อยนอกฉาก = ยกเลิก
  const startDrag = (decor: Decor) => (event: PointerEvent) => {
    drag.current = { decor, startX: event.clientX, startY: event.clientY, moved: false };
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 8) return;
      if (!current.moved) {
        current.moved = true;
        setHeld(current.decor);
        setNotice(fmt(ui.decor.holding, { name: nameOf(current.decor) }));
      }
      setGhost({ decor: current.decor, x: event.clientX, y: event.clientY });
    };
    const up = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      drag.current = null;
      setGhost(null);
      if (!current?.moved) return;
      dragged.current = true;
      window.setTimeout(() => (dragged.current = false), 0);
      const cell = cellOf(event.clientX - ((decorWidth(current.decor) - 1) * (area?.cell ?? 0)) / 2, event.clientY);
      if (cell) drop(current.decor, cell.col, cell.row);
      else setNotice(ui.decor.cancelled);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const onGridPointerDown = (event: PointerEvent) => {
    const cell = cellOf(event.clientX, event.clientY);
    if (!cell) return;
    setCursor(cell);
    // กดบนของที่วางอยู่ (ตอนยังไม่ถืออะไร) = เริ่มลากชิ้นนั้น
    const item = held ? null : (itemAt(cell.col, cell.row) ?? (cell.row <= WALL_ROW ? itemAt(cell.col, WALL_ROW) : null));
    if (item) startDrag(item)(event);
  };
  const onGridClick = (event: React.MouseEvent) => {
    if (dragged.current) return;
    const cell = cellOf(event.clientX, event.clientY);
    if (cell) act(cell.col, cell.row);
  };
  const onGridKey = (event: KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[event.key]) {
      event.preventDefault();
      const [dx, dy] = step[event.key];
      setCursor((at) => ({ col: Math.max(0, Math.min(MAP_COLS - 1, at.col + dx)), row: Math.max(WALL_ROW, Math.min(MAP_ROWS - 2, at.row + dy)) }));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      act(cursor.col, cursor.row);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const item = held && placed.some((p) => p.decor === held) ? held : itemAt(cursor.col, cursor.row);
      if (item) take(item);
    }
  };

  if (room === null) return null;
  const box = (col: number, row: number, width = 1, tall = 1) =>
    area ? { left: col * area.cell, top: (row - (tall - 1)) * area.cell, width: width * area.cell, height: tall * area.cell } : undefined;
  const heldPlaced = held !== null && placed.some((p) => p.decor === held);

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="fixed inset-0 z-30" data-testid="decor" data-map={map} data-room={kind} data-held={held ?? ""} data-count={placed.length} data-limit={limit} data-placed={placed.map((p) => `${p.decor}@${p.col},${p.row}`).join(";")}>
      {/* ชั้นจัดวางทับบนฉากจริง: ของที่วางแล้วเห็นในฉากทันที ชั้นนี้แสดงช่องที่วางได้ กรอบของชิ้นที่วาง และกรอบเลือกของคีย์บอร์ด */}
      {area && (
        <div
          role="application"
          tabIndex={0}
          aria-label={ui.decor.grid}
          aria-describedby="decor-notice"
          data-testid="decor-grid"
          data-cursor={`${cursor.col},${cursor.row}`}
          className="absolute touch-none outline-none focus-visible:ring-4 focus-visible:ring-hint"
          style={{ left: area.left, top: area.top, width: MAP_COLS * area.cell, height: MAP_ROWS * area.cell, cursor: held ? "copy" : "grab" }}
          onPointerDown={onGridPointerDown}
          onClick={onGridClick}
          onKeyDown={onGridKey}
        >
          {held &&
            [...openKeys].map((cellKey) => {
              const [col, row] = cellKey.split(",").map(Number);
              return <span key={cellKey} aria-hidden="true" className="pointer-events-none absolute bg-correct/20" style={box(col, row, decorWidth(held))} />;
            })}
          {placed.map((p) => (
            <span
              key={p.decor}
              aria-hidden="true"
              data-testid={`decor-item-${p.decor}`}
              className={`pointer-events-none absolute rounded-sm border-2 border-dashed ${held === p.decor ? "border-hint bg-hint/30" : "border-paper/80"}`}
              style={box(p.col, p.row, decorWidth(p.decor), isWall(p.decor) ? 1 : 2)}
            />
          ))}
          <span aria-hidden="true" className="pointer-events-none absolute border-[3px] border-ink shadow-[0_0_0_2px_#ffcd75]" style={box(cursor.col, cursor.row, held ? decorWidth(held) : 1)} data-testid="decor-cursor" />
        </div>
      )}
      {ghost && area && (
        <img src={art.decor(ghost.decor)} alt="" aria-hidden="true" className="pixelated pointer-events-none fixed opacity-80" style={{ left: ghost.x - (decorWidth(ghost.decor) * area.cell) / 2, top: ghost.y - area.cell * 1.5, width: decorWidth(ghost.decor) * area.cell }} />
      )}

      {/* แถบของตกแต่ง: อยู่ล่างจอ ย้ายขึ้นบนได้เมื่อบังจุดที่อยากวาง */}
      <div className={`panel absolute inset-x-2 mx-auto flex max-w-3xl flex-col gap-1.5 p-2 ${onTop ? "top-14" : "bottom-2"}`} data-testid="decor-panel" data-top={onTop}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-teal-dark">🎨 {title}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border-2 border-ink bg-hint px-2 py-0.5 text-sm font-extrabold" data-testid="decor-count">
              {fmt(ui.decor.count, { n: placed.length, limit })}
            </span>
            <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid="decor-flip" onClick={() => setOnTop((value) => !value)}>
              {onTop ? ui.decor.panelDown : ui.decor.panelUp}
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid="decor-to-shop" onClick={() => openShop()}>
              🛒 {ui.decor.toShop}
            </button>
            <button type="button" className="btn !min-h-9 !px-3 text-sm" data-testid="decor-close" onClick={closeOverlay}>
              {ui.decor.close}
            </button>
          </div>
        </div>
        <p id="decor-notice" className="min-h-5 text-sm font-bold text-teal-dark" role="status" data-testid="decor-notice">
          {notice}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={ui.decor.palette}>
          {owned.map((decor) => {
            const down = placed.some((p) => p.decor === decor);
            return (
              <button
                key={decor}
                type="button"
                aria-pressed={held === decor}
                data-testid={`decor-pick-${decor}`}
                data-placed={down}
                onPointerDown={startDrag(decor)}
                onClick={() => {
                  const next = held === decor ? null : decor;
                  setHeld(next);
                  setNotice(next ? fmt(ui.decor.holding, { name: nameOf(next) }) : ui.decor.howTo);
                }}
                className={`flex min-h-14 min-w-20 shrink-0 touch-none select-none flex-col items-center justify-center rounded-lg border-[3px] border-ink px-1 text-xs font-bold ${held === decor ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : down ? "bg-teal-light" : "bg-cream hover:bg-teal-light"}`}
              >
                <img src={art.decor(decor)} alt="" draggable={false} className="pixelated pointer-events-none h-9 w-12 object-contain" />
                <span className="whitespace-nowrap">
                  {down ? "✓ " : ""}
                  {nameOf(decor)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" disabled={!heldPlaced} data-testid="decor-remove" onClick={() => held && take(held)}>
            {ui.decor.remove}
          </button>
          <button
            type="button"
            className="btn btn-ghost !min-h-9 !px-2 text-xs"
            disabled={placed.length === 0}
            data-testid="decor-clear"
            onClick={() => {
              removeDecor(null);
              setHeld(null);
              setNotice(ui.decor.cleared);
            }}
          >
            {ui.decor.clear}
          </button>
          <span className="text-xs text-slate">{ui.decor.keys}</span>
        </div>
      </div>
    </div>
  );
}
