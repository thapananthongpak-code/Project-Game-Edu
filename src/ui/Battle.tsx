import { useEffect, useMemo, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import type { SfxName } from "../audio/sfx";
import { bossVariant } from "../audio/tracks";
import { battleReference } from "../content";
import { buildBattleItems, type ChoiceItem } from "../content/choices";
import { foeName, storyNames } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { type ActiveSupply, applySupply, type BattleEvent, battleSetup, type BattleState, formOf, isCharging, isEnraged, isFurious, phaseCount, phaseOf, questionSource, resolveAnswer, retryCarry, startBattle, strikeOf, threatOf } from "../state/battle";
import { BATTLE } from "../state/battle.config";
import { type BattleSpec, battleOf, type FoeArt } from "../state/campaign";
import { coreBoostOf, creditsOf, difficultyOf, type MusicCue, planOf, useGameStore } from "../state/gameStore";
import { armorHp, bagSizeOf, GEAR, matchupOf, type Weapon } from "../state/gear";
import { bagOf, gearOf, modulesOf, powerOf } from "../state/shop";
import { REWARDS, type Supply } from "../state/shop.config";
import { art, type FxArt } from "./art";
import { BagPicker, ItemIcon } from "./BagPicker";
import { GuardianModel } from "./GuardianModel";
import { FOE_SKILLS, foeSkill, GUARDIAN_MOVES, guardianMove, type MoveSpec, type Pose, SHOT_MS } from "./battleMoves";
import { ChoiceCard } from "./ChoiceCard";
import { PageView } from "./ContentView";
import { GearIcon } from "./Storage";
import { useBit } from "./useBit";
import { useDialog } from "./useDialog";

type Stage = "intro" | "fight" | "won" | "lost";
type Side = "robot" | "kaiju";
/** เอฟเฟกต์หนึ่งชิ้นในฉาก: ภาพ ตำแหน่ง การเคลื่อนไหว และเวลาเริ่ม (มิลลิวินาทีหลังตอบ) */
interface Spark {
  art: FxArt;
  /** pop = ปรากฏที่ตัว side, shot = พุ่งไปหา side, beam = ลำแสงยืดไปถึง side, drop = ตกใส่ side, assist = พี่บิตยิงไปหา side, rise = ลอยขึ้นจากตัว side */
  motion: "pop" | "shot" | "beam" | "drop" | "assist" | "rise";
  side: Side;
  at: number;
  big?: boolean;
  row?: -1 | 0 | 1;
  flip?: boolean;
  tint?: "purple";
}
/** ตัวเลขหรือคำที่ลอยขึ้นจากตัวละคร: ความเสียหาย พลังที่ฟื้น หรือผลพิเศษ (คริติคอล สตัน กันได้) */
interface Floater {
  text: string;
  side: Side;
  at: number;
  tone: "damage" | "heal" | "tag";
}
/** ชื่อท่าที่ขึ้นกลางฉากตอนตัวละครฝั่ง side ออกท่า */
interface Banner {
  text: string;
  side: Side;
  at: number;
}
/** ท่าของตัวละครหนึ่งตัวในตานี้ และเวลาที่เริ่ม */
interface Act<P> {
  pose: P;
  at: number;
}
/** ท่าของตัวละครและเอฟเฟกต์ของตานี้ id เปลี่ยนทุกครั้งเพื่อให้แอนิเมชันเล่นใหม่ */
interface Fx {
  id: number;
  robot: Act<Pose | "hurt" | "guard" | "dodge"> | null;
  kaiju: Act<Pose | "hurt" | "heal" | "transform" | "stunned"> | null;
  /** เวลาที่พี่บิตยิงเสริม (null = ไม่ยิง) */
  assistAt: number | null;
  sparks: Spark[];
  floaters: Floater[];
  banners: Banner[];
  /** เวลาที่ฉากสั่น (null = ไม่สั่น) */
  shakeAt: number | null;
  /** ภาพเนื้อเรื่องของร่างใหม่ที่ตัดเข้ามาตอนบอสกลายร่าง */
  cutIn: { art: string; name: string; at: number } | null;
}

const NO_FX: Fx = { id: 0, robot: null, kaiju: null, assistAt: null, sparks: [], floaters: [], banners: [], shakeAt: null, cutIn: null };

/** สิ่งที่ใช้แปลงเหตุการณ์เป็นภาพและข้อความ: ด่าน อาวุธของการ์เดียน และร่างของคู่ต่อสู้ตอนที่ตอบ */
interface Scene {
  spec: BattleSpec;
  weapon: Weapon;
  foe: FoeArt;
}

/** เอฟเฟกต์ ตัวเลข ชื่อท่า และเสียงของเหตุการณ์ในตาหนึ่ง เรียงตามลำดับที่เกิด (ท่าหนึ่งจบก่อนท่าถัดไปเริ่ม) */
function stageEvents(events: BattleEvent[], { spec, weapon, foe }: Scene): Omit<Fx, "id"> & { sounds: [SfxName, number][] } {
  const fx: Omit<Fx, "id"> = { robot: null, kaiju: null, assistAt: null, sparks: [], floaters: [], banners: [], shakeAt: null, cutIn: null };
  const sounds: [SfxName, number][] = [];
  let at = 0;
  /** เล่นท่าหนึ่งท่าใส่ target: blocked = การโจมตีถูกกันไว้ (เอฟเฟกต์ตอนโดนเป็นโล่ ไม่มีเสียงเจ็บ) */
  const perform = (move: MoveSpec, target: Side, blocked = false, dodged = false) => {
    for (const spark of move.sparks) {
      const shielded = blocked && spark.impact;
      // หลบได้: ไม่มีเอฟเฟกต์ตอนโดนเป้า
      if (shielded && dodged) continue;
      fx.sparks.push({ art: shielded ? "shield" : spark.art, motion: spark.motion, side: target, at: at + spark.at, big: spark.big || shielded, row: spark.row, flip: spark.flip, tint: spark.tint });
    }
    for (const [name, when] of move.sounds) if (!blocked || (name !== "hurt" && name !== "boom")) sounds.push([name, at + when]);
    if (blocked) sounds.push([dodged ? "page" : "shield", at + move.hitAt]);
    else if (move.shake) fx.shakeAt ??= at + move.hitAt;
  };
  for (const [index, event] of events.entries()) {
    switch (event.type) {
      case "robot-hit": {
        const id = guardianMove(weapon, event);
        const move = GUARDIAN_MOVES[id];
        fx.robot ??= { pose: move.pose, at };
        fx.kaiju ??= { pose: "hurt", at: at + move.hitAt };
        perform(move, "kaiju");
        fx.banners.push({ text: fmt(ui.battle.banner.robot, { move: ui.battle.moves[id] }), side: "robot", at });
        fx.floaters.push({ text: `-${event.damage}`, side: "kaiju", at: at + move.hitAt, tone: "damage" });
        if (event.crit) {
          fx.floaters.push({ text: ui.battle.banner.crit, side: "kaiju", at: at + move.hitAt, tone: "tag" });
          sounds.push(["crit", at + move.hitAt]);
        }
        at += move.end;
        break;
      }
      case "armor-break": {
        // ค้อนทุบทะลุเกราะ: เกราะแตกในจังหวะเดียวกับการโจมตีที่ตามมา ไม่มีท่าแยก
        if (events[index + 1]?.type === "robot-hit") {
          fx.sparks.push({ art: "shield", motion: "pop", side: "kaiju", at: at + 120, big: true });
          sounds.push(["crack", at + 160]);
          break;
        }
        // ท่าปกติของอาวุธ แต่โดนเกราะ: เกราะแตกแทนการเสียพลัง
        const id = guardianMove(weapon, { damage: BATTLE.hit, final: false });
        const move = GUARDIAN_MOVES[id];
        fx.robot ??= { pose: move.pose, at };
        perform(move, "kaiju", true);
        sounds.push(["crack", at + move.hitAt]);
        fx.banners.push({ text: fmt(ui.battle.banner.robot, { move: ui.battle.moves[id] }), side: "robot", at });
        at += move.end;
        break;
      }
      case "stun":
        fx.sparks.push({ art: "stun", motion: "pop", side: "kaiju", at, big: true, row: 1 });
        fx.floaters.push({ text: ui.battle.banner.stun, side: "kaiju", at, tone: "tag" });
        sounds.push(["stun", at]);
        at += 320;
        break;
      case "bit-assist":
        fx.assistAt ??= at;
        fx.sparks.push({ art: "bolt", motion: "assist", side: "kaiju", at }, { art: "impact", motion: "pop", side: "kaiju", at: at + SHOT_MS });
        fx.floaters.push({ text: `-${event.damage}`, side: "kaiju", at: at + SHOT_MS, tone: "damage" });
        sounds.push(["assist", at]);
        at += SHOT_MS + 160;
        break;
      case "bit-heal":
      case "chip-heal":
        fx.sparks.push({ art: "spark", motion: "rise", side: "robot", at });
        fx.floaters.push({ text: `+${event.amount}`, side: "robot", at, tone: "heal" });
        sounds.push(["heal", at]);
        break;
      case "reflect":
        // เกราะหนาม: แรงกระแทกสะท้อนกลับไปที่คู่ต่อสู้
        fx.sparks.push({ art: "impact", motion: "pop", side: "kaiju", at });
        fx.floaters.push({ text: `-${event.damage}`, side: "kaiju", at, tone: "damage" });
        sounds.push(["crack", at]);
        at += 260;
        break;
      case "kaiju-hit": {
        const id = foeSkill(foe, event.heavy);
        const skill = FOE_SKILLS[id];
        fx.kaiju ??= { pose: skill.pose, at };
        fx.robot ??= event.blocked ? { pose: event.by === "dodge" ? "dodge" : "guard", at: event.by === "dodge" ? at + skill.hitAt - 120 : at } : { pose: "hurt", at: at + skill.hitAt };
        perform(skill, "robot", event.blocked, event.by === "dodge");
        fx.banners.push({ text: fmt(ui.battle.banner.foe, { kaiju: foeName(foe), skill: ui.battle.skills[id] }), side: "kaiju", at });
        fx.floaters.push(event.blocked ? { text: event.by === "dodge" ? ui.battle.banner.dodge : ui.battle.banner.guard, side: "robot", at: at + skill.hitAt, tone: "tag" } : { text: `-${event.damage}`, side: "robot", at: at + skill.hitAt, tone: "damage" });
        at += skill.end;
        break;
      }
      case "kaiju-stunned":
        fx.kaiju ??= { pose: "stunned", at };
        fx.sparks.push({ art: "stun", motion: "pop", side: "kaiju", at, big: true, row: 1 });
        fx.floaters.push({ text: ui.battle.banner.stun, side: "kaiju", at, tone: "tag" });
        sounds.push(["stun", at]);
        at += 500;
        break;
      case "second-chance":
        fx.robot ??= { pose: "guard", at };
        fx.sparks.push({ art: "spark", motion: "rise", side: "robot", at });
        fx.floaters.push({ text: ui.battle.banner.retry, side: "robot", at, tone: "tag" });
        sounds.push(["retry", at]);
        break;
      case "kaiju-regen":
        fx.kaiju ??= { pose: "heal", at };
        fx.sparks.push({ art: "spark", motion: "rise", side: "kaiju", at });
        fx.floaters.push({ text: `+${event.amount}`, side: "kaiju", at, tone: "heal" });
        break;
      case "kaiju-rearm":
        fx.sparks.push({ art: "shield", motion: "pop", side: "kaiju", at, big: true });
        sounds.push(["shield", at]);
        break;
      case "phase":
      case "transform":
        if (event.heal > 0) {
          fx.sparks.push({ art: "spark", motion: "rise", side: "robot", at });
          fx.floaters.push({ text: `+${event.heal}`, side: "robot", at, tone: "heal" });
        }
        if (event.type === "transform") {
          const form = spec.forms[event.form];
          fx.cutIn = { art: `st_${form.art}`, name: foeName(form.art), at };
          fx.kaiju = { pose: "transform", at };
          sounds.push(["transform", at]);
          fx.shakeAt ??= at;
        }
        break;
      case "repair":
      case "reboot":
        fx.robot ??= { pose: "guard", at };
        fx.sparks.push({ art: "spark", motion: "rise", side: "robot", at, big: event.type === "reboot" });
        fx.floaters.push({ text: `+${event.amount}`, side: "robot", at, tone: "heal" });
        sounds.push(["heal", at]);
        break;
      case "shield":
        fx.robot ??= { pose: "guard", at };
        fx.sparks.push({ art: "shield", motion: "pop", side: "robot", at, big: true });
        sounds.push(["shield", at]);
        break;
      case "boost":
        fx.robot ??= { pose: "guard", at };
        fx.sparks.push({ art: "bolt", motion: "rise", side: "robot", at });
        sounds.push(["charge", at]);
        break;
    }
  }
  return { ...fx, sounds };
}

/** ของที่ผู้เล่นกดใช้เองระหว่างสู้ (แกนสำรองทำงานเอง) */
const ACTIVE: readonly ActiveSupply[] = ["repair-kit", "shield", "overcharge"];

/**
 * แถบพลังทีละช่อง armor = จำนวนช่องท้ายแถบที่มาจากเกราะ (เกราะหนัก เกราะไททัน) เป็นสีเหล็กและหมดก่อนพลังของตัวหุ่น
 * shielded = คู่ต่อสู้หุ้มเกราะอยู่ ช่องที่เหลือทั้งหมดเป็นสีเหล็ก (ตอบถูกข้อแรกทำให้เกราะแตก ไม่ลดพลัง)
 */
function HpBar({ label, hp, max, align, armor = 0, shielded = false, children }: { label: string; hp: number; max: number; align: "left" | "right"; armor?: number; shielded?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`absolute top-[4%] w-[44%] ${align === "left" ? "left-[3%]" : "right-[3%] text-right"}`}>
      <div className="inline-flex items-center gap-1 align-bottom">
        <span className="rounded border-2 border-ink bg-cream px-1.5 text-xs font-extrabold leading-5">
          {label}
          {(armor > 0 || shielded) && <span aria-hidden="true"> 🛡</span>}
        </span>
        {children}
      </div>
      <div className={`mt-0.5 flex gap-[2px] ${align === "right" ? "flex-row-reverse" : ""}`} role="img" aria-label={`${label} ${fmt(ui.battle.hp, { n: hp, total: max })}${armor > 0 ? ` ${fmt(ui.battle.hpArmor, { n: Math.max(0, hp - (max - armor)) })}` : ""}${shielded ? ` ${ui.battle.armored}` : ""}`} data-testid={`hp-${align}`} data-hp={hp} data-max={max} data-armor={armor} data-shielded={shielded}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} data-segment={i >= hp ? "empty" : shielded || i >= max - armor ? "armor" : "hp"} className={`h-3 min-w-0 flex-1 rounded-sm border-2 border-ink ${i >= hp ? "bg-slate" : shielded || i >= max - armor ? "bg-[#8fb8de] shadow-[inset_0_2px_0_0_#e0f0ff]" : align === "left" ? "bg-teal" : "bg-wrong"}`} />
        ))}
      </div>
    </div>
  );
}

/** บอกว่าทำไมแถบพลังลดน้อยกว่าตัวเลข: คู่ต่อสู้เหลือพลังน้อยกว่าแรงโจมตี ส่วนที่เกินไม่ทบไปร่างถัดไป */
const wastedNote = (kaiju: string, damage: number, wasted: number): string =>
  damage - wasted > 0 ? fmt(ui.battle.log.wasted, { kaiju, left: damage - wasted }) : fmt(ui.battle.log.wastedNone, { kaiju });

function eventText(event: BattleEvent, kaiju: string, { spec, weapon, foe }: Scene): string {
  switch (event.type) {
    case "robot-hit": {
      const hit = fmt(ui.battle.log.robotHit, { move: ui.battle.moves[guardianMove(weapon, event)], n: event.damage });
      const extra = [event.crit && ui.battle.log.crit, event.advantage && ui.battle.log.advantage, event.quake && ui.battle.log.quake, event.counter && ui.battle.log.counter, (event.boosted || event.opening) && ui.battle.log.boostedHit].filter(Boolean);
      const line = extra.length > 0 ? `${hit} (${extra.join(" ")})` : hit;
      return event.wasted ? `${line} · ${wastedNote(kaiju, event.damage, event.wasted)}` : line;
    }
    case "armor-break":
      return event.pierced ? ui.battle.log.armorPierced : ui.battle.log.armorBreak;
    case "stun":
      return fmt(ui.battle.log.stun, { kaiju });
    case "bit-assist": {
      const line = fmt(ui.battle.log.assist, { n: event.damage });
      return event.wasted ? `${line} · ${wastedNote(kaiju, event.damage, event.wasted)}` : line;
    }
    case "bit-heal":
      return fmt(ui.battle.log.bitHeal, { n: event.amount });
    case "chip-heal":
      return fmt(ui.battle.log.chipHeal, { n: event.amount });
    case "reflect":
      return fmt(ui.battle.log.reflect, { kaiju, n: event.damage });
    case "kaiju-hit": {
      const skill = ui.battle.skills[foeSkill(foe, event.heavy)];
      if (event.blocked) return fmt(event.by === "guard" ? ui.battle.log.guardBlocked : event.by === "dodge" ? ui.battle.log.dodged : ui.battle.log.blocked, { skill });
      return fmt(event.heavy ? ui.battle.log.heavyHit : ui.battle.log.kaijuHit, { kaiju, skill, n: event.damage });
    }
    case "kaiju-stunned":
      return fmt(ui.battle.log.kaijuStunned, { kaiju });
    case "second-chance":
      return ui.battle.log.secondChance;
    case "kaiju-regen":
      return fmt(ui.battle.log.regen, { kaiju, n: event.amount });
    case "kaiju-rearm":
      return fmt(ui.battle.log.rearm, { kaiju });
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

const Tag = ({ children }: { children: string }) => <span className="rounded border-2 border-ink bg-hint px-1 font-bold">{children}</span>;

/**
 * ด่านต่อสู้ไคจูแบบผลัดกันเดิน (GDD ข้อ 12): แต่ละตาผู้เล่นตอบโจทย์จากเนื้อหาของหัวข้อ ตอบถูกการ์เดียนออกท่าตามอาวุธ ตอบผิดไคจูใช้สกิลของมัน ไม่จับเวลา
 * แผงคำสั่งบอกล่วงหน้าว่าตานี้จะเกิดอะไรถ้าตอบถูกหรือผิด ของใช้มีเฉพาะที่จัดลงกระเป๋า (BAG_SIZE ชิ้นต่อการออกปฏิบัติการ)
 * บอสของระดับกลางและยากมีหลายร่าง ชนะร่างหนึ่งแล้วกลายร่างต่อ แพ้แล้วออกปฏิบัติการใหม่ได้ทันทีโดยไม่ต้องสู้ร่างที่ชนะแล้วซ้ำ
 * ด่านที่ชนะแล้วเปิดซ้ำได้เป็นการซ้อมรบเพื่อเก็บเครดิตวิจัย
 */
export function Battle() {
  const battleId = useGameStore((s) => s.battleId) as string;
  const shop = useGameStore((s) => s.shop);
  const paint = shop.paint;
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const recordBattle = useGameStore((s) => s.recordBattle);
  const consumeSupply = useGameStore((s) => s.consumeSupply);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const setMusicCue = useGameStore((s) => s.setMusicCue);
  const bit = useBit();

  // ค่าของด่านที่คงที่ตลอดหน้าต่างนี้
  const [fixed] = useState(() => {
    const state = useGameStore.getState();
    const difficulty = difficultyOf(state);
    const record = state.battles[battleId];
    const spec = battleOf(difficulty, battleId) as BattleSpec;
    return {
      difficulty,
      spec,
      /** แกน AI ที่ชาร์จแล้วในแมพนี้เพิ่มพลังสูงสุด (แมพ 2) */
      coreBonus: coreBoostOf(state, spec),
      coreBoost: planOf(state).coreBoost,
      pools: planOf(state).pools,
      /** ด่านนี้ชนะแล้ว: รอบนี้เป็นการซ้อมรบ */
      training: record?.won ?? false,
      replaysLeft: Math.max(0, BATTLE.replayRewards - Math.max(0, (record?.wins ?? 0) - 1)),
    };
  });
  const { spec, training } = fixed;
  const [stage, setStage] = useState<Stage>("intro");
  // อุปกรณ์และเครื่องแบบ: เปลี่ยนได้จนกว่าจะกดออกปฏิบัติการ (พี่บิตแนะนำอาวุธที่ได้เปรียบในหน้าเตรียม) จากนั้นคงที่ตลอดด่าน
  const [locked, setLocked] = useState<{ setup: ReturnType<typeof battleSetup>; modules: ReturnType<typeof modulesOf>; outfit: typeof shop.outfit } | null>(null);
  const live = useMemo(
    () => ({ setup: battleSetup(fixed.difficulty, spec, shop.outfit, modulesOf(shop), gearOf(shop), fixed.coreBonus), modules: modulesOf(shop), outfit: shop.outfit }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ขึ้นกับอุปกรณ์ เครื่องแบบ และโมดูลเท่านั้น
    [fixed.difficulty, spec, shop.outfit, shop.weapon, shop.armor, shop.chip, shop.owned],
  );
  const boot = { ...fixed, ...(locked ?? live) };
  const { setup } = boot;
  const gear = setup.gear;

  const [fought, setState] = useState<BattleState>(() => startBattle(live.setup));
  // หน้าเตรียมออกปฏิบัติการแสดงสถานะเริ่มต้นของอุปกรณ์ที่ใส่อยู่ตอนนี้
  const state = locked ? fought : startBattle(setup);
  /** ของใช้ที่ยังเหลือในกระเป๋าของการออกปฏิบัติการครั้งนี้ */
  const [bag, setBag] = useState<Supply[]>([]);
  const [item, setItem] = useState<ChoiceItem | null>(null);
  const [answered, setAnswered] = useState<number | undefined>(undefined);
  /** ตัวเลือกที่ชิปวิเคราะห์หรือชิปคิดทบทวนตัดออกจากโจทย์ข้อนี้ */
  const [removed, setRemoved] = useState<number[]>([]);
  /** ใช้ของไปแล้วในตานี้ (ใช้ของได้ตาละ 1 ชิ้น) */
  const [itemUsed, setItemUsed] = useState(false);
  const [events, setEvents] = useState<BattleEvent[]>([]);
  /** ร่างของคู่ต่อสู้ตอนที่เหตุการณ์ชุดล่าสุดเกิด (ชื่อสกิลในบันทึกต้องเป็นของร่างนั้น แม้กลายร่างไปแล้ว) */
  const [actor, setActor] = useState<FoeArt>(spec.forms[0].art);
  const [note, setNote] = useState<string | null>(null);
  const [fx, setFx] = useState<Fx>(NO_FX);
  const [hints, setHints] = useState<number>(setup.hints);
  const [hintOpen, setHintOpen] = useState(false);
  /** นับครั้งที่ชิปคิดทบทวนทำงาน ใช้ย้ายโฟกัสกลับไปที่ตัวเลือก */
  const [retried, setRetried] = useState(0);
  /** เครดิตที่ได้จากการชนะครั้งนี้ (รวมตัวคูณของระดับความยาก) */
  const [credits, setCredits] = useState(0);
  /** โจทย์ที่ยังไม่ได้ใช้ของแต่ละหัวข้อ หมดแล้วสลับใหม่ */
  const queues = useRef(new Map<number, ChoiceItem[]>());

  const form = formOf(setup, state);
  const kaiju = foeName(form.art);
  const battleName = foeName(spec.forms[0].art);
  const scene: Scene = { spec, weapon: gear.weapon, foe: form.art };

  const draw = (from: BattleState): ChoiceItem => {
    const source = questionSource(setup, from);
    let queue = queues.current.get(source) ?? [];
    if (queue.length === 0) queue = buildBattleItems(source, boot.pools);
    const [next, ...rest] = queue;
    queues.current.set(source, rest);
    return next;
  };

  const play = (staged: ReturnType<typeof stageEvents>) => {
    const { sounds, ...effects } = staged;
    setFx({ id: fx.id + 1, ...effects });
    for (const [name, at] of sounds) window.setTimeout(() => playSfx(name), at);
  };

  const ask = (from: BattleState) => {
    setItem(draw(from));
    setAnswered(undefined);
    setRemoved([]);
    setItemUsed(false);
    setEvents([]);
    setNote(null);
    if (isCharging(setup, from)) playSfx("charge");
  };

  const begin = (carry?: { form: number; kaijuHp: number }) => {
    // กระเป๋าของรอบนี้: ของที่เลือกไว้และยังมีในกล่อง แกนสำรองในกระเป๋าทำงานเอง
    const packed = bagOf(useGameStore.getState().shop);
    if (!locked) setLocked(live);
    const from = startBattle(setup, { carry, reboot: packed.includes("reboot") });
    setBag(packed);
    setState(from);
    setFx(NO_FX);
    setHints(setup.hints);
    setStage("fight");
    ask(from);
  };

  /** หยิบของหนึ่งชิ้นออกจากกระเป๋าและตัดจากกล่อง */
  const spend = (supply: Supply): boolean => {
    const at = bag.indexOf(supply);
    if (at < 0 || !consumeSupply(supply)) return false;
    setBag(bag.filter((_, i) => i !== at));
    return true;
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
    setActor(form.art);
    setNote(null);
    play(stageEvents(result.events, scene));
    if (result.events.some((e) => e.type === "second-chance")) {
      // ชิปคิดทบทวน: ตานี้ยังไม่จบ ตัดข้อที่เลือกออกแล้วให้ตอบข้อเดิมอีกครั้ง
      setRemoved([...removed, option]);
      setRetried(retried + 1);
      return;
    }
    setAnswered(option);
    // แกนสำรองทำงานแล้ว: หักออกจากกระเป๋า
    if (result.events.some((e) => e.type === "reboot")) spend("reboot");
  };

  const next = () => {
    if (state.status !== "fighting") return finishSortie(state);
    ask(state);
  };

  const useItem = (supply: ActiveSupply) => {
    const result = applySupply(setup, state, supply);
    if (itemUsed || !result || !spend(supply)) return;
    setItemUsed(true);
    setState(result.state);
    setEvents(result.events);
    setActor(form.art);
    setNote(null);
    play(stageEvents(result.events, scene));
  };

  // ชิปวิเคราะห์: ตัดตัวเลือกที่ผิดออก 1 ข้อ ต้องเหลือตัวเลือกที่ผิดอย่างน้อย 1 ข้อ
  const wrongLeft = item ? item.options.map((_, i) => i).filter((i) => i !== item.answer && !removed.includes(i)) : [];
  const analyze = () => {
    if (itemUsed || wrongLeft.length < 2 || !spend("analyzer")) return;
    setItemUsed(true);
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
  // ได้ตอบใหม่: ปุ่มที่เพิ่งกดถูกตัดออก จึงย้ายโฟกัสไปที่ตัวเลือกแรกที่ยังกดได้
  useEffect(() => {
    if (retried > 0) dialog.current?.querySelector<HTMLButtonElement>('[data-testid="choice-option"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [retried, dialog]);

  // เพลงตามอารมณ์ของฉาก: ตึงเครียดก่อนออกรบ เร่งขึ้นเมื่อพลังเหลือน้อย บอสแต่ละร่างเร็วและสูงขึ้น ชนะแล้วเป็นเพลงมีชัย
  const danger = stage === "fight" && setup.robotMax > BATTLE.dangerHp && state.robotHp <= BATTLE.dangerHp;
  useEffect(() => {
    const cue: MusicCue = stage === "intro" ? { name: "tension" } : stage === "won" ? { name: "victory" } : stage === "lost" ? { name: "defeat" } : spec.boss ? { name: "boss", variant: bossVariant(state.form, danger) } : { name: danger ? "danger" : "battle" };
    setMusicCue(cue);
  }, [stage, state.form, danger, spec.boss, setMusicCue]);

  const fighting = stage === "fight";
  const waiting = fighting && answered === undefined;
  const charging = waiting && isCharging(setup, state);
  const enraged = fighting && isEnraged(setup, state);
  const furious = fighting && isFurious(setup, state);
  const phases = phaseCount(setup, state);
  const source = questionSource(setup, state);
  const title = fmt(training ? ui.battle.trainingTitle : ui.battle.title, { kaiju: battleName });
  const lastCorrect = item !== null && answered === item.answer;
  const perk = ui.shop.perks[boot.outfit];
  const power = powerOf(boot.difficulty, shop, spec, fixed.coreBonus);
  const matchup = matchupOf(gear.weapon, form.weak);
  const gearNames = { weapon: ui.shop.items[`weapon-${gear.weapon}`].name, armor: ui.shop.items[`armor-${gear.armor}`].name, chip: ui.shop.items[`chip-${gear.chip}`].name };
  // แผงคำสั่ง: สิ่งที่จะเกิดในตานี้
  const strike = strikeOf(setup, state);
  const threat = threatOf(setup, state);
  const lastForm = state.form === spec.forms.length - 1;
  const moveId = guardianMove(gear.weapon, strike.armorBreak ? { damage: BATTLE.hit, final: false } : { ...strike, final: lastForm && state.kaijuHp - strike.damage <= 0 });
  const skillId = foeSkill(form.art, threat.heavy);
  const supplyButton = (supply: Supply, disabled: boolean, run: () => void) => {
    const count = bag.filter((s) => s === supply).length;
    return count > 0 ? (
      <button key={supply} type="button" className="btn btn-ghost flex !min-h-9 items-center gap-1 !px-2 text-xs" data-testid={`battle-supply-${supply}`} disabled={disabled || itemUsed} onClick={run}>
        <ItemIcon value={supply} className="h-5 w-5" />
        {fmt(ui.battle.useSupply, { name: ui.shop.items[`supply-${supply}`].name, n: count })}
      </button>
    ) : null;
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink p-2 sm:p-4" data-testid="battle" data-stage={stage} data-battle={battleId} data-source={source} data-form={state.form} data-training={training} data-turn={state.turn}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} className="panel mx-auto flex max-w-3xl flex-col gap-2 p-2 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark" data-testid="battle-title">
            ⚔ {title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {fighting && (
              <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold" data-testid="battle-turn">
                {fmt(ui.battle.turn, { n: state.turn + (waiting ? 1 : 0) })}
              </span>
            )}
            {spec.forms.length > 1 && stage !== "intro" && (
              <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-bold" data-testid="battle-form">
                {fmt(ui.battle.form, { n: state.form + 1, total: spec.forms.length })}
              </span>
            )}
            {phases > 1 && fighting && (
              <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-bold" data-testid="battle-phase">
                {fmt(ui.battle.phase, { n: phaseOf(setup, state) + 1, total: phases })}
              </span>
            )}
            {fighting && (
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
          <div key={`stage-${fx.id}`} className={`absolute inset-0 ${fx.shakeAt !== null ? "battle-shake" : ""}`} style={fx.shakeAt !== null ? { animationDelay: `${fx.shakeAt}ms` } : undefined}>
            <HpBar label={storyNames.robot} hp={state.robotHp} max={setup.robotMax} armor={armorHp(gear.armor)} align="left">
              {/* อุปกรณ์ที่ใส่อยู่: อาวุธ เกราะ ชิป */}
              <span className="flex gap-0.5 rounded border-2 border-ink bg-cream px-0.5" role="img" aria-label={fmt(ui.battle.gear, gearNames)} data-testid="battle-gear">
                <GearIcon value={gear.weapon} className="h-5 w-5" />
                <GearIcon value={gear.armor} className="h-5 w-5" />
                <GearIcon value={gear.chip} className="h-5 w-5" />
              </span>
            </HpBar>
            <HpBar label={kaiju} hp={state.kaijuHp} max={form.hp} shielded={state.armored} align="right" />
            {/* การ์เดียนที่ใส่เกราะและถืออาวุธจริง (ภาพเดียวกับหุ่นบนแท่นในโรงเก็บหุ่น) */}
            <div
              key={`robot-${fx.id}`}
              className={`absolute bottom-[3%] left-[8%] aspect-square h-[72%] ${fx.robot ? `battle-robot-${fx.robot.pose}` : "battle-idle"} ${state.shield ? "battle-shielded" : ""}`}
              style={fx.robot ? { animationDelay: `${fx.robot.at}ms` } : undefined}
              data-testid="battle-robot"
              data-weapon={gear.weapon}
              data-armor={gear.armor}
              data-pose={fx.robot?.pose ?? "idle"}
            >
              <GuardianModel gear={gear} paint={paint} className="absolute inset-0 h-full w-full" />
            </div>
            <img key={`bit-${fx.id}`} src={bit} alt="" className={`pixelated absolute bottom-[52%] left-[2%] h-[26%] ${fx.assistAt !== null ? "battle-bit-assist" : "battle-idle"}`} style={fx.assistAt !== null ? { animationDelay: `${fx.assistAt}ms` } : undefined} />
            <img
              key={`kaiju-${fx.id}-${state.form}`}
              src={art.foe(form.art)}
              alt=""
              data-testid="battle-foe"
              data-art={form.art}
              data-pose={fx.kaiju?.pose ?? "idle"}
              className={`pixelated absolute bottom-[3%] right-[8%] h-[76%] ${fx.kaiju ? `battle-kaiju-${fx.kaiju.pose}` : "battle-idle"} ${stage === "won" ? "battle-defeated" : ""} ${enraged || furious ? "battle-enraged" : ""}`}
              style={fx.kaiju ? { animationDelay: `${fx.kaiju.at}ms` } : undefined}
            />
            <div className="absolute right-[4%] top-[26%] flex flex-col items-end gap-1">
              <span className={`rounded border-2 border-ink px-2 text-xs font-extrabold ${matchup === "strong" ? "bg-hint" : matchup === "weak" ? "bg-[#f8e1e5]" : "bg-cream"}`} data-testid="battle-weak" data-weak={form.weak} data-matchup={matchup} data-advantage={matchup === "strong"} title={ui.matchup.effects[matchup]}>
                {matchup === "strong" ? "▲ " : matchup === "weak" ? "▼ " : ""}
                {fmt(ui.battle.matchupBadge, { matchup: ui.matchup.names[matchup] })} · {fmt(ui.battle.weak, { class: ui.storage.weaponClasses[form.weak] })}
              </span>
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
              {furious && (
                <span className="rounded border-2 border-ink bg-wrong px-2 text-xs font-extrabold text-paper" data-testid="battle-furious">
                  🔥 {ui.battle.furious}
                </span>
              )}
              {fighting && state.armored && (
                <span className="rounded border-2 border-ink bg-mist px-2 text-xs font-extrabold" data-testid="battle-armored">
                  ⛨ {ui.battle.armored}
                </span>
              )}
              {fighting && state.stunned && (
                <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-extrabold" data-testid="battle-stunned">
                  💫 {ui.battle.stunned}
                </span>
              )}
            </div>
            <div className="absolute left-[4%] top-[26%] flex flex-col items-start gap-1">
              {state.shield && <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold">🛡 {ui.battle.shieldOn}</span>}
              {fighting && state.guard > 0 && (
                <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold" data-testid="battle-guard">
                  🔰 {ui.battle.guardOn}
                </span>
              )}
              {(state.boost || (fighting && state.opening)) && <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-extrabold">🔋 {state.boost ? ui.battle.boostOn : ui.battle.openingOn}</span>}
              {fighting && state.dodge > 0 && (
                <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold" data-testid="battle-dodge">
                  💨 {fmt(ui.battle.dodgeOn, { n: state.dodge })}
                </span>
              )}
              {fighting && state.retries > 0 && (
                <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold" data-testid="battle-retries">
                  ↺ {fmt(ui.battle.retryOn, { n: state.retries })}
                </span>
              )}
              {fighting && state.reboot && <span className="rounded border-2 border-ink bg-teal-light px-2 text-xs font-extrabold">💠 {ui.battle.rebootReady}</span>}
              {danger && (
                <span className="rounded border-2 border-ink bg-wrong px-2 text-xs font-extrabold text-paper" data-testid="battle-danger">
                  ⚠ {ui.battle.danger}
                </span>
              )}
            </div>
          </div>
          {/* เอฟเฟกต์ของท่าโจมตี: ภาพ ตัวเลข และชื่อท่าเล่นแอนิเมชันครั้งเดียวต่อตา ซ่อนอยู่เมื่อไม่เล่น (รวมถึงเมื่อระบบตั้งค่าลดการเคลื่อนไหว) ผลของตาอ่านได้จากบันทึกเหตุการณ์ */}
          <div
            key={`fx-${fx.id}`}
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            data-testid="battle-fx"
            data-sparks={fx.sparks.map((spark) => `${spark.art}:${spark.side}`).join(",")}
            data-banners={fx.banners.map((banner) => banner.text).join("|")}
          >
            {fx.sparks.map((spark, i) => (
              <span
                key={i}
                className={`battle-fx battle-fx-${spark.motion} battle-fx-to-${spark.side} ${spark.big ? "battle-fx-big" : ""} ${spark.tint ? `battle-fx-tint-${spark.tint}` : ""}`}
                style={{ animationDelay: `${spark.at}ms`, "--fx-row": spark.row ?? 0 } as React.CSSProperties}
              >
                <img src={art.fx(spark.art)} alt="" className={`pixelated h-full w-full ${spark.flip ? "battle-fx-flip" : ""}`} />
              </span>
            ))}
            {fx.floaters.map((floater, i) => (
              <span key={i} className={`battle-float battle-float-${floater.side} battle-float-${floater.tone}`} style={{ animationDelay: `${floater.at}ms` }}>
                {floater.text}
              </span>
            ))}
            {fx.banners.map((banner, i) => (
              <span key={i} className={`battle-banner battle-banner-${banner.side}`} style={{ animationDelay: `${banner.at}ms` }}>
                {banner.text}
              </span>
            ))}
            {fx.cutIn && (
              <div className="battle-cutin absolute inset-0 flex items-end justify-center bg-ink bg-cover bg-center" style={{ backgroundImage: `url(${art.story(fx.cutIn.art)})`, animationDelay: `${fx.cutIn.at}ms` }}>
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
            <div className="rounded-md border-2 border-ink bg-paper px-2 py-1.5" data-testid="battle-power" data-power={power} data-recommended={spec.power} data-ok={power >= spec.power}>
              <p className="font-extrabold">
                ⚡ {fmt(ui.battle.power, { n: power })} · {fmt(ui.battle.powerRec, { n: spec.power })}
              </p>
              <p className={`text-sm font-bold ${power >= spec.power ? "text-correct-dark" : "text-wrong"}`}>{power >= spec.power ? ui.battle.powerOk : ui.battle.powerLow}</p>
              <p className="flex flex-wrap items-center gap-1 text-sm" data-testid="battle-gear-note">
                <GearIcon value={gear.weapon} className="h-6 w-6" />
                <GearIcon value={gear.armor} className="h-6 w-6" />
                <GearIcon value={gear.chip} className="h-6 w-6" />
                {fmt(ui.battle.gear, gearNames)}
              </p>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm text-slate">
              <li>{ui.battle.assistNote}</li>
              <li data-testid="battle-hints-note">{setup.hints > 0 ? fmt(ui.battle.hintsNote, { n: setup.hints }) : ui.battle.noHintsNote}</li>
              {fixed.coreBonus > 0 ? (
                <li data-testid="battle-core-bonus" data-bonus={fixed.coreBonus}>{fmt(ui.battle.coreBonus, { n: fixed.coreBonus })}</li>
              ) : (
                fixed.coreBoost > 0 && !training && <li data-testid="battle-core-bonus" data-bonus={0}>{ui.battle.coreBonusHint}</li>
              )}
              {perk && <li data-testid="battle-perk">{fmt(ui.battle.perk, { outfit: ui.shop.items[`outfit-${boot.outfit}`].name, perk })}</li>}
              {boot.modules.length > 0 && <li data-testid="battle-modules">{fmt(ui.battle.modules, { list: boot.modules.map((module) => ui.shop.items[`module-${module}`].name).join(" ") })}</li>}
            </ul>
            <BagPicker spec={spec} />
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

        {fighting && item && !hintOpen && (
          <div className="flex flex-col gap-2">
            {waiting && (
              <ul
                className="grid gap-x-3 gap-y-1 rounded-md border-2 border-ink bg-paper px-2 py-1 text-xs sm:grid-cols-2"
                aria-label={ui.battle.command.title}
                data-testid="battle-command"
                data-move={strike.armorBreak ? "armor-break" : moveId}
                data-damage={strike.damage}
                data-skill={skillId}
                data-threat={threat.saved ? 0 : threat.damage}
                data-saved={threat.saved ?? ""}
              >
                <li className="flex flex-wrap items-center gap-1">
                  <span className="font-extrabold text-correct-dark">✓ {ui.battle.command.correct}</span>
                  <span className="font-semibold">{strike.armorBreak ? ui.battle.command.armorBreak : `${fmt(ui.battle.command.robot, { move: ui.battle.moves[moveId] })} ${fmt(ui.battle.command.damage, { n: strike.damage })}`}</span>
                  {strike.pierced && <Tag>{ui.battle.command.pierced}</Tag>}
                  {strike.advantage && <Tag>{fmt(ui.battle.command.advantage, { n: GEAR.advantage })}</Tag>}
                  {strike.quake && <Tag>{fmt(ui.battle.command.quake, { n: GEAR.quakeDamage })}</Tag>}
                  {strike.crit && <Tag>{ui.battle.command.crit}</Tag>}
                  {strike.opening && <Tag>{ui.battle.command.opening}</Tag>}
                  {strike.boosted && <Tag>{ui.battle.command.boosted}</Tag>}
                  {strike.counter && <Tag>{ui.battle.command.counter}</Tag>}
                  {strike.stuns && <Tag>{ui.battle.command.stun}</Tag>}
                  {strike.assist > 0 && <Tag>{fmt(ui.battle.command.assist, { n: strike.assist })}</Tag>}
                  {strike.heal > 0 && <Tag>{fmt(ui.battle.command.heal, { n: strike.heal })}</Tag>}
                </li>
                <li className="flex flex-wrap items-center gap-1">
                  <span className="font-extrabold text-wrong">✗ {ui.battle.command.wrong}</span>
                  <span className="font-semibold">
                    {threat.saved === "retry"
                      ? ui.battle.command.retry
                      : threat.saved === "stun"
                        ? fmt(ui.battle.command.stunned, { kaiju })
                        : `${fmt(ui.battle.command.foe, { kaiju, skill: ui.battle.skills[skillId] })} ${threat.saved ? "" : fmt(ui.battle.command.damage, { n: threat.damage })}`}
                  </span>
                  {threat.saved === "dodge" && <Tag>{ui.battle.command.dodge}</Tag>}
                  {threat.saved === "guard" && <Tag>{ui.battle.command.guard}</Tag>}
                  {threat.saved === "shield" && <Tag>{ui.battle.command.shield}</Tag>}
                  {threat.regen > 0 && <Tag>{fmt(ui.battle.command.regen, { n: threat.regen })}</Tag>}
                  {threat.rearm && <Tag>{ui.battle.command.rearm}</Tag>}
                  {threat.reflect > 0 && <Tag>{fmt(ui.battle.command.reflect, { n: threat.reflect })}</Tag>}
                </li>
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border-2 border-ink bg-paper px-2 text-xs font-bold" data-testid="battle-streak">
                {fmt(ui.battle.streak, { n: state.streak })}
              </span>
              <span className="rounded border-2 border-ink bg-paper px-2 text-xs font-bold" data-testid="battle-bag" data-bag={bag.join(",")} data-used={itemUsed} title={ui.battle.itemLimit}>
                🎒 {fmt(ui.battle.bag, { n: bag.length, total: bagSizeOf(boot.outfit) })}
                {itemUsed && ` · ${ui.battle.itemLimit}`}
              </span>
              <span className="flex-1" />
              {waiting && (
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
                  <span key={i}>{eventText(event, foeName(actor), { ...scene, foe: actor })}</span>
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

        {fighting && hintOpen && (
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
            {!training && (spec.unlocks !== undefined || spec.boss) && <p className="text-sm font-semibold text-slate">{spec.unlocks !== undefined ? fmt(ui.battle.wonUnlock, { n: spec.unlocks }) : ui.battle.wonFinal}</p>}
            <button type="button" className="btn mt-2 self-center" data-testid="battle-finish" onClick={closeOverlay}>
              {ui.battle.finish}
            </button>
          </div>
        )}

        {stage === "lost" && (
          <div className="flex flex-col gap-2" data-testid="battle-lost">
            <p className="text-center text-xl font-extrabold text-wrong">{ui.battle.lost}</p>
            <p className="text-center font-semibold">{setup.formResetsOnRetry ? fmt(ui.battle.lostReset, { kaiju }) : fmt(ui.battle.lostDetail, { kaiju, n: state.kaijuHp })}</p>
            {power < spec.power && (
              <p className="text-center text-sm font-bold text-wrong" data-testid="battle-lost-power">
                {fmt(ui.battle.power, { n: power })} · {fmt(ui.battle.powerRec, { n: spec.power })}: {ui.battle.powerLow}
              </p>
            )}
            {/* จัดกระเป๋าสำหรับรอบถัดไปจากของที่ยังเหลือในกล่อง */}
            <BagPicker spec={spec} />
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
