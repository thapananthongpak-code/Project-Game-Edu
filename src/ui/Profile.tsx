import { fmt, ui } from "../content/ui-strings";
import { CAMPAIGN, DIFFICULTIES } from "../state/campaign";
import { earningOf, useGameStore } from "../state/gameStore";
import { CHALLENGES, challengeDone, LEVEL_REWARDS, type LevelInput, statusOf, titleOf } from "../state/level";
import { npcActivitiesDone, npcActivityTotal } from "../state/npcs";
import { SEEDS } from "../state/shop.config";
import { art } from "./art";
import { GuardianModel } from "./GuardianModel";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
type ChallengeId = keyof typeof ui.level.challenges;

/** ชื่อของรางวัลของเลเวลที่แสดงในโปรไฟล์ */
export const rewardName = (id: string): string => ui.shop.items[id as ItemId]?.name ?? id;

/** โปรไฟล์นักฝึก (GDD ข้อ 27): ตัวละคร พี่บิต และการ์เดียนที่ใส่อยู่ ฉายา เลเวล แถบ EXP สถิติ ชาเลนจ์ และรางวัลของเลเวล */
export function Profile() {
  const state = useGameStore();
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const { profile, shop } = state;
  const input: LevelInput = { earning: earningOf(state), shop };
  const status = statusOf(input);
  const title = ui.level.titles[titleOf(status.level)];
  const wonBattles = Object.values(state.battles).filter((record) => record.won).length;
  const totalBattles = DIFFICULTIES.reduce((sum, map) => sum + CAMPAIGN[map].battles.length, 0);
  const best = Math.max(0, ...Object.values(state.battles).map((record) => record.streak ?? 0));
  const harvests = SEEDS.reduce((sum, seed) => sum + shop.harvests[seed], 0);
  const dash = shop.dash.filter((entry) => /^(?:easy|normal|hard):\d{1,2}$/.test(entry)).length;
  const doneCount = CHALLENGES.filter((challenge) => challengeDone(challenge, input)).length;
  const rewardLevels = Object.keys(LEVEL_REWARDS).map(Number);
  const nextAt = rewardLevels.find((level) => level > status.level && (LEVEL_REWARDS[level].items?.length ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="profile" data-level={status.level} data-exp={status.exp}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.level.profileTitle} tabIndex={-1} className="panel mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🏅 {ui.level.profileTitle}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="profile-close" onClick={closeOverlay}>
            {ui.level.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.level.intro}</p>

        <section className="flex flex-wrap items-center gap-3 rounded-lg border-[3px] border-ink bg-paper p-3">
          <div className="flex shrink-0 items-end gap-1 rounded-md border-2 border-ink bg-teal-light p-1">
            <img src={art.player(profile?.avatar ?? "a", shop.outfit)} alt={ui.level.avatarAlt} className="pixelated h-16 w-16" />
            <img src={art.bit(shop.bit)} alt="" className="pixelated h-10 w-10" />
            <div className="relative h-16 w-16">
              <GuardianModel gear={{ weapon: shop.weapon, armor: shop.armor, chip: shop.chip }} paint={shop.paint} className="absolute inset-0 h-full w-full" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold" data-testid="profile-name">
              {profile?.name}
            </p>
            <p className="font-bold text-teal-dark" data-testid="profile-title">
              {title}
            </p>
            <p className="font-extrabold" data-testid="profile-level">
              {fmt(ui.level.levelLabel, { n: status.level })} <span className="text-xs font-bold text-slate">{fmt(ui.level.expTotal, { n: status.exp })}</span>
            </p>
            <div
              role="progressbar"
              aria-label={ui.level.expLabel}
              aria-valuemin={0}
              aria-valuemax={status.max ? 1 : status.next}
              aria-valuenow={status.max ? 1 : status.into}
              aria-valuetext={status.max ? ui.level.expMax : fmt(ui.level.expBar, { into: status.into, next: status.next })}
              className="mt-1 h-4 w-full overflow-hidden rounded-full border-2 border-ink bg-cream"
            >
              <div className="h-full bg-teal-dark" style={{ width: `${status.max ? 100 : Math.round((status.into / status.next) * 100)}%` }} />
            </div>
            <p className="text-xs font-bold text-slate" data-testid="profile-next">
              {status.max ? ui.level.expMax : fmt(ui.level.expNext, { n: status.next - status.into, level: status.level + 1 })}
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.level.statsTitle}</h3>
          <ul className="grid gap-1 text-sm font-semibold sm:grid-cols-2" data-testid="profile-stats">
            <li>{fmt(ui.level.stats.wins, { n: wonBattles, total: totalBattles })}</li>
            <li>{fmt(ui.level.stats.streak, { n: best })}</li>
            <li>{fmt(ui.level.stats.harvest, { n: harvests })}</li>
            <li>{fmt(ui.level.stats.dash, { n: dash })}</li>
            <li>{fmt(ui.level.stats.npc, { n: npcActivitiesDone(state.npcs), total: npcActivityTotal() })}</li>
          </ul>
        </section>

        <section className="rounded-lg border-[3px] border-ink bg-hint p-2" data-testid="profile-next-reward">
          {nextAt === undefined ? (
            <p className="text-sm font-bold">{ui.level.noReward}</p>
          ) : (
            <>
              <h3 className="text-sm font-extrabold">{fmt(ui.level.nextReward, { level: nextAt })}</h3>
              <p className="text-sm font-semibold">{(LEVEL_REWARDS[nextAt].items ?? []).map(rewardName).join(" · ")}</p>
            </>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.level.rewardsTitle}</h3>
          <ul className="grid gap-1 sm:grid-cols-2" data-testid="profile-rewards">
            {rewardLevels.flatMap((level) =>
              (LEVEL_REWARDS[level].items ?? []).map((id) => {
                const got = status.level >= level;
                return (
                  <li key={id} data-reward={id} data-got={got} className={`flex items-center justify-between gap-2 rounded-md border-2 border-ink px-2 py-1 text-sm ${got ? "bg-teal-light" : "bg-paper text-slate"}`}>
                    <span className="font-bold">{rewardName(id)}</span>
                    <span className="shrink-0 text-xs font-bold">{got ? `✓ ${ui.level.rewardGot}` : fmt(ui.level.rewardLocked, { n: level })}</span>
                  </li>
                );
              }),
            )}
          </ul>
          <p className="mt-1 text-xs text-slate">{ui.level.wear}</p>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{fmt(ui.level.challengesTitle, { done: doneCount, total: CHALLENGES.length })}</h3>
          <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="profile-challenges">
            {CHALLENGES.map((challenge) => {
              const strings = ui.level.challenges[challenge.id as ChallengeId];
              const value = Math.min(challenge.goal, challenge.progress(input));
              const done = value >= challenge.goal;
              return (
                <li key={challenge.id} data-challenge={challenge.id} data-done={done} className={`rounded-md border-2 border-ink px-2 py-1 ${done ? "bg-teal-light" : "bg-paper"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      {done && <span aria-hidden="true">✓ </span>}
                      {strings.name}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-teal-dark">{done ? ui.level.challengeDone : fmt(ui.level.challengeExp, { n: challenge.exp })}</span>
                  </div>
                  <p className="text-xs text-slate">
                    {strings.detail}
                    {!done && challenge.goal > 1 && ` (${value}/${challenge.goal})`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
