import { useEffect, useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { reachedMap, useGameStore } from "../state/gameStore";
import { codexCount, growthOf, potCount } from "../state/lab";
import { LAB, type Seed, SEEDS } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

/** เวลาปัจจุบันที่อัปเดตทุกวินาทีขณะหน้าต่างเปิด (นับถอยหลังของพืชที่กำลังโต) */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** เวลาที่เหลือเป็นข้อความ: "3 นาที 20 วินาที" หรือ "40 วินาที" */
function remaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  return m > 0 ? fmt(ui.lab.minutes, { m, s: total % 60 }) : fmt(ui.lab.seconds, { s: total });
}

/**
 * หน้าต่างห้องวิจัยพืชต่างดาว (GDD ข้อ 21): กระถางทุกใบของแมพที่ไปถึง ปลูกเมล็ดที่มี เก็บผลผลิตเมื่อโตเต็มที่ และสมุดสะสมพันธุ์พืช
 * พืชโตตามเวลาจริง ไม่มีผลต่อการปลดล็อกห้อง ระดับความช่วยเหลือ หรือการวัดผล
 */
export function LabPanel() {
  const shop = useGameStore((s) => s.shop);
  const reached = useGameStore(reachedMap);
  const focus = useGameStore((s) => s.labPot);
  const plantSeed = useGameStore((s) => s.plantSeed);
  const harvestPot = useGameStore((s) => s.harvestPot);
  const showToast = useGameStore((s) => s.showToast);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const now = useNow();
  // ของแถมของการเก็บครั้งล่าสุดในหน้าต่างนี้
  const [lastGifts, setLastGifts] = useState<string[]>([]);
  const pots = Array.from({ length: potCount(reached) }, (_, index) => index);
  const haveSeeds = SEEDS.filter((seed) => shop.seeds[seed] > 0);
  const rewarded = shop.owned.includes(`decor-${LAB.rewardDecor}`);

  const collect = (index: number) => {
    const pot = shop.pots[String(index)];
    const result = harvestPot(index);
    if (!pot || !result) return;
    playSfx("pickup");
    showToast(fmt(ui.toast.harvested, { name: ui.lab.seeds[pot.seed].name, n: result.gained }));
    setLastGifts(result.gifts);
    if (result.gifts.length > 0) window.setTimeout(() => playSfx("star"), 300);
    if (result.unlocked) window.setTimeout(() => showToast(ui.toast.rewardDecor), 1800);
  };

  const sprite = (seed: Seed | null, stage: 1 | 2 | 3) => (seed ? art.plant(seed, stage) : "assets/props/pr_pot_empty.png");

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="lab">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.lab.title} tabIndex={-1} className="panel mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🌱 {ui.lab.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="lab-close" onClick={closeOverlay}>
            {ui.lab.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.lab.intro}</p>

        {lastGifts.length > 0 && (
          <section className="rounded-md border-2 border-ink bg-hint p-2 text-sm font-bold" role="status" data-testid="lab-gifts" data-gifts={lastGifts.join(",")}>
            {ui.lab.giftTitle}: {lastGifts.map((id) => ui.shop.items[id as keyof typeof ui.shop.items]?.name ?? id).join(" · ")}
          </section>
        )}
        <section className="rounded-md border-2 border-ink bg-paper p-2" data-testid="lab-seeds" aria-label={ui.lab.seedBox}>
          <h3 className="text-xs font-bold text-slate">{ui.lab.seedBox}</h3>
          {haveSeeds.length === 0 ? (
            <p className="text-sm">{ui.lab.noSeeds}</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-2">
              {haveSeeds.map((seed) => (
                <li key={seed} className="flex items-center gap-1 rounded-md border-2 border-ink bg-teal-light px-2 py-0.5 text-sm font-bold" data-testid={`lab-seed-${seed}`} data-count={shop.seeds[seed]}>
                  <img src={art.plant(seed, 3)} alt="" className="pixelated h-8 w-8 object-contain" />
                  {ui.lab.seeds[seed].name} × {shop.seeds[seed]}
                </li>
              ))}
            </ul>
          )}
        </section>

        <ul className="grid gap-2 sm:grid-cols-2">
          {pots.map((index) => {
            const pot = shop.pots[String(index)];
            const growth = pot ? growthOf(pot, now) : null;
            const stageNumber = growth ? ({ sprout: 1, growing: 2, ready: 3 } as const)[growth.stage] : 1;
            return (
              <li
                key={index}
                className={`flex flex-col gap-2 rounded-lg border-[3px] border-ink p-2 ${focus === index ? "bg-hint" : "bg-paper"}`}
                data-testid={`lab-pot-${index}`}
                data-stage={growth?.stage ?? "empty"}
                data-seed={pot?.seed ?? ""}
              >
                <div className="flex items-center gap-2">
                  <div className="shrink-0 rounded-md border-2 border-ink bg-teal-light">
                    <img src={sprite(pot?.seed ?? null, stageNumber as 1 | 2 | 3)} alt="" className="pixelated h-16 w-16 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold">{fmt(ui.lab.pot, { n: index + 1 })}</div>
                    {pot && growth ? (
                      <>
                        <div className="text-sm font-semibold">
                          {ui.lab.seeds[pot.seed].name} · {ui.lab.stage[growth.stage]}
                        </div>
                        {growth.stage === "ready" ? (
                          <div className="text-sm font-bold text-correct-dark">{ui.lab.readyText}</div>
                        ) : (
                          <>
                            <div className="text-sm text-slate" data-testid={`lab-time-${index}`}>
                              {fmt(ui.lab.growing, { time: remaining(growth.remainingMs) })}
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded border-2 border-ink bg-mist" role="presentation">
                              <div className="h-full bg-correct" style={{ width: `${Math.round(growth.ratio * 100)}%` }} />
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-slate">{ui.lab.emptyPot}</div>
                    )}
                  </div>
                </div>
                {pot && growth?.stage === "ready" && (
                  <button type="button" className="btn !min-h-10 text-sm" data-testid={`lab-harvest-${index}`} onClick={() => collect(index)}>
                    {fmt(ui.lab.harvest, { n: LAB.seeds[pot.seed].yield })}
                  </button>
                )}
                {!pot && haveSeeds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {haveSeeds.map((seed) => (
                      <button
                        key={seed}
                        type="button"
                        className="btn btn-ghost !min-h-10 text-sm"
                        data-testid={`lab-plant-${index}-${seed}`}
                        onClick={() => {
                          if (plantSeed(index, seed)) playSfx("open");
                        }}
                      >
                        {fmt(ui.lab.plant, { name: ui.lab.seeds[seed].name })}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <section className="rounded-md border-2 border-ink bg-paper p-2" data-testid="lab-codex" data-count={codexCount(shop)}>
          <h3 className="text-sm font-extrabold text-teal-dark">{ui.lab.codexTitle}</h3>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {SEEDS.map((seed) => {
              const n = shop.harvests[seed];
              const info = { min: LAB.seeds[seed].growMs / 60_000, yield: LAB.seeds[seed].yield };
              return (
                <li key={seed} className={`flex items-center gap-2 rounded border-2 border-ink p-1 text-sm ${n > 0 ? "bg-teal-light" : "bg-cream"}`} data-testid={`lab-codex-${seed}`} data-harvests={n}>
                  <img src={art.plant(seed, 3)} alt="" className={`pixelated h-10 w-10 shrink-0 object-contain ${n > 0 ? "" : "opacity-40 grayscale"}`} />
                  <span>
                    <span className="block font-bold">{ui.lab.seeds[seed].name}</span>
                    <span className="block text-xs text-slate">{n > 0 ? fmt(ui.lab.codexRow, { n, ...info }) : fmt(ui.lab.codexNew, info)}</span>
                    <span className="block text-xs">{n > 0 ? ui.lab.seeds[seed].note : fmt(ui.lab.noteLocked, { kaiju: ui.lab.seeds[seed].kaiju })}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm font-semibold" data-testid="lab-reward" data-got={rewarded}>
            {rewarded ? ui.lab.rewardGot : fmt(ui.lab.reward, { n: codexCount(shop), total: SEEDS.length })}
          </p>
        </section>
      </div>
    </div>
  );
}
