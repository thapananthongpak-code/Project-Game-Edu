import { isFieldRoom, stationsOf, topicOf } from "../content";
import { kaijuName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { roomProgress, useGameStore } from "../state/gameStore";
import { REWARDS } from "../state/shop.config";
import { art } from "./art";
import { Stars } from "./Stars";
import { useDialog } from "./useDialog";

/** หน้าจอได้รับแกน AI ของห้อง: แสดงชื่อหัวข้อและสมรรถนะจาก course.json เครดิตวิจัยที่ได้ และภารกิจต่อไป (ด่านต่อสู้ของห้องนี้) */
export function CoreReward() {
  const room = useGameStore((s) => s.room) as number;
  const progress = useGameStore((s) => roomProgress(s, room));
  const hasPosttest = useGameStore((s) => s.posttest !== null);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const exitToHall = useGameStore((s) => s.exitToHall);
  const topic = topicOf(room);
  const field = isFieldRoom(room);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  // เครดิตที่ห้องนี้ให้จนถึงตอนรับแกน (ตรงกับ earnedCredits ใน src/state/shop.ts)
  const credits = field
    ? REWARDS.core + REWARDS.field + (hasPosttest ? REWARDS.posttest : 0)
    : REWARDS.core + stationsOf(room).length * REWARDS.station + progress.stars * REWARDS.star + (progress.reviewDone ? REWARDS.review : 0);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/85 p-4" data-testid="reward">
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={fmt(ui.reward.title, { n: room })} className="panel w-full max-w-md p-6 text-center">
        <img src={art.core(room)} alt="" className="pixelated mx-auto h-24 w-24 animate-bounce" />
        <h2 className="mt-2 text-2xl font-extrabold text-teal-dark" data-testid="reward-title">
          {fmt(ui.reward.title, { n: room })}
        </h2>
        <p className="mt-1 font-semibold">{topic.title}</p>
        <div className="mt-4 rounded-md border-2 border-ink bg-paper p-3 text-left">
          <div className="text-xs font-bold text-slate">{ui.reward.objective}</div>
          <div className="font-semibold">✓ {topic.objective}</div>
          {!field && (
            <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate">
              {ui.reward.stars} <Stars count={progress.stars} />
            </div>
          )}
          <div className="mt-2 text-sm font-bold text-teal-dark" data-testid="reward-credits">
            {fmt(ui.reward.credits, { n: credits })}
          </div>
        </div>
        {!progress.battle.won && (
          <p className="mt-3 rounded-md border-2 border-ink bg-hint px-3 py-2 text-sm font-bold" data-testid="reward-next">
            ⚔ {fmt(ui.reward.next, { kaiju: kaijuName(room) })}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {field ? (
            <button type="button" className="btn btn-ghost" data-testid="reward-certificate" onClick={() => openOverlay("certificate")}>
              {ui.reward.certificate}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
              {ui.reward.stay}
            </button>
          )}
          <button type="button" className="btn" data-testid="reward-hall" onClick={exitToHall}>
            {ui.reward.toHall}
          </button>
        </div>
      </div>
    </div>
  );
}
