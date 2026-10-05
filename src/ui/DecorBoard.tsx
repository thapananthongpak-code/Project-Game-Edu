import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { BASE_HEIGHT, BASE_WIDTH, MAP_COLS, MAP_ROWS, MAP_TOP, TILE } from "../game/constants";
import { baseMapOf, DECOR_LIMIT, decorWidth, openCells, type Piece as RoomPiece, pillarsIn, type PlaceError, type Station, stationCells, stationsIn } from "../game/decor";
import { decorAreaOf, difficultyOf, useGameStore } from "../state/gameStore";
import { arrangedBase, decorIn, layoutIn, ownedDecor, ownedThemes, themeIn } from "../state/shop";
import { DECOR, type Decor, type Theme, THEMES } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
/** สิ่งที่ปรับแต่งในหน้านี้: ของตกแต่ง จุดใช้งานเริ่มต้นของห้อง หรือธีมสีของพื้นและผนัง */
const MODES = ["decor", "station", "theme"] as const;
type Mode = (typeof MODES)[number];
const MODE_ICON: Record<Mode, string> = { decor: "🪑", station: "🔧", theme: "🎨" };
/** แถวของผนังด้านบน: ของติดผนังวางที่แถวนี้เสมอ */
const WALL_ROW = 1;

interface Area {
  left: number;
  top: number;
  cell: number;
}

/** ชิ้นที่จัดวางได้ในหัวข้อที่เปิดอยู่ (ของตกแต่งหรือจุดใช้งาน) พร้อมตำแหน่งบนผัง */
interface Piece {
  id: string;
  col: number;
  row: number;
  width: number;
  /** ความสูงของกรอบบนผังเป็นจำนวนช่อง (ของติดผนัง 1 ช่อง ของตั้งพื้น 2 ช่อง) */
  tall: number;
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
 * กระดานตกแต่ง (GDD ข้อ 19): จัดห้องเองบนฉากจริงของโถงหรือโรงเก็บหุ่น มี 3 หัวข้อ
 * - ของตกแต่ง: ลากของที่มีไปวางได้อิสระ จำกัดจำนวนชิ้นต่อห้อง ของชิ้นหนึ่งวางได้ครั้งเดียวต่อห้อง
 * - ย้ายจุดใช้งาน: ย้ายร้าน กระดาน แท่น ฯลฯ ที่เป็นค่าเริ่มต้นของห้องไปตำแหน่งที่เลือกเอง (ประตูและตู้กระจกเก็บแกนย้ายไม่ได้)
 * - ธีมสี: เปลี่ยนพื้นและผนังของห้องเป็นธีมที่ซื้อจากร้าน
 * ทุกอย่างวางได้เฉพาะจุดที่ว่างและไม่บังทางเดินไปจุดใช้งาน ไม่มีผลต่อการเล่น
 * ใช้ได้ 3 ทาง: ลากไปวาง, แตะชิ้นแล้วแตะจุดที่ต้องการ, หรือคีย์บอร์ด (ลูกศรเลื่อนกรอบ Enter วางหรือหยิบ Delete เอาของตกแต่งออก)
 */
export function DecorBoard() {
  const map = useGameStore(difficultyOf);
  const room = useGameStore(decorAreaOf);
  const shop = useGameStore((s) => s.shop);
  const placeDecor = useGameStore((s) => s.placeDecor);
  const removeDecor = useGameStore((s) => s.removeDecor);
  const moveStation = useGameStore((s) => s.moveStation);
  const resetLayout = useGameStore((s) => s.resetLayout);
  const setTheme = useGameStore((s) => s.setTheme);
  const openShop = useGameStore((s) => s.openShop);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const area = useMapArea();
  const [mode, setMode] = useState<Mode>("decor");
  /** ชิ้นที่ถืออยู่: ของตกแต่ง (หัวข้อของตกแต่ง) หรือจุดใช้งาน (หัวข้อย้ายจุดใช้งาน) */
  const [held, setHeld] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ col: 9, row: 5 });
  const [notice, setNotice] = useState<string>(ui.decor.howTo);
  const [onTop, setOnTop] = useState(false);
  /** การลากที่กำลังเกิด: ชิ้นที่ลาก ตำแหน่งของนิ้วหรือเมาส์ และลากไปไกลพอจะนับเป็นการลากแล้วหรือยัง */
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);
  /** เพิ่งปล่อยจากการลาก: เบราว์เซอร์ส่ง click ตามมา ต้องไม่นับเป็นการแตะช่อง */
  const dragged = useRef(false);

  const kind = room ?? "hall";
  const base = useMemo(() => baseMapOf(map, kind), [map, kind]);
  const layout = useMemo(() => layoutIn(shop, map, kind), [shop, map, kind]);
  /** ผังที่ย้ายจุดใช้งานแล้ว: กติกาของตกแต่งตรวจกับผังนี้ */
  const arranged = useMemo(() => arrangedBase(shop, map, kind), [shop, map, kind]);
  const placed = useMemo(() => decorIn(shop, map, kind), [shop, map, kind]);
  const stations = useMemo(() => stationsIn(base), [base]);
  /** เสาและผนังกั้นกลางห้อง: ย้ายได้ในหัวข้อเดียวกับจุดใช้งาน ตำแหน่งล่าสุดอยู่ใน layout */
  const pillars = useMemo(() => pillarsIn(base).map((pillar) => ({ ...pillar, ...(layout[pillar.id] ?? {}) })), [base, layout]);
  const movable = useMemo<string[]>(() => [...stations, ...pillars.map((pillar) => pillar.id)], [stations, pillars]);
  const theme = themeIn(shop, map, kind);
  const themes = ownedThemes(shop);
  const owned = ownedDecor(shop);
  const limit = DECOR_LIMIT[kind];
  const title = fmt(ui.decor.title[kind], { map: ui.difficulty[map].name });
  const moving = mode === "station";

  const stationObject = (station: string) => arranged.objects.find((object) => object.kind === station);
  const pillarOf = (id: string) => pillars.find((pillar) => pillar.id === id);
  /** ชื่อของเสา: ชิ้นที่ยาวตั้งแต่ 3 ช่องเรียกว่าผนังกั้น เลขนับแยกกันตามลำดับในห้อง */
  const pillarName = (id: string): string => {
    const wide = (pillarOf(id)?.w ?? 1) >= 3;
    const same = pillars.filter((pillar) => pillar.w >= 3 === wide);
    return fmt(wide ? ui.decor.partition : ui.decor.pillar, { n: same.findIndex((pillar) => pillar.id === id) + 1 });
  };
  const nameOf = (id: string): string => (!moving ? ui.shop.items[`decor-${id}` as ItemId].name : pillarOf(id) ? pillarName(id) : ui.decor.stations[id as Station]);
  /** ภาพของชิ้น (เสาเป็นส่วนของผนัง ไม่มีภาพของตัวเอง แสดงเป็นแท่งสีแทน) */
  const imageOf = (id: string): string | null => (!moving ? art.decor(id as Decor) : pillarOf(id) ? null : art.prop(stationObject(id)?.prop ?? ""));
  const isWall = (id: string): boolean => !moving && DECOR[id as Decor].size === "wall";
  const widthOf = (id: string): number => (!moving ? decorWidth(id as Decor) : (pillarOf(id)?.w ?? stationObject(id)?.w ?? 1));
  /** ชิ้นที่อยู่บนฉากในหัวข้อที่เปิดอยู่ */
  const pieces: Piece[] = moving
    ? [
        ...stations.flatMap((station) => {
          const object = stationObject(station);
          return object ? [{ id: station, col: object.col, row: object.row, width: object.w ?? 1, tall: 2 }] : [];
        }),
        ...pillars.map((pillar) => ({ id: pillar.id, col: pillar.col, row: pillar.row, width: pillar.w, tall: 1 })),
      ]
    : mode === "decor"
      ? placed.map((p) => ({ id: p.decor, col: p.col, row: p.row, width: decorWidth(p.decor), tall: DECOR[p.decor].size === "wall" ? 1 : 2 }))
      : [];
  /** ช่องที่วางชิ้นที่ถืออยู่ได้ (ของตกแต่งที่กำลังย้ายไม่นับตัวมันเอง) */
  const open = useMemo(() => {
    if (!held) return [];
    if (mode === "station") return stationCells(base, layout, placed, held as RoomPiece);
    return mode === "decor" ? openCells(arranged, kind, placed.filter((p) => p.decor !== held), held as Decor) : [];
  }, [held, mode, base, layout, arranged, kind, placed]);
  const openKeys = useMemo(() => new Set(open.map((cell) => `${cell.col},${cell.row}`)), [open]);

  // ห้องเรียนตกแต่งไม่ได้: ปิดหน้าต่างนี้ทันที
  useEffect(() => {
    if (room === null) closeOverlay();
  }, [room, closeOverlay]);

  const idle = (next: Mode): string => (next === "station" ? ui.decor.stationHowTo : next === "theme" ? ui.decor.themeHowTo : ui.decor.howTo);
  const switchMode = (next: Mode) => {
    setMode(next);
    setHeld(null);
    setNotice(idle(next));
    // ย้ายจุดใช้งาน: แถบนี้บังได้ทั้งแถวบนหรือแถวล่างของห้อง เลื่อนไปด้านที่บังจุดใช้งานน้อยกว่า (ผู้เล่นย้ายแถบเองได้อีก)
    if (next === "station") {
      const rows = [...stations.map((station) => stationObject(station)?.row ?? 0), ...pillars.map((pillar) => pillar.row)];
      setOnTop(rows.filter((row) => row >= 7).length > rows.filter((row) => row <= 3).length);
    }
  };
  const holdingText = (id: string) => fmt(moving ? ui.decor.stationHolding : ui.decor.holding, { name: nameOf(id) });

  const fail = (error: PlaceError | "owned" | "room") => {
    playSfx("wrong");
    if (moving) return setNotice(ui.decor.stationErrors[error === "access" || error === "blocks" ? error : "floor"]);
    setNotice(ui.decor.errors[error === "owned" || error === "room" ? "floor" : error]);
  };

  /** วางชิ้นที่ถืออยู่ลงที่ช่องนี้ (ของติดผนังเกาะแถวผนังเสมอ) */
  const drop = (id: string, col: number, row: number) => {
    if (moving) {
      const error = moveStation(id as RoomPiece, col, row);
      if (error) return fail(error);
      playSfx("equip");
      setHeld(null);
      return setNotice(fmt(ui.decor.stationMoved, { name: nameOf(id) }));
    }
    const decor = id as Decor;
    const error = placeDecor({ decor, col, row: isWall(id) ? WALL_ROW : row });
    if (error) return fail(error);
    playSfx("equip");
    setHeld(null);
    setNotice(fmt(ui.decor.placed, { name: nameOf(id), n: placed.filter((p) => p.decor !== decor).length + 1, limit }));
  };

  const take = (decor: Decor) => {
    removeDecor(decor);
    playSfx("click");
    setHeld(null);
    setNotice(fmt(ui.decor.removed, { name: nameOf(decor) }));
  };

  /** ชิ้นที่อยู่ในช่องนี้ (ชิ้นที่กว้างหลายช่องนับทุกช่อง) */
  const pieceAt = (col: number, row: number): string | null => pieces.find((p) => p.row === row && col >= Math.floor(p.col) && col < Math.ceil(p.col + p.width))?.id ?? null;
  /** ชิ้นที่ผู้เล่นชี้: ช่องของฐาน หรือ (ของติดผนัง) ช่องเหนือแถวผนัง */
  const pointedAt = (col: number, row: number): string | null => pieceAt(col, row) ?? (!moving && row <= WALL_ROW ? pieceAt(col, WALL_ROW) : null);

  /** แตะหรือกด Enter ที่ช่อง: ถืออยู่ = วาง, ไม่ถือ = หยิบชิ้นในช่องนั้นขึ้นมาย้าย */
  const act = (col: number, row: number) => {
    if (held) return drop(held, col, row);
    const id = pointedAt(col, row);
    if (!id) return setNotice(moving ? ui.decor.stationPickFirst : ui.decor.pickFirst);
    setHeld(id);
    setNotice(holdingText(id));
  };

  const cellOf = (clientX: number, clientY: number): { col: number; row: number } | null => {
    if (!area) return null;
    const col = Math.floor((clientX - area.left) / area.cell);
    const row = Math.floor((clientY - area.top) / area.cell);
    return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS ? { col, row } : null;
  };

  // การลาก: เริ่มจากชิ้นในแถบหรือชิ้นที่อยู่บนฉาก ตามนิ้วไปจนปล่อย ปล่อยบนฉาก = วาง ปล่อยนอกฉาก = ยกเลิก
  const startDrag = (id: string) => (event: PointerEvent) => {
    drag.current = { id, startX: event.clientX, startY: event.clientY, moved: false };
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 8) return;
      if (!current.moved) {
        current.moved = true;
        setHeld(current.id);
        setNotice(holdingText(current.id));
      }
      setGhost({ id: current.id, x: event.clientX, y: event.clientY });
    };
    const up = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      drag.current = null;
      setGhost(null);
      if (!current?.moved) return;
      dragged.current = true;
      window.setTimeout(() => (dragged.current = false), 0);
      const cell = cellOf(event.clientX - ((widthOf(current.id) - 1) * (area?.cell ?? 0)) / 2, event.clientY);
      if (cell) drop(current.id, cell.col, cell.row);
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
    // กดบนชิ้นที่อยู่บนฉาก (ตอนยังไม่ถืออะไร) = เริ่มลากชิ้นนั้น
    const id = held ? null : pointedAt(cell.col, cell.row);
    if (id) startDrag(id)(event);
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
    } else if (!moving && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      const id = held && placed.some((p) => p.decor === held) ? held : pieceAt(cursor.col, cursor.row);
      if (id) take(id as Decor);
    }
  };

  if (room === null) return null;
  const box = (col: number, row: number, width = 1, tall = 1) =>
    area ? { left: col * area.cell, top: (row - (tall - 1)) * area.cell, width: width * area.cell, height: tall * area.cell } : undefined;
  const heldPlaced = !moving && held !== null && placed.some((p) => p.decor === held);
  const pickButton = "flex min-h-14 min-w-20 shrink-0 touch-none select-none flex-col items-center justify-center rounded-lg border-[3px] border-ink px-1 text-xs font-bold";
  /** ปุ่มของชิ้นในแถบ: แตะเพื่อถือ หรือกดค้างแล้วลากไปวาง */
  const pick = (id: string, testId: string, down: boolean) => (
    <button
      key={id}
      type="button"
      aria-pressed={held === id}
      data-testid={testId}
      data-placed={down}
      onPointerDown={startDrag(id)}
      onClick={() => {
        const next = held === id ? null : id;
        setHeld(next);
        setNotice(next ? holdingText(next) : idle(mode));
      }}
      className={`${pickButton} ${held === id ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : down ? "bg-teal-light" : "bg-cream hover:bg-teal-light"}`}
    >
      {imageOf(id) ? (
        <img src={imageOf(id) ?? ""} alt="" draggable={false} className="pixelated pointer-events-none h-9 w-12 object-contain" />
      ) : (
        <span aria-hidden="true" className="pointer-events-none flex h-9 items-center text-2xl">
          🧱
        </span>
      )}
      <span className="whitespace-nowrap">
        {down && !moving ? "✓ " : ""}
        {nameOf(id)}
      </span>
    </button>
  );
  const themeButton = (id: Theme | null, tileset: string, name: string) => (
    <button
      key={id ?? "default"}
      type="button"
      aria-pressed={theme === id}
      data-testid={`theme-pick-${id ?? "default"}`}
      onClick={() => {
        setTheme(id);
        playSfx("equip");
        setNotice(fmt(ui.decor.themeSet, { name }));
      }}
      className={`${pickButton} ${theme === id ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-cream hover:bg-teal-light"}`}
    >
      <img src={art.tiles(tileset)} alt="" draggable={false} className="pixelated pointer-events-none h-9 w-9 rounded-sm border-2 border-ink" />
      <span className="whitespace-nowrap">
        {theme === id ? "✓ " : ""}
        {name}
      </span>
    </button>
  );

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-30"
      data-testid="decor"
      data-map={map}
      data-room={kind}
      data-mode={mode}
      data-held={held ?? ""}
      data-count={placed.length}
      data-limit={limit}
      data-placed={placed.map((p) => `${p.decor}@${p.col},${p.row}`).join(";")}
      data-layout={[...stations.map((station) => `${station}@${stationObject(station)?.col},${stationObject(station)?.row}`), ...pillars.map((pillar) => `${pillar.id}@${pillar.col},${pillar.row}`)].join(";")}
      data-theme={theme ?? "default"}
    >
      {/* ชั้นจัดวางทับบนฉากจริง: สิ่งที่วางแล้วเห็นในฉากทันที ชั้นนี้แสดงช่องที่วางได้ กรอบของแต่ละชิ้น และกรอบเลือกของคีย์บอร์ด */}
      {area && mode !== "theme" && (
        <div
          role="application"
          tabIndex={0}
          aria-label={moving ? ui.decor.stationGrid : ui.decor.grid}
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
              return <span key={cellKey} aria-hidden="true" className="pointer-events-none absolute bg-correct/20" style={box(col, row, widthOf(held))} />;
            })}
          {pieces.map((p) => (
            <span
              key={p.id}
              aria-hidden="true"
              data-testid={`${moving ? "station" : "decor"}-item-${p.id}`}
              className={`pointer-events-none absolute rounded-sm border-2 border-dashed ${held === p.id ? "border-hint bg-hint/30" : "border-paper/80"}`}
              style={box(p.col, p.row, p.width, p.tall)}
            />
          ))}
          <span aria-hidden="true" className="pointer-events-none absolute border-[3px] border-ink shadow-[0_0_0_2px_#ffcd75]" style={box(cursor.col, cursor.row, held ? widthOf(held) : 1)} data-testid="decor-cursor" />
        </div>
      )}
      {ghost && area && imageOf(ghost.id) && (
        <img src={imageOf(ghost.id) ?? ""} alt="" aria-hidden="true" className="pixelated pointer-events-none fixed opacity-80" style={{ left: ghost.x - (widthOf(ghost.id) * area.cell) / 2, top: ghost.y - area.cell * 1.5, width: widthOf(ghost.id) * area.cell }} />
      )}
      {ghost && area && !imageOf(ghost.id) && (
        <span aria-hidden="true" className="pointer-events-none fixed rounded-md border-[3px] border-ink bg-slate/80" style={{ left: ghost.x - (widthOf(ghost.id) * area.cell) / 2, top: ghost.y - area.cell / 2, width: widthOf(ghost.id) * area.cell, height: area.cell }} />
      )}

      {/* แถบจัดห้อง: อยู่ล่างจอ ย้ายขึ้นบนได้เมื่อบังจุดที่อยากวาง */}
      <div className={`panel absolute inset-x-2 mx-auto flex max-w-3xl flex-col gap-1.5 p-2 ${onTop ? "top-14" : "bottom-2"}`} data-testid="decor-panel" data-top={onTop}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-teal-dark">🎨 {title}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {mode === "decor" && (
              <span className="rounded-md border-2 border-ink bg-hint px-2 py-0.5 text-sm font-extrabold" data-testid="decor-count">
                {fmt(ui.decor.count, { n: placed.length, limit })}
              </span>
            )}
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
        {/* หัวข้อของการจัดห้อง: ปุ่มปรับแต่งอยู่ที่หัวของแถบนี้เลย */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={ui.decor.modesLabel}>
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              data-testid={`decor-mode-${item}`}
              onClick={() => switchMode(item)}
              className={`min-h-9 rounded-lg border-[3px] border-ink px-3 text-sm font-extrabold ${mode === item ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
            >
              <span aria-hidden="true">{MODE_ICON[item]}</span> {ui.decor.modes[item]}
            </button>
          ))}
        </div>
        <p id="decor-notice" className="min-h-5 text-sm font-bold text-teal-dark" role="status" data-testid="decor-notice">
          {notice}
        </p>
        {mode === "decor" && (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={ui.decor.palette}>
              {owned.map((decor) => pick(decor, `decor-pick-${decor}`, placed.some((p) => p.decor === decor)))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" disabled={!heldPlaced} data-testid="decor-remove" onClick={() => held && take(held as Decor)}>
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
          </>
        )}
        {mode === "station" && (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={ui.decor.stationPalette}>
              {movable.map((id) => pick(id, `station-pick-${id}`, layout[id as RoomPiece] !== undefined))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="btn btn-ghost !min-h-9 !px-2 text-xs"
                disabled={Object.keys(layout).length === 0}
                data-testid="station-reset"
                onClick={() => {
                  resetLayout();
                  setHeld(null);
                  setNotice(ui.decor.layoutReset);
                }}
              >
                {ui.decor.resetLayout}
              </button>
              <span className="text-xs text-slate">{ui.decor.stationKeys}</span>
            </div>
          </>
        )}
        {mode === "theme" && (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={ui.decor.themePalette}>
              {themeButton(null, base.tileset, ui.decor.themeDefault)}
              {themes.map((id) => themeButton(id, THEMES[id].tileset, ui.shop.items[`theme-${id}` as ItemId].name))}
            </div>
            {themes.length === 0 && <p className="text-xs text-slate">{ui.decor.themeNone}</p>}
          </>
        )}
      </div>
    </div>
  );
}
