import { useEffect, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { CAMPAIGN, DIFFICULTIES, type Difficulty, mapIndex, topicsOf } from "../state/campaign";
import { difficultyOf, mapCleared, mapUnlocked, roomsOfMap, useGameStore } from "../state/gameStore";
import { art } from "./art";
import { useDialog } from "./useDialog";

/** ตำแหน่งของแต่ละแมพบนภาพพื้นแผนที่ (เปอร์เซ็นต์ของกรอบภาพ WM-05: ห้องแล็บทางซ้ายล่าง หุบเขากังหันลมตรงกลาง ภูเขาไฟป้อมปราการขวาบน) */
const SITES: Record<Difficulty, { x: number; y: number }> = {
  easy: { x: 19, y: 64 },
  normal: { x: 58, y: 64 },
  hard: { x: 66, y: 22 },
};

/** ไคจูของแต่ละแมพเรียงเป็นวงโค้งรอบสถานที่ (ครึ่งวงกลมด้านบนและข้าง) ระยะเป็นเปอร์เซ็นต์ของกรอบภาพ */
function kaijuSpot(map: Difficulty, index: number, count: number): { x: number; y: number } {
  const site = SITES[map];
  // มุมจาก 190° ถึง 350° (ครึ่งวงกลมด้านบนของสถานที่)
  const angle = Math.PI * (1.05 + (0.9 * index) / Math.max(1, count - 1));
  return { x: site.x + Math.cos(angle) * 13, y: site.y + Math.sin(angle) * 18 };
}

/** เวลาที่หมุดตัวละครเดินไปยังแมพปลายทาง (มิลลิวินาที) */
const WALK_MS = 900;

const prefersReducedMotion = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * กระดานแผนที่การเดินทาง (GDD ข้อ 15): แผนที่โลกภาพเดียว แมพ 1 → 2 → 3 เล่นต่อกันตามลำดับ
 * แมพถัดไปเปิดเมื่อชนะไคจูครบทุกด่านของแมพก่อนหน้า กลับไปแมพที่ผ่านแล้วได้เสมอ ความคืบหน้าของแต่ละแมพเก็บแยกกัน
 * กดสถานที่บนแผนที่เพื่อดูข้อมูล แล้วกด "เดินทาง" หมุดตัวละครจะเดินไปที่นั่นก่อนเปลี่ยนแมพ
 */
export function TravelMap() {
  const profile = useGameStore((s) => s.profile);
  const progress = useGameStore((s) => s.progress);
  const others = useGameStore((s) => s.others);
  const battles = useGameStore((s) => s.battles);
  const travel = useGameStore((s) => s.travel);
  const showToast = useGameStore((s) => s.showToast);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const state = { profile, progress, others, battles };
  const here = difficultyOf(state);
  const avatar = profile?.avatar ?? "a";
  const outfit = useGameStore((s) => s.shop.outfit);

  const [picked, setPicked] = useState<Difficulty>(here);
  // แมพที่หมุดกำลังเดินไป (null = อยู่นิ่งที่แมพปัจจุบัน)
  const [walkingTo, setWalkingTo] = useState<Difficulty | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const arrive = (map: Difficulty) => {
    if (!travel(map)) return;
    playSfx("door");
    showToast(fmt(ui.toast.traveled, { map: ui.difficulty[map].name }));
  };

  const go = (map: Difficulty) => {
    if (walkingTo !== null) return;
    if (prefersReducedMotion()) return arrive(map);
    setWalkingTo(map);
    timer.current = window.setTimeout(() => arrive(map), WALK_MS);
  };

  const info = (map: Difficulty) => {
    const level = CAMPAIGN[map];
    const topics = topicsOf(map);
    const rooms = roomsOfMap(state, map);
    const boss = level.battles[level.battles.length - 1];
    return {
      level,
      topics,
      boss,
      open: mapUnlocked(state, map),
      cleared: mapCleared(state, map),
      won: level.battles.filter((battle) => battles[battle.id]?.won).length,
      cores: topics.filter((topic) => rooms[topic]?.core).length,
      status: map === here ? ("here" as const) : mapUnlocked(state, map) ? ("open" as const) : ("locked" as const),
    };
  };

  const pin = SITES[walkingTo ?? here];
  const selected = info(picked);
  const lockedBy = ui.difficulty[DIFFICULTIES[Math.max(0, mapIndex(picked) - 1)]].name;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="travel" data-here={here}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.travel.title} tabIndex={-1} className="panel mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🗺 {ui.travel.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="travel-close" onClick={closeOverlay}>
            {ui.travel.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.travel.intro}</p>

        {/* แผนที่โลก: ภาพพื้นหลังเป็นของตกแต่ง สถานที่เป็นปุ่มจริงวางทับ ใช้ Tab และ Enter ได้ */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border-[3px] border-ink bg-teal-light" data-testid="travel-world">
          <img src={art.worldMap} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />
          {/* ไคจูของทุกแมพวางบนแผนที่: ชนะแล้ว = สีเต็มมีเครื่องหมายถูก, ด่านถัดไป = กระพริบ, ยังไม่ถึง = เงาดำ (ข้อมูลเดียวกับรายการในการ์ดด้านล่าง) */}
          {DIFFICULTIES.flatMap((map) => {
            const list = CAMPAIGN[map].battles;
            const next = mapUnlocked(state, map) ? list.find((battle) => !battles[battle.id]?.won)?.id : undefined;
            return list.map((battle, i) => {
              const spot = kaijuSpot(map, i, list.length);
              const won = battles[battle.id]?.won === true;
              const status = won ? "won" : battle.id === next ? "next" : "locked";
              return (
                <span
                  key={battle.id}
                  data-testid={`world-kaiju-${battle.id}`}
                  data-status={status}
                  aria-hidden="true"
                  style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  className={`travel-kaiju travel-kaiju-${status} pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-end justify-center overflow-hidden rounded-full border-2 border-ink sm:h-9 sm:w-9 ${battle.boss ? "bg-hint" : "bg-paper/90"}`}
                >
                  <img src={art.foe(battle.forms[battle.forms.length - 1].art)} alt="" className="pixelated h-full w-full object-contain" />
                  {won && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-correct-dark px-0.5 text-xs font-extrabold leading-none text-paper">✓</span>}
                </span>
              );
            });
          })}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {DIFFICULTIES.slice(1).map((map) => {
              const from = SITES[DIFFICULTIES[mapIndex(map) - 1]];
              const to = SITES[map];
              const lit = mapUnlocked(state, map);
              return (
                <line
                  key={map}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={lit ? "#ffcd75" : "#1a1c2c"}
                  strokeOpacity={lit ? 1 : 0.55}
                  strokeWidth={3}
                  strokeDasharray="1 2.4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {DIFFICULTIES.map((map) => {
            const site = SITES[map];
            const { status, cleared } = info(map);
            return (
              <button
                key={map}
                type="button"
                data-testid={`travel-${map}`}
                data-status={status}
                data-cleared={cleared}
                aria-pressed={picked === map}
                aria-label={`${ui.difficulty[map].name}: ${status === "here" ? ui.travel.here : status === "open" ? ui.travel.open : ui.travel.lockedShort}`}
                onClick={() => setPicked(map)}
                style={{ left: `${site.x}%`, top: `${site.y}%` }}
                className={`absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg border-[3px] px-1 pb-0.5 text-xs font-extrabold ${picked === map ? "border-ink bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "border-ink bg-paper/90 hover:bg-hint"}`}
              >
                <img src={art.foe(CAMPAIGN[map].battles[CAMPAIGN[map].battles.length - 1].forms[0].art)} alt="" className={`pixelated h-8 w-8 object-contain sm:h-11 sm:w-11 ${status === "locked" ? "opacity-50 grayscale" : ""}`} />
                <span className="whitespace-nowrap">
                  {status === "locked" && <span aria-hidden="true">🔒 </span>}
                  {cleared && <span aria-hidden="true">✓ </span>}
                  {fmt(ui.travel.mapNumber, { n: mapIndex(map) + 1 })}
                </span>
              </button>
            );
          })}
          {/* หมุดตัวละครของผู้เล่น: เดินไปที่แมพปลายทางเมื่อกดเดินทาง */}
          <img
            src={art.player(avatar, outfit)}
            alt=""
            data-testid="travel-pin"
            data-at={walkingTo ?? here}
            className="pixelated pointer-events-none absolute z-10 h-10 w-10 -translate-x-1/2 -translate-y-3/4 sm:h-14 sm:w-14"
            style={{ left: `${pin.x + 7}%`, top: `${pin.y + 6}%`, transition: `left ${WALK_MS}ms ease-in-out, top ${WALK_MS}ms ease-in-out` }}
          />
        </div>

        {/* ข้อมูลของสถานที่ที่เลือก */}
        <section className="flex flex-wrap items-center gap-3 rounded-lg border-[3px] border-ink bg-paper p-3" data-testid="travel-card" data-map={picked} data-status={selected.status}>
          <div className="flex shrink-0 items-end rounded-md border-2 border-ink bg-teal-light p-1">
            <img src={art.foe(selected.boss.forms[selected.boss.forms.length - 1].art)} alt="" className={`pixelated h-14 w-14 object-contain ${selected.open ? "" : "opacity-40 grayscale"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold">
              {ui.difficulty[picked].name}
              {selected.cleared && <span className="ml-2 rounded border-2 border-ink bg-teal-light px-1.5 text-xs">✓ {ui.travel.cleared}</span>}
            </h3>
            <p className="text-sm text-slate">{ui.difficulty[picked].detail}</p>
            <p className="text-xs font-bold" data-testid={`travel-info-${picked}`}>
              {selected.open
                ? selected.topics.length === 0
                  ? fmt(ui.travel.progressBattles, { n: selected.won, total: selected.level.battles.length })
                  : fmt(ui.travel.progress, { n: selected.won, total: selected.level.battles.length, cores: selected.cores, coreTotal: selected.topics.length })
                : fmt(ui.travel.locked, { map: lockedBy })}
            </p>
            {selected.open && !selected.cleared && <p className="text-xs text-slate">{fmt(ui.travel.boss, { name: foeName(selected.boss.forms[0].art) })}</p>}
            <ul className="mt-1 flex flex-wrap gap-1" data-testid="kaiju-list" aria-label={ui.travel.kaijuList}>
              {selected.level.battles.map((battle) => {
                const won = battles[battle.id]?.won === true;
                const next = selected.open && !won && selected.level.battles.find((b) => !battles[b.id]?.won)?.id === battle.id;
                const status = won ? "won" : next ? "next" : "locked";
                return (
                  <li key={battle.id} data-kaiju={battle.id} data-status={status} className={`rounded border-2 border-ink px-1.5 text-xs font-bold ${won ? "bg-teal-light" : next ? "bg-hint" : "bg-cream text-slate"}`}>
                    {battle.boss && <span aria-hidden="true">👑 </span>}
                    {foeName(battle.forms[0].art)} · {ui.travel.kaijuStatus[status]}
                  </li>
                );
              })}
            </ul>
          </div>
          {selected.status === "here" ? (
            <span className="shrink-0 rounded-md border-2 border-ink bg-cream px-2 py-1 text-sm font-bold">{ui.travel.here}</span>
          ) : selected.status === "open" ? (
            <button type="button" className="btn !min-h-10 shrink-0 text-sm" disabled={walkingTo !== null} data-testid={`travel-go-${picked}`} onClick={() => go(picked)}>
              {ui.travel.go}
            </button>
          ) : (
            <span className="shrink-0 text-2xl" aria-hidden="true">
              🔒
            </span>
          )}
        </section>
      </div>
    </div>
  );
}
