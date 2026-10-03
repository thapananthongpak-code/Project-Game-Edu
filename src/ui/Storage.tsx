import { fmt, ui } from "../content/ui-strings";
import { guardianPowerOf, pendingBattle, useGameStore } from "../state/gameStore";
import { BAG_SIZE, type Gear } from "../state/gear";
import { art } from "./art";
import { BagPicker } from "./BagPicker";
import { useDialog } from "./useDialog";

type Slot = keyof Gear;

/** ไอคอนของอุปกรณ์หนึ่งชิ้น ช่องชิปที่ว่างเป็นกรอบเส้นประ */
export function GearIcon({ value, className = "h-12 w-12" }: { value: Gear[Slot]; className?: string }) {
  const src = art.gear(value);
  return src ? <img src={src} alt="" className={`pixelated ${className}`} /> : <span className={`block rounded border-2 border-dashed border-slate ${className}`} aria-hidden="true" />;
}

/**
 * กล่องเก็บไอเทม (GDD ข้อ 17) ที่โถงและโรงเก็บหุ่น: จัดของใช้ลงกระเป๋าสำหรับออกปฏิบัติการ พี่บิตแนะนำของและอาวุธที่เหมาะกับด่านถัดไป
 * อาวุธ เกราะ และชิปใส่ที่แท่นการ์เดียนในโรงเก็บหุ่น (GuardianBay)
 */
export function Storage() {
  const upcoming = useGameStore(pendingBattle);
  // ค่าพลังสำหรับด่านถัดไป: นับความได้เปรียบของอาวุธที่ใส่อยู่กับคู่ต่อสู้ของด่านนั้นด้วย
  const power = useGameStore((s) => guardianPowerOf(s, pendingBattle(s) ?? undefined));
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

        <BagPicker spec={upcoming} />

        <button type="button" className="btn btn-ghost self-end text-sm" data-testid="storage-to-shop" onClick={() => openShop()}>
          🛒 {ui.storage.toShop}
        </button>
      </div>
    </div>
  );
}
