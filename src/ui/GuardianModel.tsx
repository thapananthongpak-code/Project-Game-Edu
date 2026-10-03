import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import type { BattleSpec } from "../state/campaign";
import { type Gear, matchupOf, resistOf } from "../state/gear";
import { PAINT_FILTER, type Paint } from "../state/shop.config";
import { art } from "./art";

/**
 * หุ่นการ์เดียนที่ใส่เกราะและถืออาวุธนั้นจริง (ภาพ GD-* แก้จากหุ่นตัวเดิมด้วย Pixel Lab ไม่ใช่ภาพอาวุธแปะทับ)
 * ชิปที่ติดตั้งเรืองแสงที่อก สีหุ่นย้อมด้วย CSS filter ใช้ทั้งแท่นการ์เดียนและฉากต่อสู้
 */
export function GuardianModel({ gear, paint, className = "" }: { gear: Gear; paint: Paint; className?: string }) {
  return (
    <div className={`relative ${className}`} data-testid="guardian-model" data-weapon={gear.weapon} data-armor={gear.armor} data-chip={gear.chip}>
      <img src={art.guardian(gear.armor, gear.weapon)} alt="" className="pixelated h-full w-full object-contain" style={{ filter: PAINT_FILTER[paint] }} />
      {gear.chip !== "none" && <span className={`guardian-chip guardian-chip-${gear.chip}`} aria-hidden="true" />}
    </div>
  );
}

const TONE = { strong: "bg-hint", even: "bg-cream", weak: "bg-[#f8e1e5]" } as const;

/** ความเข้ากันของอาวุธที่ใส่อยู่กับคู่ต่อสู้ทุกร่างของด่าน: ร่างนั้นแพ้ทางอะไร ทนอะไร และผลกับอาวุธของเรา */
export function MatchupList({ spec, weapon }: { spec: BattleSpec; weapon: Gear["weapon"] }) {
  return (
    <ul className="flex flex-col gap-1" data-testid="matchups">
      {spec.forms.map((form) => {
        const matchup = matchupOf(weapon, form.weak);
        return (
          <li key={form.art} className={`rounded-md border-2 border-ink px-2 py-1 text-sm ${TONE[matchup]}`} data-testid="matchup" data-foe={form.art} data-matchup={matchup}>
            <div className="font-bold">{fmt(ui.matchup.foe, { kaiju: foeName(form.art), weak: ui.storage.weaponClasses[form.weak], resist: ui.storage.weaponClasses[resistOf(form.weak)] })}</div>
            <div>
              <span className="mr-1 rounded border-2 border-ink bg-paper px-1 text-xs font-extrabold">{ui.matchup.names[matchup]}</span>
              {ui.matchup.effects[matchup]}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
