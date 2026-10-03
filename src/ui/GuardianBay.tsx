import { playSfx } from "../audio/engine";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { guardianPowerOf, pendingBattle, useGameStore } from "../state/gameStore";
import { ARMORS, CHIPS, type Gear, itemPower, matchupOf, WEAPONS } from "../state/gear";
import { gearOf } from "../state/shop";
import { PAINT_FILTER, PAINTS } from "../state/shop.config";
import { art } from "./art";
import { GuardianModel, MatchupList } from "./GuardianModel";
import { GearIcon } from "./Storage";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
type Slot = keyof Gear | "paint";
const SLOTS: { slot: Slot; values: readonly string[]; base: string }[] = [
  { slot: "weapon", values: WEAPONS, base: "fist" },
  { slot: "armor", values: ARMORS, base: "plate" },
  { slot: "chip", values: CHIPS, base: "none" },
  { slot: "paint", values: PAINTS, base: "standard" },
];

/**
 * แท่นการ์เดียนในโรงเก็บหุ่น (GDD ข้อ 17): ใส่อาวุธ เกราะ ชิป และสีก่อนออกปฏิบัติการ หุ่นในหน้าต่างและบนแท่นแสดงของที่ใส่จริง
 * แต่ละอาวุธบอกว่าชนะทาง พอใช้ได้ หรือแพ้ทางคู่ต่อสู้ของด่านถัดไป
 */
export function GuardianBay() {
  const shop = useGameStore((s) => s.shop);
  const upcoming = useGameStore(pendingBattle);
  const power = useGameStore((s) => guardianPowerOf(s, pendingBattle(s) ?? undefined));
  const equip = useGameStore((s) => s.equip);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const gear = gearOf(shop);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="guardian-bay">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.guardianBay.title} tabIndex={-1} className="panel mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🤖 {ui.guardianBay.title}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-md border-2 border-ink bg-hint px-2 py-0.5 font-extrabold" data-testid="guardian-power" data-power={power}>
              ⚡ {fmt(ui.shop.power, { n: power })}
            </span>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="guardian-close" onClick={closeOverlay}>
              {ui.guardianBay.close}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate">{ui.guardianBay.intro}</p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex shrink-0 items-end justify-center rounded-lg border-[3px] border-ink bg-teal-light p-2 sm:w-56">
            <GuardianModel gear={gear} paint={shop.paint} className="aspect-square w-48" />
          </div>
          <div className="min-w-0 flex-1" data-testid="guardian-next">
            <h3 className="mb-1 text-sm font-extrabold">{upcoming ? fmt(ui.guardianBay.next, { kaiju: foeName(upcoming.forms[0].art) }) : ui.guardianBay.noBattle}</h3>
            {upcoming && <MatchupList spec={upcoming} weapon={gear.weapon} />}
            <p className="mt-1 text-xs text-slate">{ui.matchup.rule}</p>
          </div>
        </div>

        {SLOTS.map(({ slot, values, base }) => (
          <section key={slot}>
            <h3 className="mb-1 text-xs font-bold text-slate">{ui.guardianBay.slots[slot]}</h3>
            <div role="radiogroup" aria-label={ui.guardianBay.slots[slot]} className="flex flex-wrap items-stretch gap-2">
              {values
                .filter((value) => value === base || shop.owned.includes(`${slot}-${value}`))
                .map((value) => {
                  const using = shop[slot] === value;
                  const strings = ui.shop.items[`${slot}-${value}` as ItemId];
                  const gain = slot === "paint" ? 0 : itemPower(slot, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={using}
                      data-testid={`guardian-${slot}-${value}`}
                      onClick={() => (playSfx("equip"), equip(slot, value))}
                      className={`flex min-w-0 flex-1 basis-40 items-center gap-2 rounded-lg border-[3px] border-ink p-1 pr-2 text-left ${using ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
                    >
                      {slot === "paint" ? <img src={art.robot} alt="" className="pixelated h-10 w-10 shrink-0" style={{ filter: PAINT_FILTER[value as keyof typeof PAINT_FILTER] }} /> : <GearIcon value={value as Gear[keyof Gear]} className="h-10 w-10 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold">{strings.name}</span>
                        <span className="block text-xs text-slate">{strings.detail}</span>
                        {gain > 0 && <span className="block text-xs font-bold text-teal-dark">{fmt(ui.shop.powerGain, { n: gain })}</span>}
                        {slot === "weapon" && upcoming && (
                          <span className="block text-xs font-bold" data-testid={`guardian-vs-${value}`}>
                            {upcoming.forms
                              .map((form) => fmt(ui.guardianBay.vs, { kaiju: foeName(form.art), matchup: ui.matchup.names[matchupOf(value as Gear["weapon"], form.weak)] }))
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
