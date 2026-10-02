import { playSfx } from "../audio/engine";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { CAMPAIGN, DIFFICULTIES, mapIndex, topicsOf } from "../state/campaign";
import { difficultyOf, mapCleared, mapUnlocked, roomsOfMap, useGameStore } from "../state/gameStore";
import { art } from "./art";
import { useDialog } from "./useDialog";

/**
 * กระดานแผนที่การเดินทาง (GDD ข้อ 15): แมพ 1 → 2 → 3 เล่นต่อกันตามลำดับ แมพถัดไปเปิดเมื่อชนะไคจูครบทุกด่านของแมพก่อนหน้า
 * กลับไปแมพที่ผ่านแล้วได้เสมอ ความคืบหน้าของแต่ละแมพเก็บแยกกัน
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

  const go = (map: (typeof DIFFICULTIES)[number]) => {
    if (!travel(map)) return;
    playSfx("door");
    showToast(fmt(ui.toast.traveled, { map: ui.difficulty[map].name }));
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="travel" data-here={here}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.travel.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🗺 {ui.travel.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="travel-close" onClick={closeOverlay}>
            {ui.travel.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.travel.intro}</p>
        <ol className="flex flex-col gap-2">
          {DIFFICULTIES.map((map) => {
            const level = CAMPAIGN[map];
            const open = mapUnlocked(state, map);
            const cleared = mapCleared(state, map);
            const won = level.battles.filter((battle) => battles[battle.id]?.won).length;
            const rooms = roomsOfMap(state, map);
            const topics = topicsOf(map);
            const cores = topics.filter((topic) => rooms[topic]?.core).length;
            const boss = level.battles[level.battles.length - 1];
            const status = map === here ? "here" : open ? "open" : "locked";
            return (
              <li key={map} className={`flex items-center gap-3 rounded-lg border-[3px] border-ink p-2 ${status === "here" ? "bg-hint" : status === "locked" ? "bg-mist" : "bg-paper"}`} data-testid={`travel-${map}`} data-status={status} data-cleared={cleared}>
                <div className="flex shrink-0 items-end rounded-md border-2 border-ink bg-teal-light p-1">
                  <img src={art.foe(boss.forms[boss.forms.length - 1].art)} alt="" className={`pixelated h-14 w-14 object-contain ${open ? "" : "opacity-40 grayscale"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold">
                    {ui.difficulty[map].name}
                    {cleared && <span className="ml-2 rounded border-2 border-ink bg-teal-light px-1.5 text-xs">✓ {ui.travel.cleared}</span>}
                  </div>
                  <div className="text-sm text-slate">{ui.difficulty[map].detail}</div>
                  <div className="text-xs font-bold">
                    {open
                      ? fmt(ui.travel.progress, { n: won, total: level.battles.length, cores, coreTotal: topics.length })
                      : fmt(ui.travel.locked, { map: ui.difficulty[DIFFICULTIES[mapIndex(map) - 1]].name })}
                  </div>
                  {open && !cleared && <div className="text-xs text-slate">{fmt(ui.travel.boss, { name: foeName(boss.forms[0].art) })}</div>}
                </div>
                {status === "here" ? (
                  <span className="shrink-0 rounded-md border-2 border-ink bg-cream px-2 py-1 text-sm font-bold">{ui.travel.here}</span>
                ) : status === "open" ? (
                  <button type="button" className="btn !min-h-10 shrink-0 text-sm" data-testid={`travel-go-${map}`} onClick={() => go(map)}>
                    {ui.travel.go}
                  </button>
                ) : (
                  <span className="shrink-0 text-2xl" aria-hidden="true">
                    🔒
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
