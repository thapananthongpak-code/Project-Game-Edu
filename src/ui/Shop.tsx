import { useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { creditsOf, difficultyOf, guardianPowerOf, reachedMap, useGameStore } from "../state/gameStore";
import { type Gear, itemPower } from "../state/gear";
import { bagOf, ownsItem, stockLeft, tierOpen } from "../state/shop";
import { type BitModule, type BitSkin, CATALOG, DECOR, type Decor, PAINT_FILTER, type Outfit, type Paint, type ShopItem, STARTER_DECOR, type Supply } from "../state/shop.config";
import { art } from "./art";
import { ItemIcon } from "./BagPicker";
import { GearIcon } from "./Storage";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;
const DECOR_SIZE = (decor: Decor) => DECOR[decor].size;
type Kind = ShopItem["kind"];
const KINDS = ["weapon", "armor", "chip", "supply", "outfit", "bit", "module", "paint", "decor"] as const;
const GEAR_KINDS: readonly Kind[] = ["weapon", "armor", "chip"];


/**
 * ร้านสหกรณ์แล็บ ตู้เสื้อผ้า และร้านพิเศษของ NPC (GDD ข้อ 13 และ 16)
 * ซื้ออุปกรณ์ของการ์เดียน (อาวุธ เกราะ ชิป) ชุด คอสตูมและโมดูลอัปเกรดของพี่บิต สีการ์เดียน และของใช้ในการต่อสู้ด้วยเครดิตวิจัย
 * ร้านขายอย่างเดียว ของที่ซื้อแล้วใส่ที่จุดปรับแต่งในโรงเก็บหุ่น: ชุดที่ตู้เสื้อผ้า อุปกรณ์และสีที่แท่นการ์เดียน คอสตูมของพี่บิตที่แท่นปรับแต่งพี่บิต
 * ร้านพิเศษขายเฉพาะของของ NPC คนนั้น
 */
export function Shop() {
  const profile = useGameStore((s) => s.profile);
  const shop = useGameStore((s) => s.shop);
  const vendor = useGameStore((s) => s.shopVendor);
  const balance = useGameStore(creditsOf);
  const power = useGameStore((s) => guardianPowerOf(s));
  const map = useGameStore(difficultyOf);
  const reached = useGameStore(reachedMap);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const bag = bagOf(shop);
  const buy = useGameStore((s) => s.buy);
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
    if (error === "sold-out") return setNotice(ui.shop.soldOut);
    if (error) return;
    playSfx("buy");
    setNotice(fmt(ui.shop.bought, { name: ui.shop.items[item.id as ItemId].name }));
  };

  const picture = (kind: Kind, value: string) =>
    kind === "outfit" ? (
      <img src={art.player(avatar, value as Outfit)} alt="" className="pixelated h-16 w-16" />
    ) : kind === "bit" ? (
      <img src={art.bit(value as BitSkin)} alt="" className="pixelated h-16 w-16" />
    ) : GEAR_KINDS.includes(kind) ? (
      <GearIcon value={value as Gear[keyof Gear]} className="h-16 w-16" />
    ) : kind === "paint" ? (
      <img src={art.robot} alt="" className="pixelated h-16 w-16" style={{ filter: PAINT_FILTER[value as Paint] }} />
    ) : kind === "decor" ? (
      <img src={art.decor(value as Decor)} alt="" className="pixelated h-16 w-16 object-contain" />
    ) : (
      <ItemIcon value={kind === "module" ? `module-${value as BitModule}` : (value as Supply)} className="h-16 w-16" />
    );

  const card = (id: string, kind: Kind, value: string, item: ShopItem | null) => {
    const strings = ui.shop.items[id as ItemId];
    const owned = item === null || ownsItem(shop, item);
    const using = kind === "module" || kind === "decor" ? owned : kind !== "supply" && shop[kind] === value;
    const gain = kind === "supply" || kind === "decor" ? 0 : itemPower(kind, value);
    // ของที่วางขายตั้งแต่แมพถัดไป: เห็นได้แต่ยังซื้อไม่ได้
    const lockedTier = item !== null && !tierOpen(item, reached);
    const left = item?.kind === "supply" ? stockLeft(shop, item, map) : null;
    return (
      <li key={id} className={`flex items-center gap-3 rounded-lg border-[3px] border-ink p-2 ${using ? "bg-hint" : lockedTier ? "border-dashed bg-cream" : "bg-paper"}`} data-testid={`shop-item-${id}`} data-owned={owned} data-using={using} data-locked={lockedTier} data-stock={left ?? undefined}>
        <div className="shrink-0 rounded-md border-2 border-ink bg-teal-light">{picture(kind, value)}</div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">{strings.name}</div>
          <div className="text-sm text-slate">{strings.detail}</div>
          {kind === "outfit" && ui.shop.perks[value as Outfit] && <div className="text-sm font-bold text-teal-dark">⚔ {fmt(ui.shop.perkLabel, { perk: ui.shop.perks[value as Outfit] })}</div>}
          {gain > 0 && (
            <div className="text-sm font-bold text-teal-dark" data-testid={`shop-power-${id}`}>
              ⚡ {fmt(ui.shop.powerGain, { n: gain })}
            </div>
          )}
          {kind === "decor" && <div className="text-xs font-bold text-slate">{ui.shop.decorSizes[DECOR_SIZE(value as Decor)]}</div>}
          {item && item.kind === "supply" && (
            <div className="text-xs font-bold text-slate">
              {fmt(ui.shop.holding, { n: shop.supplies[item.value], max: item.max })} · {fmt(ui.shop.inBag, { n: bag.filter((supply) => supply === item.value).length })} · {left === 0 ? ui.shop.soldOut : fmt(ui.shop.stock, { n: left ?? 0 })}
            </div>
          )}
          {item && !owned && <div className="text-sm font-bold text-teal-dark">{fmt(ui.shop.price, { n: item.price })}</div>}
        </div>
        {lockedTier ? (
          <span className="shrink-0 rounded-md border-2 border-ink bg-cream px-2 py-1 text-xs font-bold" data-testid={`shop-locked-${id}`}>
            🔒 {fmt(ui.shop.locked, { map: ui.difficulty[item?.tier ?? "easy"].name })}
          </span>
        ) : kind === "supply" || !owned ? (
          <button type="button" className="btn !min-h-10 shrink-0 text-sm" disabled={owned || left === 0 || (item !== null && balance < item.price)} data-testid={`shop-buy-${id}`} onClick={() => item && purchase(item)}>
            {owned && item?.kind === "supply" ? fmt(ui.shop.full, { n: item.max }) : ui.shop.buy}
          </button>
        ) : (
          <span className="max-w-40 shrink-0 rounded-md border-2 border-ink bg-cream px-2 py-1 text-xs font-bold" data-testid={`shop-owned-${id}`}>
            ✓ {ui.shop.owned} · {ui.shop.ownedAt[kind]}
          </span>
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
            <span className="rounded-md border-2 border-ink bg-teal-light px-2 py-0.5 text-sm font-extrabold" data-testid="shop-power" data-power={power}>
              ⚡ {fmt(ui.shop.power, { n: power })}
            </span>
            <span className="flex items-center gap-1 rounded-md border-2 border-ink bg-hint px-2 py-0.5 font-extrabold" data-testid="shop-balance" data-balance={balance}>
              <img src={art.credit} alt="" className="pixelated h-5 w-5" />
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

        {KINDS.map((kind) => {
          const listed = items.filter((item) => item.kind === kind);
          if (listed.length === 0) return null;
          const starters = kind === "decor" && !vendor ? STARTER_DECOR : [];
          return (
            <section key={kind} data-testid={`shop-section-${kind}`}>
              <h3 className="mb-1 text-xs font-bold text-slate">{ui.shop.tabs[kind]}</h3>
              {kind === "weapon" && <p className="mb-1 text-sm text-slate">{ui.shop.gearNote}</p>}
              {kind === "decor" && (
                <button type="button" className="btn btn-ghost mb-2 !min-h-9 text-sm" data-testid="shop-open-decor" onClick={() => openOverlay("decor")}>
                  🎨 {ui.shop.placeDecor}
                </button>
              )}
              <ul className="flex flex-col gap-2">
                {starters.map((decor) => card(`decor-${decor}`, "decor", decor, null))}
                {listed.map((item) => card(item.id, item.kind, item.value, item))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
