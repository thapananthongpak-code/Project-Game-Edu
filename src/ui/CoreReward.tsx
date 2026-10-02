import { isFieldRoom, topicOf } from "../content";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { difficultyOf, earningOf, pendingBattle, planOf, roomProgress, useGameStore } from "../state/gameStore";
import { earnedCredits } from "../state/shop";
import { art } from "./art";
import { Stars } from "./Stars";
import { useDialog } from "./useDialog";

/** หน้าจอได้รับแกน AI ของหัวข้อ: แสดงชื่อหัวข้อและสมรรถนะจาก course.json เครดิตวิจัยที่ได้ และภารกิจต่อไป (หัวข้อถัดไปของห้อง หรือด่านต่อสู้) */
export function CoreReward() {
  const room = useGameStore((s) => s.room) as number;
  const progress = useGameStore((s) => roomProgress(s, room));
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const exitToHall = useGameStore((s) => s.exitToHall);
  const topic = topicOf(room);
  const field = isFieldRoom(room);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  // เครดิตที่หัวข้อนี้ให้จนถึงตอนรับแกน = ส่วนต่างของเครดิตทั้งหมดเมื่อมีและไม่มีหัวข้อนี้ (รวมตัวคูณของระดับความยากแล้ว)
  const credits = useGameStore((s) => {
    const earning = earningOf(s);
    const map = difficultyOf(s);
    const { [room]: _mine, ...others } = s.progress;
    return earnedCredits(earning) - earnedCredits({ ...earning, maps: { ...earning.maps, [map]: others }, posttest: field ? null : earning.posttest });
  });
  const battle = useGameStore(pendingBattle);
  // หัวข้อถัดไปของห้องนี้ที่ยังไม่ได้แกน AI (ห้องที่มีหลายหัวข้อ)
  const nextTopic = useGameStore((s) => (s.zone === null ? undefined : planOf(s).zones[s.zone - 1]?.topics.find((t) => !roomProgress(s, t).core)));

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/85 p-4" data-testid="reward" data-topic={room}>
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
          <div className="mt-2 text-sm font-bold text-teal-dark" data-testid="reward-credits" data-credits={credits}>
            {fmt(ui.reward.credits, { n: credits })}
          </div>
        </div>
        {battle ? (
          <p className="mt-3 rounded-md border-2 border-ink bg-hint px-3 py-2 text-sm font-bold" data-testid="reward-next">
            ⚔ {fmt(ui.reward.next, { kaiju: foeName(battle.forms[0].art) })}
          </p>
        ) : (
          nextTopic !== undefined && (
            <p className="mt-3 rounded-md border-2 border-ink bg-hint px-3 py-2 text-sm font-bold" data-testid="reward-next-topic">
              ▸ {fmt(ui.reward.nextTopic, { n: nextTopic })}
            </p>
          )
        )}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {field ? (
            <button type="button" className="btn btn-ghost" data-testid="reward-certificate" onClick={() => openOverlay("certificate")}>
              {ui.reward.certificate}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" data-testid="reward-stay" onClick={closeOverlay}>
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
