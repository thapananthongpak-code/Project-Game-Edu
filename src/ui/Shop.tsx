import { useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { creditsOf, useGameStore } from "../state/gameStore";
import { ownsItem } from "../state/shop";
import { AVATARS, type BitModule, type BitSkin, CATALOG, PAINT_FILTER, type Outfit, type Paint, type ShopItem, type Supply } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
type Kind = ShopItem["kind"];
const KINDS = ["outfit", "bit", "module", "paint", "supply"] as const;
const SUPPLY_ICON: Record<Supply, string> = { "repair-kit": "🧰", shield: "🛡", overcharge: "🔋", analyzer: "🔍", reboot: "💠" };
const MODULE_ICON: Record<BitModule, string> = { scanner: "📡", laser: "🔫", medic: "🩹" };

/** ของเริ่มต้นที่ทุกคนมี แสดงคู่กับของในร้านเพื่อให้สลับกลับได้ */
const DEFAULTS: Partial<Record<Kind, { id: string; value: string }>> = {
  outfit: { id: "outfit-lab", value: "lab" },
  bit: { id: "bit-classic", value: "classic" },
  paint: { id: "paint-standard", value: "standard" },
};

/**
 * ร้านสหกรณ์แล็บ ตู้เสื้อผ้า และร้านพิเศษของ NPC (GDD ข้อ 13 และ 16)
 * ซื้อชุด คอสตูมและโมดูลอัปเกรดของพี่บิต สีการ์เดียน และของใช้ในการต่อสู้ด้วยเครดิตวิจัย
 * ร้านพิเศษขายเฉพาะของของ NPC คนนั้น ของที่ซื้อจากร้านพิเศษแล้วกลับมาสลับใช้ได้ที่ร้านสหกรณ์และตู้เสื้อผ้า
 */
export function Shop() {
  const profile = useGameStore((s) => s.profile);
  const shop = useGameStore((s) => s.shop);
  const vendor = useGameStore((s) => s.shopVendor);
  const balance = useGameStore(creditsOf);
  const buy = useGameStore((s) => s.buy);
  const equip = useGameStore((s) => s.equip);
  const setAvatar = useGameStore((s) => s.setAvatar);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const [notice, setNotice] = useState<string | null>(null);
  const avatar = profile?.avatar ?? "a";
  const seller = vendor === "archivist" || vendor === "vendor" ? ui.npc[vendor] : null;
  const title = seller ? seller.shopName : ui.shop.title;
  // ร้านพิเศษ: เฉพาะของของ NPC คนนั้น ร้านสหกรณ์: ของทั่วไป และของจากร้านพิเศษที่ซื้อมาแล้ว (ไว้สลับใช้)
  const items = CATALOG.filter((item) => (vendor ? item.vendor === vendor : !item.vendor || shop.owned.includes(item.id)));

  const purchase = (item: ShopItem) => {
    const error = buy(item.id);
    if (error === "credits") return setNotice(ui.shop.notEnough);
    if (error) return;
    playSfx("buy");
    setNotice(fmt(ui.shop.bought, { name: ui.shop.items[item.id as ItemId].name }));
  };

  const picture = (kind: Kind, value: string) =>
    kind === "outfit" ? (
      <img src={art.player(avatar, value as Outfit)} alt="" className="pixelated h-16 w-16" />
    ) : kind === "bit" ? (
      <img src={art.bit(value as BitSkin)} alt="" className="pixelated h-16 w-16" />
    ) : kind === "paint" ? (
      <img src={art.robot} alt="" className="pixelated h-16 w-16" style={{ filter: PAINT_FILTER[value as Paint] }} />
    ) : (
      <span className="flex h-16 w-16 items-center justify-center text-4xl" aria-hidden="true">
        {kind === "module" ? MODULE_ICON[value as BitModule] : SUPPLY_ICON[value as Supply]}
      </span>
    );

  const card = (id: string, kind: Kind, value: string, item: ShopItem | null) => {
    const strings = ui.shop.items[id as ItemId];
    const owned = item === null || ownsItem(shop, item);
    const using = kind === "outfit" ? shop.outfit === value : kind === "paint" ? shop.paint === value : kind === "bit" ? shop.bit === value : kind === "module" && owned;
    return (
      <li key={id} className={`flex items-center gap-3 rounded-lg border-[3px] border-ink p-2 ${using ? "bg-hint" : "bg-paper"}`} data-testid={`shop-item-${id}`} data-owned={owned} data-using={using}>
        <div className="shrink-0 rounded-md border-2 border-ink bg-teal-light">{picture(kind, value)}</div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{strings.name}</div>
          <div className="text-sm text-slate">{strings.detail}</div>
          {kind === "outfit" && ui.shop.perks[value as Outfit] && <div className="text-sm font-bold text-teal-dark">⚔ {fmt(ui.shop.perkLabel, { perk: ui.shop.perks[value as Outfit] })}</div>}
          {item && item.kind === "supply" && <div className="text-xs font-bold text-slate">{fmt(ui.shop.holding, { n: shop.supplies[item.value], max: item.max })}</div>}
          {item && !owned && <div className="text-sm font-bold text-teal-dark">{fmt(ui.shop.price, { n: item.price })}</div>}
        </div>
        {kind === "supply" || !owned ? (
          <button type="button" className="btn !min-h-10 shrink-0 text-sm" disabled={owned || (item !== null && balance < item.price)} data-testid={`shop-buy-${id}`} onClick={() => item && purchase(item)}>
            {owned && item?.kind === "supply" ? fmt(ui.shop.full, { n: item.max }) : ui.shop.buy}
          </button>
        ) : kind === "module" ? (
          <span className="shrink-0 rounded-md border-2 border-ink bg-cream px-2 py-1 text-sm font-bold">{ui.shop.installed}</span>
        ) : (
          <button type="button" className="btn btn-ghost !min-h-10 shrink-0 text-sm" disabled={using} data-testid={`shop-wear-${id}`} onClick={() => (playSfx("click"), equip(kind as "outfit" | "paint" | "bit", value))}>
            {using ? ui.shop.wearing : ui.shop.wear}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="shop" data-vendor={vendor ?? undefined}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🛒 {title}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-md border-2 border-ink bg-hint px-2 py-0.5 font-extrabold" data-testid="shop-balance" data-balance={balance}>
              {fmt(ui.shop.balance, { n: balance })}
            </span>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="shop-close" onClick={closeOverlay}>
              {ui.shop.close}
            </button>
          </div>
        </div>
        {seller && vendor ? (
          <div className="flex items-center gap-3 rounded-md border-2 border-ink bg-teal-light px-3 py-2" data-testid="shop-vendor">
            <img src={art.npc(vendor)} alt="" className="pixelated h-14 w-14 shrink-0" />
            <p className="text-sm font-semibold">
              <span className="mr-1 font-extrabold">{seller.name}:</span>
              {seller.greet}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate">{ui.shop.earnNote}</p>
        )}
        <p className="min-h-6 text-sm font-bold text-teal-dark" role="status" data-testid="shop-notice">
          {notice}
        </p>

        {!vendor && (
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
        )}

        {KINDS.map((kind) => {
          const listed = items.filter((item) => item.kind === kind);
          const fallback = vendor ? undefined : DEFAULTS[kind];
          if (listed.length === 0 && !fallback) return null;
          return (
            <section key={kind} data-testid={`shop-section-${kind}`}>
              <h3 className="mb-1 text-xs font-bold text-slate">{ui.shop.tabs[kind]}</h3>
              <ul className="flex flex-col gap-2">
                {fallback && card(fallback.id, kind, fallback.value, null)}
                {listed.map((item) => card(item.id, item.kind, item.value, item))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
