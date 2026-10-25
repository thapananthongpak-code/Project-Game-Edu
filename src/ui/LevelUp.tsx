import { useEffect } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { levelCredits, titleOf } from "../state/level";
import { art } from "./art";
import { rewardName } from "./Profile";
import { RewardArt } from "./RewardArt";
import { useDialog } from "./useDialog";

/** หน้าต่างฉลองเลเวลอัป (GDD ข้อ 27): แสดงครั้งเดียวต่อเลเวลที่ถึงใหม่ พร้อมรางวัลที่เพิ่งได้ (แจกตอนเปิดหน้าต่างนี้) */
export function LevelUp() {
  const levelUp = useGameStore((s) => s.levelUp);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  useEffect(() => {
    playSfx("win");
  }, []);
  if (!levelUp) return null;
  const credits = levelCredits(levelUp.to) - levelCredits(levelUp.from);
  const newTitle = titleOf(levelUp.to) > titleOf(levelUp.from) ? ui.level.titles[titleOf(levelUp.to)] : null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-ink/85 p-3" data-testid="levelup" data-level={levelUp.to}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.level.up.title} tabIndex={-1} className="panel levelup-pop flex w-full max-w-md flex-col items-center gap-2 p-4 text-center">
        <img src={art.credit} alt="" className="pixelated h-10 w-10" />
        <h2 className="text-2xl font-extrabold text-teal-dark">{ui.level.up.title}</h2>
        <p className="text-xl font-extrabold" data-testid="levelup-detail">
          {fmt(ui.level.up.detail, { from: levelUp.from, to: levelUp.to })}
        </p>
        {newTitle && <p className="font-bold text-teal-dark">{fmt(ui.level.up.title2, { title: newTitle })}</p>}
        {credits > 0 && (
          <p className="flex items-center gap-1 rounded-md border-2 border-ink bg-hint px-2 py-0.5 font-bold" data-testid="levelup-credits" data-credits={credits}>
            <img src={art.credit} alt="" className="pixelated h-5 w-5" />
            {fmt(ui.level.up.credits, { n: credits })}
          </p>
        )}
        {levelUp.items.length > 0 && (
          <div className="w-full rounded-md border-2 border-ink bg-teal-light p-2" data-testid="levelup-items">
            <h3 className="text-sm font-extrabold">{ui.level.up.itemsTitle}</h3>
            <ul className="flex flex-wrap justify-center gap-2 font-bold">
              {levelUp.items.map((id) => (
                <li key={id} data-reward={id} className="flex w-28 flex-col items-center rounded-md border-2 border-ink bg-paper p-1">
                  <RewardArt id={id} className="h-20 w-20" />
                  <span className="text-xs">{rewardName(id)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate">{ui.level.wear}</p>
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-ghost" data-testid="levelup-profile" onClick={() => openOverlay("profile")}>
            {ui.level.up.profile}
          </button>
          <button type="button" className="btn" data-testid="levelup-close" onClick={closeOverlay}>
            {ui.level.up.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
