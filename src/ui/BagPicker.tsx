import { playSfx } from "../audio/engine";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import type { BattleSpec } from "../state/campaign";
import { useGameStore } from "../state/gameStore";
import { BAG_SIZE } from "../state/gear";
import { adviseBag, missingAdvice } from "../state/loadout";
import { bagOf } from "../state/shop";
import { SUPPLIES, type Supply } from "../state/shop.config";
import { useBit } from "./useBit";

export const SUPPLY_ICON: Record<Supply, string> = { "repair-kit": "🧰", shield: "🛡", overcharge: "🔋", analyzer: "🔍", reboot: "💠" };
const nameOf = (supply: Supply): string => ui.shop.items[`supply-${supply}`].name;
const sameBag = (a: readonly Supply[], b: readonly Supply[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * กระเป๋าสำหรับออกปฏิบัติการ (GDD ข้อ 17): ของใช้พกเข้าด่านได้ BAG_SIZE ชิ้น ที่เหลืออยู่ในกล่องเก็บไอเทม
 * พี่บิตแนะนำของที่เหมาะกับลักษณะของคู่ต่อสู้ในด่าน spec (null = ยังไม่มีด่านที่รออยู่)
 */
export function BagPicker({ spec }: { spec: BattleSpec | null }) {
  const shop = useGameStore((s) => s.shop);
  const packBag = useGameStore((s) => s.packBag);
  const bit = useBit();
  const bag = bagOf(shop);
  const advice = spec ? adviseBag(spec, shop.supplies) : [];
  const missing = spec ? missingAdvice(spec, shop.supplies) : [];
  const owned = SUPPLIES.filter((supply) => shop.supplies[supply] > 0);
  const traits = spec ? [...new Set(spec.forms.map((form) => form.trait))] : [];
  const list = (supplies: readonly Supply[]) => supplies.map(nameOf).join(" · ");

  const pack = (next: Supply[]) => {
    playSfx("click");
    packBag(next);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="bag-picker" data-bag={bag.join(",")}>
      <div className="flex items-start gap-2 rounded-md border-2 border-ink bg-teal-light px-2 py-1.5" data-testid="bag-advice" data-advice={advice.join(",")}>
        <img src={bit} alt="" className="pixelated h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-extrabold">
            {ui.storage.adviceTitle}
            {spec && <span className="ml-1 font-bold text-slate">{fmt(ui.storage.adviceFor, { kaiju: foeName(spec.forms[0].art) })}</span>}
          </div>
          {spec ? (
            <>
              {traits.map((trait) => (
                <p key={trait}>{ui.storage.reason[trait]}</p>
              ))}
              {advice.length > 0 && <p className="font-bold">{fmt(ui.storage.adviceBring, { list: list(advice) })}</p>}
              {missing.length > 0 && (
                <p className="font-bold text-slate" data-testid="bag-missing">
                  {fmt(ui.storage.adviceMissing, { list: list(missing) })}
                </p>
              )}
            </>
          ) : (
            <p>{ui.storage.adviceNone}</p>
          )}
        </div>
        {spec && advice.length > 0 && (
          <button type="button" className="btn !min-h-9 shrink-0 !px-2 text-xs" data-testid="bag-apply-advice" disabled={sameBag(bag, advice)} onClick={() => pack(advice)}>
            {ui.storage.applyAdvice}
          </button>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-bold text-slate">
          {ui.storage.bagTitle} · {fmt(ui.battle.bag, { n: bag.length, total: BAG_SIZE })}
        </h3>
        <ul className="grid grid-cols-3 gap-2">
          {Array.from({ length: BAG_SIZE }, (_, i) => {
            const supply = bag[i];
            return (
              <li key={i}>
                {supply ? (
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border-[3px] border-ink bg-hint px-1 text-xs font-bold hover:bg-cream"
                    data-testid={`bag-slot-${i}`}
                    data-supply={supply}
                    aria-label={fmt(ui.storage.remove, { name: nameOf(supply) })}
                    onClick={() => pack(bag.filter((_, at) => at !== i))}
                  >
                    <span aria-hidden="true">{SUPPLY_ICON[supply]}</span>
                    {nameOf(supply)}
                    <span aria-hidden="true">✕</span>
                  </button>
                ) : (
                  <div className="flex min-h-11 items-center justify-center rounded-lg border-[3px] border-dashed border-slate px-1 text-xs font-bold text-slate" data-testid={`bag-slot-${i}`} data-supply="">
                    {ui.storage.emptySlot}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-bold text-slate">{ui.storage.boxTitle}</h3>
        {owned.length === 0 ? (
          <p className="text-sm text-slate" data-testid="bag-box-empty">
            {ui.storage.boxEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {owned.map((supply) => {
              const inBag = bag.filter((s) => s === supply).length;
              return (
                <li key={supply} className="flex items-center gap-2 rounded-md border-2 border-ink bg-paper px-2 py-1" data-testid={`bag-stock-${supply}`} data-stock={shop.supplies[supply]} data-in-bag={inBag}>
                  <span className="text-xl" aria-hidden="true">
                    {SUPPLY_ICON[supply]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold">{nameOf(supply)}</div>
                    <div className="text-xs text-slate">{fmt(ui.storage.stock, { n: shop.supplies[supply], bag: inBag })}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-9 shrink-0 !px-2 text-xs"
                    data-testid={`bag-add-${supply}`}
                    disabled={bag.length >= BAG_SIZE || inBag >= shop.supplies[supply] || (supply === "reboot" && inBag >= 1)}
                    onClick={() => pack([...bag, supply])}
                  >
                    {ui.storage.add}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
