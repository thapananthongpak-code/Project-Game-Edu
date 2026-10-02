import { useEffect, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import { battleReference, ROOM_COUNT } from "../content";
import { buildBattleItems, type ChoiceItem } from "../content/choices";
import { kaijuName, storyNames } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { applySupply, type BattleEvent, type BattleState, isCharging, kaijuOf, phaseCount, phaseOf, questionRoom, resolveAnswer, startBattle } from "../state/battle";
import { BATTLE } from "../state/battle.config";
import { roomProgress, useGameStore } from "../state/gameStore";
import { PAINT_FILTER, REWARDS, SUPPLIES, type Supply } from "../state/shop.config";
import { art } from "./art";
import { ChoiceCard } from "./ChoiceCard";
import { PageView } from "./ContentView";
import { useDialog } from "./useDialog";

type Stage = "intro" | "fight" | "won" | "lost";
/** ท่าของตัวละครในฉาก id เปลี่ยนทุกครั้งเพื่อให้แอนิเมชันเล่นใหม่ */
interface Fx {
  id: number;
  robot: "attack" | "hurt" | "guard" | null;
  kaiju: "attack" | "hurt" | "heal" | null;
  assist: boolean;
}

const NO_FX: Fx = { id: 0, robot: null, kaiju: null, assist: false };

function HpBar({ label, hp, max, align }: { label: string; hp: number; max: number; align: "left" | "right" }) {
  return (
    <div className={`absolute top-[4%] w-[44%] ${align === "left" ? "left-[3%]" : "right-[3%] text-right"}`}>
      <div className="inline-block rounded border-2 border-ink bg-cream px-1.5 text-xs font-extrabold leading-5">{label}</div>
      <div className={`mt-0.5 flex gap-[2px] ${align === "right" ? "flex-row-reverse" : ""}`} role="img" aria-label={`${label} ${fmt(ui.battle.hp, { n: hp, total: max })}`} data-testid={`hp-${align}`} data-hp={hp}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-3 min-w-0 flex-1 rounded-sm border-2 border-ink ${i < hp ? (align === "left" ? "bg-teal" : "bg-wrong") : "bg-slate"}`} />
        ))}
      </div>
    </div>
  );
}

function eventText(event: BattleEvent, kaiju: string): string {
  switch (event.type) {
    case "robot-hit":
      return fmt(event.counter ? ui.battle.log.counter : ui.battle.log.robotHit, { n: event.damage });
    case "bit-assist":
      return fmt(ui.battle.log.assist, { n: event.damage });
    case "kaiju-hit":
      return event.blocked ? ui.battle.log.blocked : fmt(event.heavy ? ui.battle.log.heavyHit : ui.battle.log.kaijuHit, { kaiju, n: event.damage });
    case "kaiju-regen":
      return fmt(ui.battle.log.regen, { kaiju, n: event.amount });
    case "phase":
      return fmt(ui.battle.log.phase, { n: event.heal });
    case "repair":
      return fmt(ui.battle.log.repair, { n: event.amount });
    case "shield":
      return ui.battle.log.shield;
  }
}

/**
 * ด่านต่อสู้ไคจู (GDD ข้อ 12): ตอบโจทย์จากเนื้อหาของห้อง ตอบถูกการ์เดียนโจมตี ตอบผิดไคจูโจมตี ไม่จับเวลา
 * แพ้แล้วออกปฏิบัติการใหม่ได้ทันที ความเสียหายที่ทำกับไคจูไว้ยังอยู่ ผู้เรียนทุกคนจึงผ่านด่านได้
 */
export function Battle() {
  const room = useGameStore((s) => s.battleRoom) as number;
  const sortiesBefore = useGameStore((s) => roomProgress(s, room).battle.sorties);
  const supplies = useGameStore((s) => s.shop.supplies);
  const paint = useGameStore((s) => s.shop.paint);
  const style = useGameStore((s) => s.profile?.style ?? "read");
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const recordBattle = useGameStore((s) => s.recordBattle);
  const consumeSupply = useGameStore((s) => s.consumeSupply);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);

  const spec = kaijuOf(room);
  const kaiju = kaijuName(room);
  const [stage, setStage] = useState<Stage>("intro");
  const [state, setState] = useState<BattleState>(() => startBattle(spec));
  const [item, setItem] = useState<ChoiceItem | null>(null);
  const [answered, setAnswered] = useState<number | null | undefined>(undefined);
  const [events, setEvents] = useState<BattleEvent[]>([]);
  const [fx, setFx] = useState<Fx>(NO_FX);
  const [hints, setHints] = useState<number>(BATTLE.hints);
  const [hintOpen, setHintOpen] = useState(false);
  /** เครดิตที่ได้จากการชนะครั้งนี้ (0 = เคยชนะด่านนี้แล้ว) */
  const [credits, setCredits] = useState(0);
  /** โจทย์ที่ยังไม่ได้ใช้ของแต่ละห้อง หมดแล้วสลับใหม่ */
  const queues = useRef(new Map<number, ChoiceItem[]>());
  const alreadyWon = useRef(useGameStore.getState().progress[room]?.battle.won ?? false);

  const draw = (from: BattleState): ChoiceItem => {
    const source = questionRoom(spec, from);
    let queue = queues.current.get(source) ?? [];
    if (queue.length === 0) queue = buildBattleItems(source);
    const [next, ...rest] = queue;
    queues.current.set(source, rest);
    return next;
  };

  const begin = (from: BattleState) => {
    setState(from);
    setItem(draw(from));
    setAnswered(undefined);
    setEvents([]);
    setFx(NO_FX);
    setHints(BATTLE.hints);
    setStage("fight");
    if (isCharging(spec, from)) playSfx("charge");
  };

  const finishSortie = (final: BattleState) => {
    const won = final.status === "won";
    if (won && !alreadyWon.current) setCredits(REWARDS.battle + (sortiesBefore === 0 ? REWARDS.firstSortie : 0));
    recordBattle(room, { won, asked: final.turn, correct: final.correct });
    playSfx(won ? "win" : "lose");
    setStage(won ? "won" : "lost");
  };

  const answer = (option: number | null) => {
    if (!item || answered !== undefined) return;
    const correct = option === item.answer;
    const result = resolveAnswer(spec, state, correct);
    setState(result.state);
    setEvents(result.events);
    setAnswered(option);
    const blocked = result.events.some((e) => e.type === "kaiju-hit" && e.blocked);
    const assist = result.events.some((e) => e.type === "bit-assist");
    setFx({ id: fx.id + 1, robot: correct ? "attack" : blocked ? "guard" : "hurt", kaiju: correct ? "hurt" : result.events.some((e) => e.type === "kaiju-regen") ? "heal" : "attack", assist });
    playSfx(correct ? "hit" : blocked ? "shield" : "hurt");
    if (assist) window.setTimeout(() => playSfx("assist"), 180);
  };

  const next = () => {
    if (state.status !== "fighting") return finishSortie(state);
    setItem(draw(state));
    setAnswered(undefined);
    setEvents([]);
    if (isCharging(spec, state)) playSfx("charge");
  };

  const useItem = (supply: Supply) => {
    const result = applySupply(state, supply);
    if (!result || supplies[supply] <= 0 || !consumeSupply(supply)) return;
    setState(result.state);
    setEvents(result.events);
    setFx({ id: fx.id + 1, robot: "guard", kaiju: null, assist: false });
    playSfx(supply === "repair-kit" ? "heal" : "shield");
  };

  // ออกจากด่านกลางคัน (ถอยกลับ): นับเป็นการออกปฏิบัติการหนึ่งครั้งถ้าตอบไปแล้ว
  const leave = () => {
    if (stage === "fight" && state.turn > 0) recordBattle(room, { won: false, asked: state.turn, correct: state.correct });
    closeOverlay();
  };

  const dialog = useDialog<HTMLDivElement>(hintOpen ? () => setHintOpen(false) : stage === "intro" ? closeOverlay : undefined);
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (answered !== undefined) nextButton.current?.focus({ preventScroll: true });
  }, [answered]);

  const charging = stage === "fight" && answered === undefined && isCharging(spec, state);
  const phases = phaseCount(spec);
  const source = questionRoom(spec, state);
  const title = fmt(ui.battle.title, { n: room, kaiju });
  const lastCorrect = item !== null && answered === item.answer;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink p-2 sm:p-4" data-testid="battle" data-stage={stage} data-room={room} data-source={source}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} className="panel mx-auto flex max-w-3xl flex-col gap-2 p-2 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark" data-testid="battle-title">
            ⚔ {title}
          </h2>
          <div className="flex items-center gap-2">
            {phases > 1 && stage === "fight" && (
              <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-bold" data-testid="battle-phase">
                {fmt(ui.battle.phase, { n: phaseOf(spec, state) + 1, total: phases })}
              </span>
            )}
            {stage === "fight" && (
              <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="battle-retreat" onClick={leave}>
                {ui.battle.retreat}
              </button>
            )}
          </div>
        </div>

        <div
          className="pixelated relative aspect-[16/7] max-h-[42dvh] min-h-36 w-full overflow-hidden rounded-md border-[3px] border-ink bg-slate bg-cover bg-bottom"
          style={{ backgroundImage: `url(${art.backdrop(room)})` }}
          data-testid="battle-arena"
        >
          <HpBar label={storyNames.robot} hp={state.robotHp} max={BATTLE.robotHp} align="left" />
          <HpBar label={kaiju} hp={state.kaijuHp} max={spec.hp} align="right" />
          <img
            key={`robot-${fx.id}`}
            src={art.robot}
            alt=""
            className={`pixelated absolute bottom-[3%] left-[8%] h-[72%] ${fx.robot ? `battle-robot-${fx.robot}` : "battle-idle"} ${state.shield ? "battle-shielded" : ""}`}
            style={{ filter: PAINT_FILTER[paint] }}
          />
          <img key={`bit-${fx.id}`} src={art.mentor} alt="" className={`pixelated absolute bottom-[52%] left-[2%] h-[26%] ${fx.assist ? "battle-bit-assist" : "battle-idle"}`} />
          <img key={`kaiju-${fx.id}`} src={art.kaiju(room)} alt="" className={`pixelated absolute bottom-[3%] right-[8%] h-[76%] ${fx.kaiju ? `battle-kaiju-${fx.kaiju}` : "battle-idle"} ${stage === "won" ? "battle-defeated" : ""}`} />
          {charging && (
            <span className="absolute right-[6%] top-[26%] rounded border-2 border-ink bg-wrong px-2 text-xs font-extrabold text-paper" data-testid="battle-charging">
              ⚡ {ui.battle.charging}
            </span>
          )}
          {state.shield && <span className="absolute left-[6%] top-[26%] rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold">🛡 {ui.battle.shieldOn}</span>}
        </div>

        {stage === "intro" && (
          <div className="flex flex-col gap-2" data-testid="battle-intro">
            <p className="text-sm font-bold text-slate">{storyNames.place[room - 1]}</p>
            <p className="font-semibold">{ui.battle.trait[spec.trait]}</p>
            <p className="text-sm text-slate">{ui.battle.assistNote}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
                {ui.battle.back}
              </button>
              <button type="button" className="btn" data-testid="battle-start" onClick={() => begin(startBattle(spec))}>
                {ui.battle.start}
              </button>
            </div>
          </div>
        )}

        {stage === "fight" && item && !hintOpen && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border-2 border-ink bg-paper px-2 text-xs font-bold" data-testid="battle-streak">
                {fmt(ui.battle.streak, { n: state.streak })}
              </span>
              <span className="flex-1" />
              {answered === undefined && (
                <>
                  {SUPPLIES.map((supply) =>
                    supplies[supply] > 0 ? (
                      <button key={supply} type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid={`battle-supply-${supply}`} disabled={applySupply(state, supply) === null} onClick={() => useItem(supply)}>
                        {fmt(ui.battle.useSupply, { name: ui.shop.items[`supply-${supply}`].name, n: supplies[supply] })}
                      </button>
                    ) : null,
                  )}
                  <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid="battle-hint" disabled={hints <= 0} onClick={() => (setHints(hints - 1), setHintOpen(true))}>
                    {fmt(ui.battle.hint, { n: hints })}
                  </button>
                  <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid="battle-tutor" onClick={() => setTutorOpen(true, source)}>
                    {ui.battle.askTutor}
                  </button>
                </>
              )}
            </div>
            <ChoiceCard key={state.turn - (answered === undefined ? 0 : 1)} item={item} onAnswer={answer} answered={answered} />
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2" aria-live="polite">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold" data-testid="battle-log">
                {answered !== undefined && <span className={lastCorrect ? "text-correct-dark" : "text-wrong"}>{lastCorrect ? `✓ ${ui.battle.correct}` : `✗ ${ui.battle.wrong}`}</span>}
                {events.map((event, i) => (
                  <span key={i}>{eventText(event, kaiju)}</span>
                ))}
              </div>
              {answered !== undefined && (
                <button ref={nextButton} type="button" className="btn" data-testid="battle-next" onClick={next}>
                  {ui.battle.next}
                </button>
              )}
            </div>
          </div>
        )}

        {stage === "fight" && hintOpen && (
          <div className="flex flex-col gap-2" data-testid="battle-hint-panel">
            <h3 className="flex items-center gap-2 font-extrabold text-teal-dark">
              <img src={art.mentor} alt="" className="pixelated h-9 w-9" />
              {ui.battle.hintTitle}
            </h3>
            {battleReference(source).map((station) => (
              <section key={station.title} className="flex flex-col gap-1">
                <h4 className="text-sm font-bold text-slate">{station.title}</h4>
                {station.pages.map((page, i) => (
                  <PageView key={i} page={page} style={style === "hands" ? "visual" : style} />
                ))}
              </section>
            ))}
            <button type="button" className="btn self-end" data-testid="battle-hint-close" onClick={() => setHintOpen(false)}>
              {ui.battle.hintClose}
            </button>
          </div>
        )}

        {stage === "won" && (
          <div className="flex flex-col gap-1 text-center" data-testid="battle-won">
            <p className="text-xl font-extrabold text-correct-dark">{fmt(ui.battle.won, { kaiju })}</p>
            <p className="font-semibold">{fmt(ui.battle.wonDetail, { correct: state.correct, asked: state.turn })}</p>
            {credits > 0 && (
              <p className="font-bold text-teal-dark" data-testid="battle-credits">
                {fmt(ui.battle.wonCredits, { n: credits })}
              </p>
            )}
            <p className="text-sm font-semibold text-slate">{room < ROOM_COUNT ? fmt(ui.battle.wonUnlock, { n: room + 1 }) : ui.battle.wonFinal}</p>
            <button type="button" className="btn mt-2 self-center" data-testid="battle-finish" onClick={closeOverlay}>
              {ui.battle.finish}
            </button>
          </div>
        )}

        {stage === "lost" && (
          <div className="flex flex-col gap-2 text-center" data-testid="battle-lost">
            <p className="text-xl font-extrabold text-wrong">{ui.battle.lost}</p>
            <p className="font-semibold">{fmt(ui.battle.lostDetail, { kaiju, n: state.kaijuHp })}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
                {ui.battle.finish}
              </button>
              <button type="button" className="btn" data-testid="battle-retry" onClick={() => begin(startBattle(spec, state.kaijuHp))}>
                {ui.battle.retry}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
