import { useState } from "react";
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
import { type DragPayload, useGearDrag } from "./useGearDrag";

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
  const [notice, setNotice] = useState("");

  const itemName = (slot: string, value: string) => ui.shop.items[`${slot}-${value}` as ItemId]?.name ?? value;
  /** ลากของไปวางบนช่อง: ใส่ได้เฉพาะช่องที่ตรงกัน ลากช่องที่ใส่อยู่ออกมาวางนอกช่องเพื่อถอด (กลับเป็นของเริ่มต้น) */
  const drop = (payload: DragPayload, target: string | null) => {
    const base = SLOTS.find((s) => s.slot === payload.slot)?.base ?? "";
    if (payload.from) {
      if (target !== payload.slot && payload.value !== base) {
        playSfx("equip");
        equip(payload.slot as Slot, base);
        setNotice(fmt(ui.guardianBay.removed, { name: itemName(payload.slot, payload.value) }));
      }
      return;
    }
    if (target === null || target === "tray") return;
    if (target !== payload.slot) return setNotice(fmt(ui.guardianBay.wrongSlot, { name: itemName(payload.slot, payload.value), slot: ui.guardianBay.slots[payload.slot as Slot] }));
    playSfx("equip");
    equip(payload.slot as Slot, payload.value);
    setNotice(fmt(ui.guardianBay.equipped, { name: itemName(payload.slot, payload.value) }));
  };
  const { bind, drag, ghost } = useGearDrag(drop, (payload) =>
    payload.slot === "paint" ? <img src={art.robot} alt="" className="pixelated h-12 w-12" style={{ filter: PAINT_FILTER[payload.value as keyof typeof PAINT_FILTER] }} /> : <GearIcon value={payload.value as Gear[keyof Gear]} className="h-12 w-12" />,
  );

  /** ช่องบนตัวหุ่น: รับของที่ลากมาวาง บอกของที่ใส่อยู่ และมีปุ่มถอด */
  const slotBox = (slot: Slot) => {
    const base = SLOTS.find((s) => s.slot === slot)?.base ?? "";
    const value = shop[slot] as string;
    const bound = value === base ? {} : bind({ slot, value, from: true });
    return (
      <div
        data-drop={slot}
        data-testid={`guardian-slot-${slot}`}
        data-value={value}
        data-over={drag?.over === slot}
        className={`flex min-h-16 items-center gap-2 rounded-lg border-[3px] p-1 ${drag?.payload.slot === slot ? "border-dashed border-teal-dark" : "border-ink"} ${drag?.over === slot ? "bg-hint" : "bg-paper"}`}
      >
        <span {...bound} className="shrink-0">
          {slot === "paint" ? <img src={art.robot} alt="" className="pixelated h-10 w-10" style={{ filter: PAINT_FILTER[value as keyof typeof PAINT_FILTER] }} /> : <GearIcon value={value as Gear[keyof Gear]} className="h-10 w-10" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-slate">{ui.guardianBay.slots[slot]}</span>
          <span className="block text-sm font-extrabold">{value === base && slot === "chip" ? ui.guardianBay.noChip : itemName(slot, value)}</span>
        </span>
        {value !== base && (
          <button type="button" className="btn btn-ghost !min-h-9 shrink-0 !px-2 text-xs" data-testid={`guardian-remove-${slot}`} onClick={() => (playSfx("equip"), equip(slot, base), setNotice(fmt(ui.guardianBay.removed, { name: itemName(slot, value) })))}>
            {ui.guardianBay.remove}
          </button>
        )}
      </div>
    );
  };

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

        {/* ตัวหุ่นกับช่องอุปกรณ์: ลากของจากรายการด้านล่างมาวางที่ช่อง (หรือกดที่ของเพื่อใส่ทันที) */}
        {/* ติดอยู่ด้านบนขณะเลื่อนรายการ ช่องปลายทางจึงอยู่ในจอเสมอตอนลาก */}
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border-[3px] border-ink bg-teal-light p-2 shadow-[0_4px_0_0_#1a1c2c]" data-testid="guardian-doll">
          <div className="flex flex-col gap-2">
            {slotBox("weapon")}
            {slotBox("armor")}
          </div>
          <GuardianModel gear={gear} paint={shop.paint} className="aspect-square w-24 sm:w-40" />
          <div className="flex flex-col gap-2">
            {slotBox("chip")}
            {slotBox("paint")}
          </div>
        </div>
        <p className="min-h-5 text-sm font-bold text-teal-dark" role="status" data-testid="guardian-notice">
          {notice}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1" data-testid="guardian-next">
            <h3 className="mb-1 text-sm font-extrabold">{upcoming ? fmt(ui.guardianBay.next, { kaiju: foeName(upcoming.forms[0].art) }) : ui.guardianBay.noBattle}</h3>
            {upcoming && <MatchupList spec={upcoming} weapon={gear.weapon} />}
            <p className="mt-1 text-xs text-slate">{ui.matchup.rule}</p>
          </div>
        </div>

        {SLOTS.map(({ slot, values, base }) => (
          <section key={slot} data-drop="tray">
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
                      <span className="shrink-0" {...bind({ slot, value })}>
                        {slot === "paint" ? <img src={art.robot} alt="" className="pixelated h-10 w-10 shrink-0" style={{ filter: PAINT_FILTER[value as keyof typeof PAINT_FILTER] }} /> : <GearIcon value={value as Gear[keyof Gear]} className="h-10 w-10 shrink-0" />}
                      </span>
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
      {ghost}
    </div>
  );
}
