import { topicOf } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { roomProgress, useGameStore } from "../state/gameStore";
import { Stars } from "./Stars";
import { useDialog } from "./useDialog";

/** หน้าจอได้รับแกน AI ของห้อง: แสดงชื่อหัวข้อและสมรรถนะจาก course.json */
export function CoreReward() {
  const room = useGameStore((s) => s.room) as number;
  const stars = useGameStore((s) => roomProgress(s, room).stars);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const exitToHall = useGameStore((s) => s.exitToHall);
  const topic = topicOf(room);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/85 p-4" data-testid="reward">
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={fmt(ui.reward.title, { n: room })} className="panel w-full max-w-md p-6 text-center">
        <img src={`assets/cores/core_${room}.png`} alt="" className="pixelated mx-auto h-24 w-24 animate-bounce" />
        <h2 className="mt-2 text-2xl font-extrabold text-teal-dark" data-testid="reward-title">
          {fmt(ui.reward.title, { n: room })}
        </h2>
        <p className="mt-1 font-semibold">{topic.title}</p>
        <div className="mt-4 rounded-md border-2 border-ink bg-paper p-3 text-left">
          <div className="text-xs font-bold text-slate">{ui.reward.objective}</div>
          <div className="font-semibold">✓ {topic.objective}</div>
          <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate">
            {ui.reward.stars} <Stars count={stars} />
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
            {ui.reward.stay}
          </button>
          <button type="button" className="btn" data-testid="reward-hall" onClick={exitToHall}>
            {ui.reward.toHall}
          </button>
        </div>
      </div>
    </div>
  );
}
