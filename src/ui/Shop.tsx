import { useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { creditBalance, ownsItem } from "../state/shop";
import { AVATARS, CATALOG, PAINT_FILTER, type Outfit, type Paint, type ShopItem } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
const KINDS = ["outfit", "paint", "supply"] as const;
const SUPPLY_ICON = { "repair-kit": "🧰", shield: "🛡" } as const;

/** ของเริ่มต้นที่ทุกคนมี แสดงคู่กับของในร้านเพื่อให้สลับกลับได้ */
const DEFAULTS = { outfit: { id: "outfit-lab", value: "lab" as Outfit }, paint: { id: "paint-standard", value: "standard" as Paint } };

/** ร้านสหกรณ์แล็บและตู้เสื้อผ้า (GDD ข้อ 13): ซื้อชุด สีการ์เดียน และของใช้ในการต่อสู้ด้วยเครดิตวิจัย เปลี่ยนตัวละครและชุดที่มี */
export function Shop() {
  const profile = useGameStore((s) => s.profile);
  const shop = useGameStore((s) => s.shop);
  const balance = useGameStore((s) => creditBalance({ rooms: s.progress, posttest: s.posttest }, s.shop));
  const buy = useGameStore((s) => s.buy);
  const equip = useGameStore((s) => s.equip);
  const setAvatar = useGameStore((s) => s.setAvatar);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const [notice, setNotice] = useState<string | null>(null);
  const avatar = profile?.avatar ?? "a";

  const purchase = (item: ShopItem) => {
    const error = buy(item.id);
    if (error === "credits") return setNotice(ui.shop.notEnough);
    if (error) return;
    playSfx("buy");
    setNotice(fmt(ui.shop.bought, { name: ui.shop.items[item.id as ItemId].name }));
  };

  const picture = (kind: ShopItem["kind"], value: string) =>
    kind === "outfit" ? (
      <img src={art.player(avatar, value as Outfit)} alt="" className="pixelated h-16 w-16" />
    ) : kind === "paint" ? (
      <img src={art.robot} alt="" className="pixelated h-16 w-16" style={{ filter: PAINT_FILTER[value as Paint] }} />
    ) : (
      <span className="flex h-16 w-16 items-center justify-center text-4xl" aria-hidden="true">
        {SUPPLY_ICON[value as keyof typeof SUPPLY_ICON]}
      </span>
    );

  const card = (id: string, kind: ShopItem["kind"], value: string, item: ShopItem | null) => {
    const strings = ui.shop.items[id as ItemId];
    const using = kind === "outfit" ? shop.outfit === value : kind === "paint" ? shop.paint === value : false;
    const owned = item === null || ownsItem(shop, item);
    return (
      <li key={id} className={`flex items-center gap-3 rounded-lg border-[3px] border-ink p-2 ${using ? "bg-hint" : "bg-paper"}`} data-testid={`shop-item-${id}`} data-owned={owned} data-using={using}>
        <div className="shrink-0 rounded-md border-2 border-ink bg-teal-light">{picture(kind, value)}</div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{strings.name}</div>
          <div className="text-sm text-slate">{strings.detail}</div>
          {item && item.kind === "supply" && <div className="text-xs font-bold text-slate">{fmt(ui.shop.holding, { n: shop.supplies[item.value], max: item.max })}</div>}
          {item && !owned && <div className="text-sm font-bold text-teal-dark">{fmt(ui.shop.price, { n: item.price })}</div>}
        </div>
        {kind === "supply" || !owned ? (
          <button type="button" className="btn !min-h-10 shrink-0 text-sm" disabled={owned || (item !== null && balance < item.price)} data-testid={`shop-buy-${id}`} onClick={() => item && purchase(item)}>
            {owned && item?.kind === "supply" ? fmt(ui.shop.full, { n: item.max }) : ui.shop.buy}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost !min-h-10 shrink-0 text-sm" disabled={using} data-testid={`shop-wear-${id}`} onClick={() => (playSfx("click"), equip(kind, value))}>
            {using ? ui.shop.wearing : ui.shop.wear}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="shop">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.shop.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🛒 {ui.shop.title}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-md border-2 border-ink bg-hint px-2 py-0.5 font-extrabold" data-testid="shop-balance" data-balance={balance}>
              {fmt(ui.shop.balance, { n: balance })}
            </span>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="shop-close" onClick={closeOverlay}>
              {ui.shop.close}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate">{ui.shop.earnNote}</p>
        <p className="min-h-6 text-sm font-bold text-teal-dark" role="status" data-testid="shop-notice">
          {notice}
        </p>

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.shop.character}</h3>
          <div className="flex gap-2" role="radiogroup" aria-label={ui.shop.character}>
            {AVATARS.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={avatar === choice}
                data-testid={`shop-avatar-${choice}`}
                onClick={() => setAvatar(choice)}
                className={`flex items-center gap-2 rounded-lg border-[3px] border-ink p-1 pr-3 font-bold ${avatar === choice ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
              >
                <img src={art.player(choice, shop.outfit)} alt="" className="pixelated h-12 w-12" />
                {ui.onboarding.avatars[choice]}
              </button>
            ))}
          </div>
        </section>

        {KINDS.map((kind) => (
          <section key={kind}>
            <h3 className="mb-1 text-xs font-bold text-slate">{ui.shop.tabs[kind]}</h3>
            <ul className="flex flex-col gap-2">
              {kind !== "supply" && card(DEFAULTS[kind].id, kind, DEFAULTS[kind].value, null)}
              {CATALOG.filter((item) => item.kind === kind).map((item) => card(item.id, item.kind, item.value, item))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
