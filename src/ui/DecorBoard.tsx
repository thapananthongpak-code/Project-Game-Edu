import { useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { hallMapOf, slotsOf } from "../game/maps";
import { difficultyOf, useGameStore } from "../state/gameStore";
import { ownedDecor } from "../state/shop";
import { DECOR, type Decor, type DecorSize } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
const nameOf = (decor: Decor): string => ui.shop.items[`decor-${decor}` as ItemId].name;

/**
 * กระดานตกแต่งโถง (GDD ข้อ 19): เลือกของตกแต่งที่มี (ของเริ่มต้นและของที่ซื้อจากร้าน) มาวางในช่องตกแต่งของโถงของแมพนี้
 * ช่องมี 3 ขนาด วางได้เฉพาะของขนาดเดียวกัน ของชิ้นหนึ่งวางได้ช่องเดียวต่อแมพ ไม่มีผลต่อการเล่น
 */
export function DecorBoard() {
  const map = useGameStore(difficultyOf);
  const shop = useGameStore((s) => s.shop);
  const placeDecor = useGameStore((s) => s.placeDecor);
  const openShop = useGameStore((s) => s.openShop);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const [notice, setNotice] = useState<string | null>(null);
  const slots = slotsOf(hallMapOf(map)).map((object) => object.slot as { id: string; size: DecorSize });
  const placed = shop.decor[map] ?? {};
  const owned = ownedDecor(shop);
  const title = fmt(ui.decor.title, { map: ui.difficulty[map].name });

  const set = (slot: { id: string; size: DecorSize }, decor: Decor | null) => {
    placeDecor(slot, decor);
    playSfx(decor ? "equip" : "click");
    setNotice(decor ? fmt(ui.decor.placed, { name: nameOf(decor) }) : ui.decor.removed);
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="decor" data-map={map}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🎨 {title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="decor-close" onClick={closeOverlay}>
            {ui.decor.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.decor.intro}</p>
        <p className="min-h-6 text-sm font-bold text-teal-dark" role="status" data-testid="decor-notice">
          {notice}
        </p>
        <ul className="flex flex-col gap-2">
          {slots.map((slot, index) => {
            const current = placed[slot.id];
            const choices = owned.filter((decor) => DECOR[decor].size === slot.size);
            const label = `${fmt(ui.decor.slot, { n: index + 1 })} · ${ui.decor.slotAt[slot.size]}`;
            return (
              <li key={slot.id} className="rounded-lg border-[3px] border-ink bg-paper p-2" data-testid={`decor-slot-${slot.id}`} data-size={slot.size} data-decor={current ?? ""}>
                <div className="mb-1 text-sm font-extrabold">{label}</div>
                {choices.length === 0 ? (
                  <p className="text-sm text-slate">{ui.decor.none}</p>
                ) : (
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!current}
                      data-testid={`decor-${slot.id}-none`}
                      onClick={() => set(slot, null)}
                      className={`flex min-h-11 items-center rounded-lg border-[3px] border-ink px-3 text-sm font-bold ${!current ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-cream hover:bg-teal-light"}`}
                    >
                      {ui.decor.empty}
                    </button>
                    {choices.map((decor) => (
                      <button
                        key={decor}
                        type="button"
                        role="radio"
                        aria-checked={current === decor}
                        data-testid={`decor-${slot.id}-${decor}`}
                        onClick={() => set(slot, decor)}
                        className={`flex min-h-11 items-center gap-1 rounded-lg border-[3px] border-ink p-1 pr-2 text-sm font-bold ${current === decor ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-cream hover:bg-teal-light"}`}
                      >
                        <img src={art.decor(decor)} alt="" className="pixelated h-9 w-9 object-contain" />
                        {nameOf(decor)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-ghost self-end text-sm" data-testid="decor-to-shop" onClick={() => openShop()}>
          🛒 {ui.decor.toShop}
        </button>
      </div>
    </div>
  );
}
