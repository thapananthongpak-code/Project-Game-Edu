import { useEffect, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import type { SfxName } from "../audio/sfx";
import { bossVariant } from "../audio/tracks";
import { battleReference } from "../content";
import { buildBattleItems, type ChoiceItem } from "../content/choices";
import { foeName, storyNames } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { type ActiveSupply, applySupply, type BattleEvent, battleSetup, type BattleState, formOf, isCharging, isEnraged, phaseCount, phaseOf, questionSource, resolveAnswer, retryCarry, startBattle } from "../state/battle";
import { BATTLE } from "../state/battle.config";
import { type BattleSpec, battleOf } from "../state/campaign";
import { armorParts, creditsOf, difficultyOf, type MusicCue, planOf, useGameStore } from "../state/gameStore";
import { modulesOf } from "../state/shop";
import { PAINT_FILTER, REWARDS, type Supply } from "../state/shop.config";
import { art, type FxArt } from "./art";
import { ChoiceCard } from "./ChoiceCard";
import { PageView } from "./ContentView";
import { useBit } from "./useBit";
import { useDialog } from "./useDialog";

type Stage = "intro" | "fight" | "won" | "lost";
type Side = "robot" | "kaiju";
/** เอฟเฟกต์หนึ่งชิ้นในฉาก: ภาพ ตำแหน่ง การเคลื่อนไหว และเวลาเริ่ม (มิลลิวินาทีหลังตอบ) */
interface Spark {
  art: FxArt;
  /** pop = ปรากฏที่ตัว side, shot = พุ่งไปหา side, assist = พี่บิตยิงไปหา side, rise = ลอยขึ้นจากตัว side */
  motion: "pop" | "shot" | "assist" | "rise";
  side: Side;
  at: number;
  big?: boolean;
}
/** ตัวเลขที่ลอยขึ้นจากตัวละคร: ความเสียหายหรือพลังที่ฟื้น */
interface Floater {
  text: string;
  side: Side;
  at: number;
  tone: "damage" | "heal";
}
/** ท่าของตัวละครและเอฟเฟกต์ของตานี้ id เปลี่ยนทุกครั้งเพื่อให้แอนิเมชันเล่นใหม่ */
interface Fx {
  id: number;
  robot: "attack" | "hurt" | "guard" | null;
  kaiju: "attack" | "hurt" | "heal" | "transform" | null;
  assist: boolean;
  sparks: Spark[];
  floaters: Floater[];
  shake: boolean;
  /** ภาพเนื้อเรื่องของร่างใหม่ที่ตัดเข้ามาตอนบอสกลายร่าง */
  cutIn: { art: string; name: string } | null;
}

const NO_FX: Fx = { id: 0, robot: null, kaiju: null, assist: false, sparks: [], floaters: [], shake: false, cutIn: null };
/** เวลาที่กระสุนพุ่งถึงเป้า (ตรงกับ battle-fx-shot ใน index.css) */
const SHOT_MS = 260;

/** เอฟเฟกต์ ตัวเลข และเสียงของเหตุการณ์ในตาหนึ่ง เรียงตามลำดับที่เกิด */
function stageEvents(events: BattleEvent[], spec: BattleSpec): Pick<Fx, "sparks" | "floaters" | "shake" | "cutIn"> & { sounds: [SfxName, number][] } {
  const sparks: Spark[] = [];
  const floaters: Floater[] = [];
  const sounds: [SfxName, number][] = [];
  let shake = false;
  let cutIn: Fx["cutIn"] = null;
  let at = 0;
  for (const event of events) {
    switch (event.type) {
      case "robot-hit":
        sparks.push({ art: "bolt", motion: "shot", side: "kaiju", at, big: event.boosted || event.counter }, { art: "impact", motion: "pop", side: "kaiju", at: at + SHOT_MS, big: event.boosted || event.counter });
        floaters.push({ text: `-${event.damage}`, side: "kaiju", at: at + SHOT_MS, tone: "damage" });
        sounds.push(["laser", at], ["boom", at + SHOT_MS]);
        at += SHOT_MS + 160;
        break;
      case "armor-break":
        sparks.push({ art: "bolt", motion: "shot", side: "kaiju", at }, { art: "shield", motion: "pop", side: "kaiju", at: at + SHOT_MS, big: true });
        sounds.push(["laser", at], ["crack", at + SHOT_MS]);
        at += SHOT_MS + 160;
        break;
      case "bit-assist":
        sparks.push({ art: "bolt", motion: "assist", side: "kaiju", at }, { art: "impact", motion: "pop", side: "kaiju", at: at + SHOT_MS });
        floaters.push({ text: `-${event.damage}`, side: "kaiju", at: at + SHOT_MS, tone: "damage" });
        sounds.push(["assist", at]);
        at += SHOT_MS + 160;
        break;
      case "bit-heal":
        sparks.push({ art: "spark", motion: "rise", side: "robot", at });
        floaters.push({ text: `+${event.amount}`, side: "robot", at, tone: "heal" });
        sounds.push(["heal", at]);
        break;
      case "kaiju-hit":
        if (event.blocked) {
          sparks.push({ art: event.heavy ? "fireball" : "slash", motion: event.heavy ? "shot" : "pop", side: "robot", at }, { art: "shield", motion: "pop", side: "robot", at: at + (event.heavy ? SHOT_MS : 60), big: true });
          sounds.push(["shield", at + (event.heavy ? SHOT_MS : 60)]);
        } else if (event.heavy) {
          sparks.push({ art: "fireball", motion: "shot", side: "robot", at, big: true }, { art: "impact", motion: "pop", side: "robot", at: at + SHOT_MS, big: true });
          floaters.push({ text: `-${event.damage}`, side: "robot", at: at + SHOT_MS, tone: "damage" });
          sounds.push(["fire", at], ["boom", at + SHOT_MS]);
          shake = true;
        } else {
          sparks.push({ art: "slash", motion: "pop", side: "robot", at: at + 120 });
          floaters.push({ text: `-${event.damage}`, side: "robot", at: at + 120, tone: "damage" });
          sounds.push(["slash", at + 120], ["hurt", at + 160]);
          shake = true;
        }
        at += SHOT_MS + 160;
        break;
      case "kaiju-regen":
        sparks.push({ art: "spark", motion: "rise", side: "kaiju", at });
        floaters.push({ text: `+${event.amount}`, side: "kaiju", at, tone: "heal" });
        break;
      case "phase":
      case "transform":
        if (event.heal > 0) {
          sparks.push({ art: "spark", motion: "rise", side: "robot", at });
          floaters.push({ text: `+${event.heal}`, side: "robot", at, tone: "heal" });
        }
        if (event.type === "transform") {
          const form = spec.forms[event.form];
          cutIn = { art: `st_${form.art}`, name: foeName(form.art) };
          sounds.push(["transform", at]);
          shake = true;
        }
        break;
      case "repair":
      case "reboot":
        sparks.push({ art: "spark", motion: "rise", side: "robot", at, big: event.type === "reboot" });
        floaters.push({ text: `+${event.amount}`, side: "robot", at, tone: "heal" });
        sounds.push(["heal", at]);
        break;
      case "shield":
        sparks.push({ art: "shield", motion: "pop", side: "robot", at, big: true });
        sounds.push(["shield", at]);
        break;
      case "boost":
        sparks.push({ art: "bolt", motion: "rise", side: "robot", at });
        sounds.push(["charge", at]);
        break;
    }
  }
  return { sparks, floaters, shake, cutIn, sounds };
}
/** ของที่ผู้เล่นกดใช้เองระหว่างสู้ (แกนสำรองทำงานเอง) */
const ACTIVE: readonly ActiveSupply[] = ["repair-kit", "shield", "overcharge"];

function HpBar({ label, hp, max, align }: { label: string; hp: number; max: number; align: "left" | "right" }) {
  return (
    <div className={`absolute top-[4%] w-[44%] ${align === "left" ? "left-[3%]" : "right-[3%] text-right"}`}>
      <div className="inline-block rounded border-2 border-ink bg-cream px-1.5 text-xs font-extrabold leading-5">{label}</div>
      <div className={`mt-0.5 flex gap-[2px] ${align === "right" ? "flex-row-reverse" : ""}`} role="img" aria-label={`${label} ${fmt(ui.battle.hp, { n: hp, total: max })}`} data-testid={`hp-${align}`} data-hp={hp} data-max={max}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-3 min-w-0 flex-1 rounded-sm border-2 border-ink ${i < hp ? (align === "left" ? "bg-teal" : "bg-wrong") : "bg-slate"}`} />
        ))}
      </div>
    </div>
  );
}

function eventText(event: BattleEvent, kaiju: string, spec: BattleSpec): string {
  switch (event.type) {
    case "robot-hit":
      return fmt(event.counter ? ui.battle.log.counter : event.boosted ? ui.battle.log.boostedHit : ui.battle.log.robotHit, { n: event.damage });
    case "armor-break":
      return ui.battle.log.armorBreak;
    case "bit-assist":
      return fmt(ui.battle.log.assist, { n: event.damage });
    case "bit-heal":
      return fmt(ui.battle.log.bitHeal, { n: event.amount });
    case "kaiju-hit":
      return event.blocked ? ui.battle.log.blocked : fmt(event.heavy ? ui.battle.log.heavyHit : ui.battle.log.kaijuHit, { kaiju, n: event.damage });
    case "kaiju-regen":
      return fmt(ui.battle.log.regen, { kaiju, n: event.amount });
    case "phase":
      return fmt(ui.battle.log.phase, { n: event.heal });
    case "transform":
      return fmt(ui.battle.log.transform, { kaiju: foeName(spec.forms[event.form].art), n: event.heal });
    case "repair":
      return fmt(ui.battle.log.repair, { n: event.amount });
    case "shield":
      return ui.battle.log.shield;
    case "boost":
      return ui.battle.log.boost;
    case "reboot":
      return fmt(ui.battle.log.reboot, { n: event.amount });
  }
}

/**
 * ด่านต่อสู้ไคจู (GDD ข้อ 12): ตอบโจทย์จากเนื้อหาของหัวข้อ ตอบถูกการ์เดียนโจมตี ตอบผิดไคจูโจมตี ไม่จับเวลา
 * บอสของระดับกลางและยากมีหลายร่าง ชนะร่างหนึ่งแล้วกลายร่างต่อ แพ้แล้วออกปฏิบัติการใหม่ได้ทันทีโดยไม่ต้องสู้ร่างที่ชนะแล้วซ้ำ
 * ด่านที่ชนะแล้วเปิดซ้ำได้เป็นการซ้อมรบเพื่อเก็บเครดิตวิจัย
 */
export function Battle() {
  const battleId = useGameStore((s) => s.battleId) as string;
  const supplies = useGameStore((s) => s.shop.supplies);
  const paint = useGameStore((s) => s.shop.paint);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const recordBattle = useGameStore((s) => s.recordBattle);
  const consumeSupply = useGameStore((s) => s.consumeSupply);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const setMusicCue = useGameStore((s) => s.setMusicCue);
  const bit = useBit();

  // ค่าของการออกปฏิบัติการคงที่ตลอดหน้าต่างนี้ (ชนะแล้วชิ้นส่วนอัปเกรดเพิ่ม แต่มีผลกับด่านถัดไป)
  const [boot] = useState(() => {
    const state = useGameStore.getState();
    const spec = battleOf(difficultyOf(state), battleId) as BattleSpec;
    const parts = armorParts(state);
    const record = state.battles[battleId];
    return {
      setup: battleSetup(difficultyOf(state), spec, state.shop.outfit, parts, modulesOf(state.shop)),
      modules: modulesOf(state.shop),
      parts: Math.min(BATTLE.armorMax, parts),
      outfit: state.shop.outfit,
      pools: planOf(state).pools,
      /** ด่านนี้ชนะแล้ว: รอบนี้เป็นการซ้อมรบ */
      training: record?.won ?? false,
      replaysLeft: Math.max(0, BATTLE.replayRewards - Math.max(0, (record?.wins ?? 0) - 1)),
    };
  });
  const { setup, training } = boot;
  const spec = setup.spec;

  const [stage, setStage] = useState<Stage>("intro");
  const [state, setState] = useState<BattleState>(() => startBattle(setup));
  const [item, setItem] = useState<ChoiceItem | null>(null);
  const [answered, setAnswered] = useState<number | undefined>(undefined);
  /** ตัวเลือกที่ชิปวิเคราะห์ตัดออกจากโจทย์ข้อนี้ */
  const [removed, setRemoved] = useState<number[]>([]);
  const [events, setEvents] = useState<BattleEvent[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [fx, setFx] = useState<Fx>(NO_FX);
  const [hints, setHints] = useState<number>(setup.hints);
  const [hintOpen, setHintOpen] = useState(false);
  /** เครดิตที่ได้จากการชนะครั้งนี้ (รวมตัวคูณของระดับความยาก) */
  const [credits, setCredits] = useState(0);
  /** โจทย์ที่ยังไม่ได้ใช้ของแต่ละหัวข้อ หมดแล้วสลับใหม่ */
  const queues = useRef(new Map<number, ChoiceItem[]>());

  const form = formOf(setup, state);
  const kaiju = foeName(form.art);
  const battleName = foeName(spec.forms[0].art);

  const draw = (from: BattleState): ChoiceItem => {
    const source = questionSource(setup, from);
    let queue = queues.current.get(source) ?? [];
    if (queue.length === 0) queue = buildBattleItems(source, boot.pools);
    const [next, ...rest] = queue;
    queues.current.set(source, rest);
    return next;
  };

  const ask = (from: BattleState) => {
    setItem(draw(from));
    setAnswered(undefined);
    setRemoved([]);
    setEvents([]);
    setNote(null);
    if (isCharging(setup, from)) playSfx("charge");
  };

  const begin = (carry?: { form: number; kaijuHp: number }) => {
    const from = startBattle(setup, { carry, reboot: useGameStore.getState().shop.supplies.reboot > 0 });
    setState(from);
    setFx(NO_FX);
    setHints(setup.hints);
    setStage("fight");
    ask(from);
  };

  const finishSortie = (final: BattleState) => {
    const won = final.status === "won";
    const before = creditsOf(useGameStore.getState());
    recordBattle(battleId, { won, asked: final.turn, correct: final.correct });
    setCredits(creditsOf(useGameStore.getState()) - before);
    playSfx(won ? "win" : "lose");
    setStage(won ? "won" : "lost");
  };

  const answer = (option: number) => {
    if (!item || answered !== undefined) return;
    const correct = option === item.answer;
    const result = resolveAnswer(setup, state, correct);
    setState(result.state);
    setEvents(result.events);
    setNote(null);
    setAnswered(option);
    const has = (type: BattleEvent["type"]) => result.events.some((e) => e.type === type);
    const blocked = result.events.some((e) => e.type === "kaiju-hit" && e.blocked);
    // แกนสำรองทำงานแล้ว: หักออกจากของที่ถือ
    if (has("reboot")) consumeSupply("reboot");
    const { sounds, ...effects } = stageEvents(result.events, spec);
    setFx({ id: fx.id + 1, robot: correct ? "attack" : blocked ? "guard" : "hurt", kaiju: has("transform") ? "transform" : correct ? "hurt" : has("kaiju-regen") ? "heal" : "attack", assist: has("bit-assist"), ...effects });
    for (const [name, at] of sounds) window.setTimeout(() => playSfx(name), at);
  };

  const next = () => {
    if (state.status !== "fighting") return finishSortie(state);
    ask(state);
  };

  const useItem = (supply: ActiveSupply) => {
    const result = applySupply(setup, state, supply);
    if (!result || supplies[supply] <= 0 || !consumeSupply(supply)) return;
    setState(result.state);
    setEvents(result.events);
    setNote(null);
    const { sounds, ...effects } = stageEvents(result.events, spec);
    setFx({ id: fx.id + 1, robot: "guard", kaiju: null, assist: false, ...effects });
    for (const [name, at] of sounds) window.setTimeout(() => playSfx(name), at);
  };

  // ชิปวิเคราะห์: ตัดตัวเลือกที่ผิดออก 1 ข้อ ต้องเหลือตัวเลือกที่ผิดอย่างน้อย 1 ข้อ
  const wrongLeft = item ? item.options.map((_, i) => i).filter((i) => i !== item.answer && !removed.includes(i)) : [];
  const analyze = () => {
    if (wrongLeft.length < 2 || !consumeSupply("analyzer")) return;
    setRemoved([...removed, wrongLeft[Math.floor(Math.random() * wrongLeft.length)]]);
    setEvents([]);
    setNote(ui.battle.log.analyzer);
    playSfx("page");
  };

  // ออกจากด่านกลางคัน (ถอยกลับ): นับเป็นการออกปฏิบัติการหนึ่งครั้งถ้าตอบไปแล้ว
  const leave = () => {
    if (stage === "fight" && state.turn > 0) recordBattle(battleId, { won: false, asked: state.turn, correct: state.correct });
    closeOverlay();
  };

  const dialog = useDialog<HTMLDivElement>(hintOpen ? () => setHintOpen(false) : stage === "intro" ? closeOverlay : undefined);
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (answered !== undefined) nextButton.current?.focus({ preventScroll: true });
  }, [answered]);

  // เพลงตามอารมณ์ของฉาก: ตึงเครียดก่อนออกรบ เร่งขึ้นเมื่อพลังเหลือน้อย บอสแต่ละร่างเร็วและสูงขึ้น ชนะแล้วเป็นเพลงมีชัย
  const danger = stage === "fight" && setup.robotMax > BATTLE.dangerHp && state.robotHp <= BATTLE.dangerHp;
  useEffect(() => {
    const cue: MusicCue = stage === "intro" ? { name: "tension" } : stage === "won" ? { name: "victory" } : stage === "lost" ? { name: "defeat" } : spec.boss ? { name: "boss", variant: bossVariant(state.form, danger) } : { name: danger ? "danger" : "battle" };
    setMusicCue(cue);
  }, [stage, state.form, danger, spec.boss, setMusicCue]);

  const waiting = stage === "fight" && answered === undefined;
  const charging = waiting && isCharging(setup, state);
  const enraged = stage === "fight" && isEnraged(setup, state);
  const phases = phaseCount(setup, state);
  const source = questionSource(setup, state);
  const title = fmt(training ? ui.battle.trainingTitle : ui.battle.title, { kaiju: battleName });
  const lastCorrect = item !== null && answered === item.answer;
  const perk = ui.shop.perks[boot.outfit];
  const supplyButton = (supply: Supply, disabled: boolean, run: () => void) =>
    supplies[supply] > 0 ? (
      <button key={supply} type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid={`battle-supply-${supply}`} disabled={disabled} onClick={run}>
        {fmt(ui.battle.useSupply, { name: ui.shop.items[`supply-${supply}`].name, n: supplies[supply] })}
      </button>
    ) : null;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink p-2 sm:p-4" data-testid="battle" data-stage={stage} data-battle={battleId} data-source={source} data-form={state.form} data-training={training}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} className="panel mx-auto flex max-w-3xl flex-col gap-2 p-2 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark" data-testid="battle-title">
            ⚔ {title}
          </h2>
          <div className="flex items-center gap-2">
            {spec.forms.length > 1 && stage !== "intro" && (
              <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-bold" data-testid="battle-form">
                {fmt(ui.battle.form, { n: state.form + 1, total: spec.forms.length })}
              </span>
            )}
            {phases > 1 && stage === "fight" && (
              <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-bold" data-testid="battle-phase">
                {fmt(ui.battle.phase, { n: phaseOf(setup, state) + 1, total: phases })}
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
          style={{ backgroundImage: `url(${art.backdrop(spec.backdrop)})` }}
          data-testid="battle-arena"
        >
          <div key={`stage-${fx.id}`} className={`absolute inset-0 ${fx.shake ? "battle-shake" : ""}`}>
          <HpBar label={storyNames.robot} hp={state.robotHp} max={setup.robotMax} align="left" />
          <HpBar label={kaiju} hp={state.kaijuHp} max={form.hp} align="right" />
          <img
            key={`robot-${fx.id}`}
            src={art.robot}
            alt=""
            className={`pixelated absolute bottom-[3%] left-[8%] h-[72%] ${fx.robot ? `battle-robot-${fx.robot}` : "battle-idle"} ${state.shield ? "battle-shielded" : ""}`}
            style={{ filter: PAINT_FILTER[paint] }}
          />
          <img key={`bit-${fx.id}`} src={bit} alt="" className={`pixelated absolute bottom-[52%] left-[2%] h-[26%] ${fx.assist ? "battle-bit-assist" : "battle-idle"}`} />
          <img
            key={`kaiju-${fx.id}-${state.form}`}
            src={art.foe(form.art)}
            alt=""
            data-testid="battle-foe"
            data-art={form.art}
            className={`pixelated absolute bottom-[3%] right-[8%] h-[76%] ${fx.kaiju ? `battle-kaiju-${fx.kaiju}` : "battle-idle"} ${stage === "won" ? "battle-defeated" : ""} ${enraged ? "battle-enraged" : ""}`}
          />
          <div className="absolute right-[4%] top-[26%] flex flex-col items-end gap-1">
            {charging && (
              <span className="rounded border-2 border-ink bg-wrong px-2 text-xs font-extrabold text-paper" data-testid="battle-charging">
                ⚡ {ui.battle.charging}
              </span>
            )}
            {enraged && (
              <span className="rounded border-2 border-ink bg-wrong px-2 text-xs font-extrabold text-paper" data-testid="battle-enraged">
                🔥 {ui.battle.enraged}
              </span>
            )}
            {stage === "fight" && state.armored && (
              <span className="rounded border-2 border-ink bg-mist px-2 text-xs font-extrabold" data-testid="battle-armored">
                ⛨ {ui.battle.armored}
              </span>
            )}
          </div>
          <div className="absolute left-[4%] top-[26%] flex flex-col items-start gap-1">
            {state.shield && <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold">🛡 {ui.battle.shieldOn}</span>}
            {state.boost && <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-extrabold">🔋 {ui.battle.boostOn}</span>}
            {stage === "fight" && state.reboot && <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold">💠 {ui.battle.rebootReady}</span>}
            {danger && (
              <span className="rounded border-2 border-ink bg-wrong px-2 text-xs font-extrabold text-paper" data-testid="battle-danger">
                ⚠ {ui.battle.danger}
              </span>
            )}
          </div>
          </div>
          {/* เอฟเฟกต์การโจมตี: ภาพและตัวเลขเล่นแอนิเมชันครั้งเดียวต่อตา ซ่อนอยู่เมื่อไม่เล่น (รวมถึงเมื่อระบบตั้งค่าลดการเคลื่อนไหว) ผลของตาอ่านได้จากบันทึกเหตุการณ์ */}
          <div key={`fx-${fx.id}`} className="pointer-events-none absolute inset-0" aria-hidden="true" data-testid="battle-fx" data-sparks={fx.sparks.map((spark) => `${spark.art}:${spark.side}`).join(",")}>
            {fx.sparks.map((spark, i) => (
              <img
                key={i}
                src={art.fx(spark.art)}
                alt=""
                className={`pixelated battle-fx battle-fx-${spark.motion} battle-fx-to-${spark.side} ${spark.big ? "battle-fx-big" : ""}`}
                style={{ animationDelay: `${spark.at}ms` }}
              />
            ))}
            {fx.floaters.map((floater, i) => (
              <span key={i} className={`battle-float battle-float-${floater.side} ${floater.tone === "heal" ? "battle-float-heal" : ""}`} style={{ animationDelay: `${floater.at}ms` }}>
                {floater.text}
              </span>
            ))}
            {fx.cutIn && (
              <div className="battle-cutin absolute inset-0 flex items-end justify-center bg-ink bg-cover bg-center" style={{ backgroundImage: `url(${art.story(fx.cutIn.art)})` }}>
                <span className="mb-[4%] rounded border-[3px] border-ink bg-wrong px-3 py-0.5 text-base font-extrabold text-paper">{fmt(ui.battle.transformed, { kaiju: fx.cutIn.name })}</span>
              </div>
            )}
          </div>
        </div>

        {stage === "intro" && (
          <div className="flex flex-col gap-2" data-testid="battle-intro">
            <p className="text-sm font-bold text-slate">{storyNames.place[spec.backdrop - 1]}</p>
            {spec.forms.length > 1 && <p className="font-extrabold text-wrong">{fmt(ui.battle.forms, { n: spec.forms.length })}</p>}
            <ul className="flex flex-col gap-1">
              {spec.forms.map((f, i) => (
                <li key={f.art} className="font-semibold" data-testid="battle-trait">
                  {spec.forms.length > 1 && <span className="mr-1 font-extrabold text-teal-dark">{fmt(ui.battle.form, { n: i + 1, total: spec.forms.length })}:</span>}
                  {ui.battle.trait[f.trait]}
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-0.5 text-sm text-slate">
              <li>{ui.battle.assistNote}</li>
              <li data-testid="battle-hints-note">{setup.hints > 0 ? fmt(ui.battle.hintsNote, { n: setup.hints }) : ui.battle.noHintsNote}</li>
              {boot.parts > 0 && <li data-testid="battle-armor-note">{fmt(ui.battle.armorParts, { n: boot.parts * BATTLE.armorPerWin })}</li>}
              {perk && <li data-testid="battle-perk">{fmt(ui.battle.perk, { outfit: ui.shop.items[`outfit-${boot.outfit}`].name, perk })}</li>}
              {boot.modules.length > 0 && <li data-testid="battle-modules">{fmt(ui.battle.modules, { list: boot.modules.map((module) => ui.shop.items[`module-${module}`].name).join(" ") })}</li>}
              {supplies.reboot > 0 && <li>💠 {ui.battle.rebootReady}</li>}
            </ul>
            {training && (
              <p className="rounded-md border-2 border-ink bg-hint px-3 py-1.5 text-sm font-bold" data-testid="battle-training">
                {boot.replaysLeft > 0 ? fmt(ui.battle.trainingNote, { n: REWARDS.replay, left: boot.replaysLeft }) : ui.battle.trainingNoReward}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
                {ui.battle.back}
              </button>
              <button type="button" className="btn" data-testid="battle-start" onClick={() => begin()}>
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
                  {ACTIVE.map((supply) => supplyButton(supply, applySupply(setup, state, supply) === null, () => useItem(supply)))}
                  {supplyButton("analyzer", wrongLeft.length < 2, analyze)}
                  {setup.hints > 0 && (
                    <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid="battle-hint" disabled={hints <= 0} onClick={() => (setHints(hints - 1), setHintOpen(true))}>
                      {fmt(ui.battle.hint, { n: hints })}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" data-testid="battle-tutor" onClick={() => setTutorOpen(true, source)}>
                    {ui.battle.askTutor}
                  </button>
                </>
              )}
            </div>
            <ChoiceCard key={state.turn - (answered === undefined ? 0 : 1)} item={item} onAnswer={answer} answered={answered} removed={removed} />
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2" aria-live="polite">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold" data-testid="battle-log">
                {answered !== undefined && <span className={lastCorrect ? "text-correct-dark" : "text-wrong"}>{lastCorrect ? `✓ ${ui.battle.correct}` : `✗ ${ui.battle.wrong}`}</span>}
                {note && <span>{note}</span>}
                {events.map((event, i) => (
                  <span key={i}>{eventText(event, kaiju, spec)}</span>
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
              <img src={bit} alt="" className="pixelated h-9 w-9" />
              {ui.battle.hintTitle}
            </h3>
            {battleReference(source).map((station) => (
              <section key={station.title} className="flex flex-col gap-1">
                <h4 className="text-sm font-bold text-slate">{station.title}</h4>
                {station.pages.map((page, i) => (
                  <PageView key={i} page={page} />
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
              <p className="font-bold text-teal-dark" data-testid="battle-credits" data-credits={credits}>
                {fmt(ui.battle.wonCredits, { n: credits })}
              </p>
            )}
            {!training && !spec.boss && boot.parts < BATTLE.armorMax && (
              <p className="font-bold text-teal-dark" data-testid="battle-part">
                ⛨ {ui.battle.wonPart}
              </p>
            )}
            {!training && (spec.unlocks !== undefined || spec.boss) && <p className="text-sm font-semibold text-slate">{spec.unlocks !== undefined ? fmt(ui.battle.wonUnlock, { n: spec.unlocks }) : ui.battle.wonFinal}</p>}
            <button type="button" className="btn mt-2 self-center" data-testid="battle-finish" onClick={closeOverlay}>
              {ui.battle.finish}
            </button>
          </div>
        )}

        {stage === "lost" && (
          <div className="flex flex-col gap-2 text-center" data-testid="battle-lost">
            <p className="text-xl font-extrabold text-wrong">{ui.battle.lost}</p>
            <p className="font-semibold">{setup.formResetsOnRetry ? fmt(ui.battle.lostReset, { kaiju }) : fmt(ui.battle.lostDetail, { kaiju, n: state.kaijuHp })}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={closeOverlay}>
                {ui.battle.finish}
              </button>
              <button type="button" className="btn" data-testid="battle-retry" onClick={() => begin(retryCarry(setup, state))}>
                {ui.battle.retry}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
