import { playSfx } from "../audio/engine";
import { fmt, ui } from "../content/ui-strings";
import { useGameStore } from "../state/gameStore";
import { AVATARS, OUTFITS } from "../state/shop.config";
import { art } from "./art";
import { useDialog } from "./useDialog";

type ItemId = keyof typeof ui.shop.items;

/** ตู้เสื้อผ้าในโรงเก็บหุ่น: เลือกตัวละครและสวมชุดที่มี (ชุดเครื่องแบบให้สิทธิพิเศษในการต่อสู้ GDD ข้อ 13) */
export function Wardrobe() {
  const profile = useGameStore((s) => s.profile);
  const shop = useGameStore((s) => s.shop);
  const equip = useGameStore((s) => s.equip);
  const setAvatar = useGameStore((s) => s.setAvatar);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const avatar = profile?.avatar ?? "a";
  const owned = OUTFITS.filter((outfit) => outfit === "lab" || shop.owned.includes(`outfit-${outfit}`));

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="wardrobe">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.wardrobe.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">👕 {ui.wardrobe.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="wardrobe-close" onClick={closeOverlay}>
            {ui.wardrobe.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.wardrobe.intro}</p>
        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.wardrobe.avatar}</h3>
          <div role="radiogroup" aria-label={ui.wardrobe.avatar} className="flex flex-wrap gap-2">
            {AVATARS.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={avatar === choice}
                data-testid={`wardrobe-avatar-${choice}`}
                onClick={() => (playSfx("click"), setAvatar(choice))}
                className={`flex min-h-11 items-center gap-2 rounded-lg border-[3px] border-ink p-1 pr-3 font-bold ${avatar === choice ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
              >
                <img src={art.player(choice, shop.outfit)} alt="" className="pixelated h-12 w-12" />
                {ui.onboarding.avatars[choice]}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.wardrobe.outfits}</h3>
          <div role="radiogroup" aria-label={ui.wardrobe.outfits} className="grid gap-2 sm:grid-cols-2">
            {owned.map((outfit) => {
              const using = shop.outfit === outfit;
              const strings = ui.shop.items[`outfit-${outfit}` as ItemId];
              const perk = ui.shop.perks[outfit];
              return (
                <button
                  key={outfit}
                  type="button"
                  role="radio"
                  aria-checked={using}
                  data-testid={`wardrobe-outfit-${outfit}`}
                  onClick={() => (playSfx("equip"), equip("outfit", outfit))}
                  className={`flex items-center gap-2 rounded-lg border-[3px] border-ink p-1 pr-2 text-left ${using ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
                >
                  <img src={art.player(avatar, outfit)} alt="" className="pixelated h-14 w-14 shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-extrabold">{strings.name}</span>
                    {perk && <span className="block text-xs font-bold text-teal-dark">⚔ {fmt(ui.shop.perkLabel, { perk })}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
