import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { guardianPowerOf, pendingBattle, useGameStore } from "../state/gameStore";
import { ARMORS, BAG_SIZE, CHIPS, type Gear, itemPower, WEAPONS } from "../state/gear";
import { art } from "./art";
import { BagPicker } from "./BagPicker";
import { useDialog } from "./useDialog";

type Slot = keyof Gear;
const SLOTS: { slot: Slot; values: readonly string[]; base: string }[] = [
  { slot: "weapon", values: WEAPONS, base: "fist" },
  { slot: "armor", values: ARMORS, base: "plate" },
  { slot: "chip", values: CHIPS, base: "none" },
];
type ItemId = keyof typeof ui.shop.items;

/** ไอคอนของอุปกรณ์หนึ่งชิ้น ช่องชิปที่ว่างเป็นกรอบเส้นประ */
export function GearIcon({ value, className = "h-12 w-12" }: { value: Gear[Slot]; className?: string }) {
  const src = art.gear(value);
  return src ? <img src={src} alt="" className={`pixelated ${className}`} /> : <span className={`block rounded border-2 border-dashed border-slate ${className}`} aria-hidden="true" />;
}

/**
 * กล่องเก็บไอเทม (GDD ข้อ 17) ที่โถงและโรงเก็บหุ่น: เลือกอุปกรณ์ของการ์เดียน (อาวุธ เกราะ ชิป ช่องละชิ้น)
 * และจัดของใช้ลงกระเป๋าสำหรับออกปฏิบัติการ พี่บิตแนะนำของที่เหมาะกับด่านถัดไป
 */
export function Storage() {
  const shop = useGameStore((s) => s.shop);
  const power = useGameStore(guardianPowerOf);
  const upcoming = useGameStore(pendingBattle);
  const equip = useGameStore((s) => s.equip);
  const openShop = useGameStore((s) => s.openShop);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="storage">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.storage.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">📦 {ui.storage.title}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-md border-2 border-ink bg-hint px-2 py-0.5 font-extrabold" data-testid="storage-power" data-power={power}>
              ⚡ {fmt(ui.shop.power, { n: power })}
            </span>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="storage-close" onClick={closeOverlay}>
              {ui.storage.close}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate">{fmt(ui.storage.intro, { n: BAG_SIZE })}</p>
        {upcoming && (
          <p className="text-sm font-bold" data-testid="storage-recommended" data-ok={power >= upcoming.power}>
            {fmt(ui.missions.recommended, { n: upcoming.power })} · <span className={power >= upcoming.power ? "text-correct-dark" : "text-wrong"}>{power >= upcoming.power ? ui.missions.powerOk : ui.missions.powerLow}</span>
          </p>
        )}

        <section data-testid="storage-gear">
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.storage.gearTitle}</h3>
          <div className="flex flex-col gap-2">
            {SLOTS.map(({ slot, values, base }) => (
              <div key={slot} role="radiogroup" aria-label={ui.storage.slots[slot]} className="flex flex-wrap items-stretch gap-2">
                <span className="flex w-12 shrink-0 items-center text-sm font-extrabold">{ui.storage.slots[slot]}</span>
                {values
                  .filter((value) => value === base || shop.owned.includes(`${slot}-${value}`))
                  .map((value) => {
                    const using = shop[slot] === value;
                    const strings = ui.shop.items[`${slot}-${value}` as ItemId];
                    const gain = itemPower(slot, value);
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={using}
                        data-testid={`storage-${slot}-${value}`}
                        title={strings.detail}
                        onClick={() => (playSfx("equip"), equip(slot, value))}
                        className={`flex min-w-0 flex-1 basis-36 items-center gap-2 rounded-lg border-[3px] border-ink p-1 pr-2 text-left ${using ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
                      >
                        <GearIcon value={value as Gear[Slot]} className="h-10 w-10 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-extrabold">{strings.name}</span>
                          <span className="block text-xs text-slate">{strings.detail}</span>
                          {gain > 0 && <span className="block text-xs font-bold text-teal-dark">{fmt(ui.shop.powerGain, { n: gain })}</span>}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate">{ui.storage.gearHint}</p>
        </section>

        <BagPicker spec={upcoming} />

        <button type="button" className="btn btn-ghost self-end text-sm" data-testid="storage-to-shop" onClick={() => openShop()}>
          🛒 {ui.storage.toShop}
        </button>
      </div>
    </div>
  );
}
