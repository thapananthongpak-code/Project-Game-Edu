import { foeName, storyNames } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { BATTLE } from "../state/battle.config";
import { guardianPowerOf, pendingBattle, planOf, roomProgress, useGameStore } from "../state/gameStore";
import { REWARDS } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

/**
 * แผงสั่งปฏิบัติการในโรงเก็บหุ่น (GDD ข้อ 12): รายการด่านต่อสู้ของระดับความยากนี้ตามลำดับ
 * ออกปฏิบัติการกับด่านถัดไป หรือซ้อมรบซ้ำกับด่านที่ชนะแล้วเพื่อเก็บเครดิตวิจัย
 * แต่ละด่านบอกพลังที่แนะนำเทียบกับค่าพลังรวมของการ์เดียนตอนนี้ (คำแนะนำ ไม่ใช่เงื่อนไข)
 */
export function Missions() {
  const profile = useGameStore((s) => s.profile);
  const progress = useGameStore((s) => s.progress);
  const battles = useGameStore((s) => s.battles);
  const openBattle = useGameStore((s) => s.openBattle);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const shop = useGameStore((s) => s.shop);
  const power = guardianPowerOf({ profile, shop, progress });
  const run = { profile, progress, battles };
  const pending = pendingBattle(run);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="missions">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.missions.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">⚔ {ui.missions.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="missions-close" onClick={closeOverlay}>
            {ui.missions.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.missions.intro}</p>
        <div className="rounded-md border-2 border-ink bg-teal-light px-2 py-1.5" data-testid="missions-power" data-power={power}>
          <p className="font-extrabold">⚡ {fmt(ui.missions.power, { n: power })}</p>
          <p className="text-sm">{planOf(run).roomsNeedCores ? ui.missions.powerNote : ui.missions.powerNoteFree}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {planOf(run).battles.map((battle) => {
            const record = battles[battle.id];
            const won = record?.won ?? false;
            const missing = battle.requires.find((topic) => !roomProgress(run, topic).core);
            const replaysLeft = Math.max(0, BATTLE.replayRewards - Math.max(0, (record?.wins ?? 0) - 1));
            const status = won ? "won" : pending?.id === battle.id ? "ready" : "locked";
            // ค่าพลังสำหรับด่านนี้: นับความได้เปรียบของอาวุธที่ใส่อยู่กับคู่ต่อสู้ของด่านด้วย
            const mine = guardianPowerOf({ profile, shop, progress }, battle);
            return (
              <li key={battle.id} className={`flex items-center gap-3 rounded-lg border-[3px] border-ink p-2 ${status === "ready" ? "bg-hint" : "bg-paper"}`} data-testid={`mission-${battle.id}`} data-status={status}>
                <div className="flex shrink-0 items-end gap-0.5 rounded-md border-2 border-ink bg-teal-light p-1">
                  {battle.forms.map((form) => (
                    <img key={form.art} src={art.foe(form.art)} alt="" className={`pixelated h-12 w-12 object-contain ${status === "locked" ? "opacity-40 grayscale" : ""}`} />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold">
                    {foeName(battle.forms[0].art)}
                    {battle.boss && <span className="ml-2 rounded border-2 border-ink bg-wrong px-1.5 text-xs text-paper">{ui.missions.boss}</span>}
                  </div>
                  <div className="text-sm text-slate">{storyNames.place[battle.backdrop - 1]}</div>
                  {battle.forms.length > 1 && <div className="text-xs font-bold text-slate">{fmt(ui.battle.forms, { n: battle.forms.length })}</div>}
                  <div className="text-xs font-bold" data-testid={`mission-power-${battle.id}`} data-recommended={battle.power} data-power={mine} data-ok={mine >= battle.power}>
                    ⚡ {fmt(ui.missions.recommended, { n: battle.power })} · <span className={`rounded bg-paper px-1 ${mine >= battle.power ? "text-correct-dark" : "text-wrong"}`}>{mine >= battle.power ? ui.missions.powerOk : ui.missions.powerLow}</span>
                    {" · "}
                    <span className="text-slate">{[...new Set(battle.forms.map((form) => fmt(ui.battle.weak, { class: ui.storage.weaponClasses[form.weak] })))].join(" / ")}</span>
                  </div>
                  <div className="text-xs font-bold text-slate">
                    {won
                      ? `${fmt(ui.missions.won, { n: record?.wins ?? 0 })} · ${fmt(ui.missions.replayLeft, { n: replaysLeft })} (+${REWARDS.replay})`
                      : status === "locked" && (missing !== undefined ? fmt(ui.missions.locked, { n: missing }) : ui.missions.lockedOrder)}
                  </div>
                </div>
                {status !== "locked" && (
                  <button type="button" className={`btn !min-h-10 shrink-0 text-sm ${won ? "btn-ghost" : ""}`} data-testid={`mission-${won ? "train" : "go"}-${battle.id}`} onClick={() => openBattle(battle.id)}>
                    {won ? ui.missions.train : ui.missions.go}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
