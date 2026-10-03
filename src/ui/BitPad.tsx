import { playSfx } from "../audio/engine";
import { ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { BIT_MODULES, BIT_SKINS } from "../state/shop.config";
import { art } from "./art";
import { ItemIcon } from "./BagPicker";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;

/** แท่นปรับแต่งพี่บิตในโรงเก็บหุ่น: เปลี่ยนคอสตูม และดูโมดูลอัปเกรดที่ติดตั้งแล้ว (GDD ข้อ 13) */
export function BitPad() {
  const shop = useGameStore((s) => s.shop);
  const equip = useGameStore((s) => s.equip);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const skins = BIT_SKINS.filter((skin) => skin === "classic" || shop.owned.includes(`bit-${skin}`));

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="bitpad">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.bitPad.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🛠 {ui.bitPad.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="bitpad-close" onClick={closeOverlay}>
            {ui.bitPad.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.bitPad.intro}</p>
        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.bitPad.skins}</h3>
          <div role="radiogroup" aria-label={ui.bitPad.skins} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {skins.map((skin) => {
              const using = shop.bit === skin;
              return (
                <button
                  key={skin}
                  type="button"
                  role="radio"
                  aria-checked={using}
                  data-testid={`bitpad-skin-${skin}`}
                  onClick={() => (playSfx("equip"), equip("bit", skin))}
                  className={`flex flex-col items-center gap-1 rounded-lg border-[3px] border-ink p-1 text-sm font-bold ${using ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
                >
                  <img src={art.bit(skin)} alt="" className="pixelated h-14 w-14" />
                  {ui.shop.items[`bit-${skin}` as ItemId].name}
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.bitPad.modules}</h3>
          <ul className="flex flex-col gap-1">
            {BIT_MODULES.map((module) => {
              const owned = shop.owned.includes(`module-${module}`);
              const strings = ui.shop.items[`module-${module}` as ItemId];
              return (
                <li key={module} className={`flex items-center gap-2 rounded-md border-2 border-ink px-2 py-1 ${owned ? "bg-teal-light" : "bg-paper"}`} data-testid={`bitpad-module-${module}`} data-owned={owned}>
                  <ItemIcon value={`module-${module}`} className={`h-8 w-8 ${owned ? "" : "opacity-50 grayscale"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">{strings.name}</span>
                    <span className="block text-xs text-slate">{strings.detail}</span>
                  </span>
                  <span className="shrink-0 rounded border-2 border-ink bg-cream px-2 text-xs font-bold">{owned ? ui.bitPad.installed : ui.bitPad.missing}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
