import { useState } from "react";
import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { modulesOf } from "../state/shop";
import { BIT_MODULES, BIT_SKINS, BIT_SLOTS } from "../state/shop.config";
import { art } from "./art";
import { ItemIcon } from "./BagPicker";
import { useDialog } from "./useDialog";
import { type DragPayload, useGearDrag } from "./useGearDrag";

type ItemId = keyof typeof ui.shop.items;

/**
 * แท่นชาร์จพี่บิตในโรงเก็บหุ่น (GDD ข้อ 13): ติดตั้งโมดูลให้พี่บิตได้ BIT_SLOTS ชิ้นจากที่ซื้อไว้ (เหมือนแท่นการ์เดียน) และเปลี่ยนคอสตูม
 * โมดูลที่ติดตั้งเท่านั้นที่มีผลในด่านต่อสู้ ผู้เล่นจึงต้องเลือกให้เหมาะกับด่าน
 */
export function BitPad() {
  const shop = useGameStore((s) => s.shop);
  const equip = useGameStore((s) => s.equip);
  const toggleModule = useGameStore((s) => s.toggleModule);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const skins = BIT_SKINS.filter((skin) => skin === "classic" || shop.owned.includes(`bit-${skin}`));
  const installed = modulesOf(shop);
  const full = installed.length >= BIT_SLOTS;
  const [notice, setNotice] = useState("");
  const moduleName = (module: string) => ui.shop.items[`module-${module}` as ItemId].name;

  /**
   * ลากโมดูลไปวางที่ช่อง (ช่องเต็มแล้ววางทับช่องไหนจะสลับกับโมดูลในช่องนั้น) ลากคอสตูมไปวางที่ตัวพี่บิตเพื่อเปลี่ยน
   * ลากโมดูลที่ติดตั้งอยู่ออกจากช่องมาวางนอกช่องเพื่อถอด ผลเหมือนปุ่มติดตั้ง/ถอด (toggleModule) ทุกอย่าง
   */
  const drop = (payload: DragPayload, target: string | null) => {
    if (payload.slot === "skin") {
      if (target === "skin" && shop.bit !== payload.value) {
        playSfx("equip");
        equip("bit", payload.value);
        setNotice(fmt(ui.bitPad.costumeOn, { name: ui.shop.items[`bit-${payload.value}` as ItemId].name }));
      } else if (target !== null && target !== "skin" && target !== "tray") setNotice(fmt(ui.bitPad.wrongSlot, { name: ui.shop.items[`bit-${payload.value}` as ItemId].name }));
      return;
    }
    const module = payload.value as (typeof BIT_MODULES)[number];
    const on = installed.includes(module);
    if (payload.from) {
      if (!target?.startsWith("module")) {
        playSfx("equip");
        toggleModule(module);
        setNotice(fmt(ui.bitPad.removed, { name: moduleName(module) }));
      }
      return;
    }
    if (target === "skin") return setNotice(fmt(ui.bitPad.wrongSlot, { name: moduleName(module) }));
    if (!target?.startsWith("module") || on) return;
    playSfx("equip");
    if (full) {
      // ช่องเต็ม: สลับกับโมดูลในช่องที่วางทับ
      const index = Math.min(BIT_SLOTS - 1, Number(target.slice(6)) || 0);
      const out = installed[index];
      if (out) toggleModule(out);
      toggleModule(module);
      setNotice(fmt(ui.bitPad.swapped, { name: moduleName(module) }));
    } else {
      toggleModule(module);
      setNotice(fmt(ui.bitPad.installed, { name: moduleName(module) }));
    }
  };
  const { bind, drag, ghost } = useGearDrag(drop, (payload) =>
    payload.slot === "skin" ? <img src={art.bit(payload.value as (typeof BIT_SKINS)[number])} alt="" className="pixelated h-14 w-14" /> : <ItemIcon value={`module-${payload.value}` as `module-${(typeof BIT_MODULES)[number]}`} className="h-12 w-12" />,
  );

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="bitpad" data-modules={installed.join(",")}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.bitPad.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🔌 {ui.bitPad.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="bitpad-close" onClick={closeOverlay}>
            {ui.bitPad.close}
          </button>
        </div>
        <p className="text-sm text-slate">{fmt(ui.bitPad.intro, { n: BIT_SLOTS })}</p>

        {/* พี่บิตบนแท่นชาร์จ พร้อมช่องโมดูลที่ติดตั้งอยู่ */}
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border-[3px] border-ink bg-teal-light p-2 shadow-[0_4px_0_0_#1a1c2c]" data-testid="bitpad-slots">
          <div data-drop="skin" data-testid="bitpad-bit" data-over={drag?.over === "skin"} className={`shrink-0 rounded-lg border-[3px] p-1 ${drag?.payload.slot === "skin" ? "border-dashed border-teal-dark" : "border-transparent"} ${drag?.over === "skin" ? "bg-hint" : ""}`}>
            <img src={art.bit(shop.bit)} alt="" className="pixelated h-20 w-20" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-sm font-extrabold">{fmt(ui.bitPad.slots, { n: installed.length, total: BIT_SLOTS })}</div>
            <div className="flex gap-2">
              {Array.from({ length: BIT_SLOTS }, (_, i) => {
                const module = installed[i];
                const hot = drag?.payload.slot === "module" && !drag.payload.from;
                return module ? (
                  <span
                    key={i}
                    data-drop={`module${i}`}
                    {...bind({ slot: "module", value: module, from: true })}
                    className={`flex min-h-12 flex-1 items-center gap-1 rounded-lg border-[3px] px-2 text-sm font-bold ${hot ? "border-dashed border-teal-dark" : "border-ink"} ${drag?.over === `module${i}` ? "bg-paper" : "bg-hint"}`}
                    data-testid={`bitpad-slot-${i}`}
                    data-module={module}
                  >
                    <ItemIcon value={`module-${module}`} className="h-8 w-8 shrink-0" />
                    {moduleName(module)}
                  </span>
                ) : (
                  <span
                    key={i}
                    data-drop={`module${i}`}
                    className={`flex min-h-12 flex-1 items-center justify-center rounded-lg border-[3px] border-dashed text-sm font-bold ${hot ? "border-teal-dark text-teal-dark" : "border-slate text-slate"} ${drag?.over === `module${i}` ? "bg-hint" : ""}`}
                    data-testid={`bitpad-slot-${i}`}
                    data-module=""
                  >
                    {ui.bitPad.emptySlot}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <p className="min-h-5 text-sm font-bold text-teal-dark" role="status" data-testid="bitpad-notice">
          {notice}
        </p>
        <section data-drop="tray">
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.bitPad.modules}</h3>
          <ul className="flex flex-col gap-1">
            {BIT_MODULES.map((module) => {
              const owned = shop.owned.includes(`module-${module}`);
              const on = installed.includes(module);
              const strings = ui.shop.items[`module-${module}` as ItemId];
              return (
                <li key={module} className={`flex items-center gap-2 rounded-md border-2 border-ink px-2 py-1 ${on ? "bg-hint" : owned ? "bg-paper" : "border-dashed bg-cream"}`} data-testid={`bitpad-module-${module}`} data-owned={owned} data-installed={on}>
                  <span className="shrink-0" {...(owned ? bind({ slot: "module", value: module }) : {})}>
                    <ItemIcon value={`module-${module}`} className={`h-8 w-8 ${owned ? "" : "opacity-50 grayscale"}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">{strings.name}</span>
                    <span className="block text-xs text-slate">{strings.detail}</span>
                  </span>
                  {owned ? (
                    <button
                      type="button"
                      className={`btn !min-h-9 shrink-0 !px-2 text-xs ${on ? "btn-ghost" : ""}`}
                      aria-pressed={on}
                      disabled={!on && full}
                      data-testid={`bitpad-toggle-${module}`}
                      onClick={() => (playSfx("equip"), toggleModule(module))}
                    >
                      {on ? ui.bitPad.uninstall : full ? ui.bitPad.full : ui.bitPad.install}
                    </button>
                  ) : (
                    <span className="shrink-0 rounded border-2 border-ink bg-cream px-2 text-xs font-bold">{ui.bitPad.missing}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

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
                  {...bind({ slot: "skin", value: skin })}
                  className={`flex flex-col items-center gap-1 rounded-lg border-[3px] border-ink p-1 text-sm font-bold ${using ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
                >
                  <img src={art.bit(skin)} alt="" className="pixelated h-14 w-14" />
                  {ui.shop.items[`bit-${skin}` as ItemId].name}
                </button>
              );
            })}
          </div>
        </section>
      </div>
      {ghost}
    </div>
  );
}
