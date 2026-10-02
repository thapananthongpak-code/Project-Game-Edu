import { useState } from "react";
import { playSfx } from "../audio/engine";
import { buildBattleItems, type ChoiceItem, shuffled } from "../content/choices";
import { fmt, ui } from "../content/ui-strings";
import { creditsOf, roomProgress, useGameStore } from "../state/gameStore";
import { emptyNpc, type NpcId, NPCS, questReady } from "../state/npcs";
import { art } from "./art";
import { ChoiceCard } from "./ChoiceCard";
import { useDialog } from "./useDialog";

type QuestNpc = "mechanic" | "foreman" | "ranger";
type QuizNpc = "coach" | "director" | "sage" | "captain";
type ShopNpc = "archivist" | "vendor" | "smith" | "keeper";

/** เควสเสริมช่วยเหลือ NPC: รับเควส เก็บของที่หายในห้องให้ครบ แล้วกลับมาส่ง */
function Quest({ id, onClose }: { id: QuestNpc; onClose: () => void }) {
  const spec = NPCS[id];
  const text = ui.npc[id];
  const record = useGameStore((s) => s.npcs[id]) ?? emptyNpc();
  const acceptQuest = useGameStore((s) => s.acceptQuest);
  const completeQuest = useGameStore((s) => s.completeQuest);
  const [reward, setReward] = useState<number | null>(null);
  const ready = questReady(spec, record) && !record.done;
  const stage = reward !== null ? "ready" : record.done ? "done" : ready ? "ready" : record.accepted ? "progress" : "intro";

  const handIn = () => {
    const before = creditsOf(useGameStore.getState());
    completeQuest(id);
    setReward(creditsOf(useGameStore.getState()) - before);
    playSfx("quest");
  };

  return (
    <div className="flex flex-col gap-3" data-testid="npc-quest" data-stage={stage}>
      <p className="font-semibold" data-testid="npc-line">
        {stage === "intro" && fmt(text.intro, { n: spec.pickups })}
        {stage === "progress" && fmt(text.progress, { n: record.found.length, total: spec.pickups })}
        {stage === "ready" && text.ready}
        {stage === "done" && text.done}
      </p>
      {reward !== null && (
        <p className="font-bold text-teal-dark" data-testid="npc-reward" data-credits={reward}>
          {fmt(ui.npc.reward, { n: reward })}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {stage === "intro" && (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {ui.npc.later}
            </button>
            <button type="button" className="btn" data-testid="npc-accept" onClick={() => (acceptQuest(id), onClose())}>
              {ui.npc.accept}
            </button>
          </>
        )}
        {stage === "ready" && reward === null && (
          <button type="button" className="btn" data-testid="npc-hand-in" onClick={handIn}>
            {fmt(ui.npc.handIn, { item: text.item })}
          </button>
        )}
        {(stage === "progress" || stage === "done" || reward !== null) && (
          <button type="button" className="btn" data-testid="npc-close" onClick={onClose}>
            {ui.npc.close}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ถามตอบพิเศษ: โจทย์เลือกตอบจากเนื้อหาของหัวข้อ (ข้อความจาก course.json ตรงตัว) เฉลยทันที เป็นการซ้อม
 * ไม่ใช้ปรับระดับความช่วยเหลือ และไม่คิดเป็นคะแนน เกมเก็บเพียงรอบที่ดีที่สุดไว้คิดเครดิตวิจัย
 */
function Quiz({ id, onClose }: { id: QuizNpc; onClose: () => void }) {
  const spec = NPCS[id];
  const text = ui.npc[id];
  const record = useGameStore((s) => s.npcs[id]) ?? emptyNpc();
  // เล่นได้เมื่อได้แกน AI ของทุกหัวข้อที่ใช้โจทย์ ในแมพที่ NPC คนนี้อยู่
  const unlocked = useGameStore((s) => spec.quizTopics.every((topic) => roomProgress(s, topic).core));
  const recordQuiz = useGameStore((s) => s.recordQuiz);
  const [items, setItems] = useState<ChoiceItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<number | undefined>(undefined);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<{ correct: number; credits: number } | null>(null);

  const start = () => {
    // โจทย์จากทุกหัวข้อของ NPC คนนี้ สลับปนกัน
    setItems(shuffled(spec.quizTopics.flatMap((topic) => buildBattleItems(topic, "mixed"))).slice(0, spec.questions));
    setIndex(0);
    setAnswered(undefined);
    setCorrect(0);
    setResult(null);
  };
  const answer = (option: number) => {
    if (!items) return;
    const right = option === items[index].answer;
    setAnswered(option);
    if (right) setCorrect(correct + 1);
    playSfx(right ? "correct" : "wrong");
  };
  const next = () => {
    if (!items) return;
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setAnswered(undefined);
      return;
    }
    const before = creditsOf(useGameStore.getState());
    recordQuiz(id, correct);
    setResult({ correct, credits: creditsOf(useGameStore.getState()) - before });
    setItems(null);
    playSfx("quest");
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-3" data-testid="npc-quiz" data-stage="locked">
        <p className="font-semibold" data-testid="npc-line">
          {text.locked}
        </p>
        <button type="button" className="btn self-end" data-testid="npc-close" onClick={onClose}>
          {ui.npc.close}
        </button>
      </div>
    );
  }

  if (items) {
    const item = items[index];
    const right = answered === item.answer;
    return (
      <div className="flex flex-col gap-3" data-testid="npc-quiz" data-stage="asking">
        <span className="self-start rounded border-2 border-ink bg-paper px-2 text-xs font-bold" data-testid="npc-quiz-progress">
          {fmt(ui.npc.quizProgress, { n: index + 1, total: items.length })}
        </span>
        <ChoiceCard key={index} item={item} onAnswer={answer} answered={answered} />
        <div className="flex min-h-11 items-center justify-between gap-2" aria-live="polite">
          {answered !== undefined && <span className={`font-bold ${right ? "text-correct-dark" : "text-wrong"}`}>{right ? `✓ ${ui.npc.correct}` : `✗ ${ui.npc.wrong}`}</span>}
          {answered !== undefined && (
            <button type="button" className="btn ml-auto" data-testid="npc-quiz-next" onClick={next}>
              {index + 1 < items.length ? ui.npc.next : ui.npc.finish}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="npc-quiz" data-stage={result ? "result" : "intro"}>
      <p className="font-semibold" data-testid="npc-line">
        {result ? text.result : fmt(text.intro, { n: spec.questions })}
      </p>
      {result && (
        <p className="font-extrabold text-teal-dark" data-testid="npc-quiz-result" data-correct={result.correct}>
          {fmt(ui.npc.quizResult, { n: result.correct, total: spec.questions })}
          {result.credits > 0 && (
            <span className="ml-2" data-testid="npc-reward" data-credits={result.credits}>
              {fmt(ui.npc.reward, { n: result.credits })}
            </span>
          )}
        </p>
      )}
      {record.tries > 0 && <p className="text-sm font-bold text-slate">{fmt(ui.npc.quizBest, { n: record.best, total: spec.questions })}</p>}
      <p className="text-sm text-slate">{ui.npc.quizNote}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" data-testid="npc-close" onClick={onClose}>
          {ui.npc.close}
        </button>
        <button type="button" className="btn" data-testid="npc-quiz-start" onClick={start}>
          {record.tries > 0 || result ? ui.npc.again : ui.npc.startQuiz}
        </button>
      </div>
    </div>
  );
}

/** ช่วยเหลือ: NPC ให้ของใช้ครั้งเดียว (ลงกระเป๋าให้ถ้ามีที่ว่าง) */
function Gift({ id, onClose }: { id: "medic"; onClose: () => void }) {
  const spec = NPCS[id];
  const text = ui.npc[id];
  const record = useGameStore((s) => s.npcs[id]) ?? emptyNpc();
  const claimGift = useGameStore((s) => s.claimGift);
  const [given, setGiven] = useState(false);
  const list = spec.gift.map((supply) => ui.shop.items[`supply-${supply}`].name).join(" · ");
  return (
    <div className="flex flex-col gap-3" data-testid="npc-gift" data-stage={record.gifted ? "done" : "intro"}>
      <p className="font-semibold" data-testid="npc-line">
        {record.gifted && !given ? text.done : text.intro}
      </p>
      {given && (
        <p className="font-bold text-teal-dark" data-testid="npc-gift-result">
          {fmt(text.gave, { list })}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {!record.gifted && (
          <button type="button" className="btn" data-testid="npc-gift-claim" onClick={() => (claimGift(id), setGiven(true), playSfx("quest"))}>
            {text.claim}
          </button>
        )}
        <button type="button" className={`btn ${record.gifted ? "" : "btn-ghost"}`} data-testid="npc-close" onClick={onClose}>
          {ui.npc.close}
        </button>
      </div>
    </div>
  );
}

/** เรื่องราวของ NPC: เล่าทีละช่วงเมื่อคุยครั้งแรก กดฟังซ้ำได้ */
function Story({ id, onDone }: { id: NpcId; onDone: () => void }) {
  const lines = ui.npc.stories[id];
  const [index, setIndex] = useState(0);
  const last = index + 1 >= lines.length;
  return (
    <div className="flex flex-col gap-3" data-testid="npc-story" data-line={index}>
      <p className="rounded-md border-2 border-ink bg-teal-light px-3 py-2 font-semibold" data-testid="npc-story-line">
        {lines[index]}
      </p>
      <button type="button" className="btn self-end" data-testid="npc-story-next" onClick={() => (last ? onDone() : setIndex(index + 1), playSfx("page"))}>
        {last ? ui.npc.close : ui.npc.storyNext}
      </button>
    </div>
  );
}

/**
 * หน้าต่างคุยกับ NPC (GDD ข้อ 16): คุยครั้งแรกได้ฟังเรื่องราวของคนนั้นก่อน แล้วจึงเป็นกิจกรรมตามบทบาท
 * เควสเสริม ถามตอบพิเศษ ของช่วยเหลือ หรือปุ่มเปิดร้านพิเศษ
 */
export function Npc() {
  const id = useGameStore((s) => s.npcId) as NpcId;
  const met = useGameStore((s) => s.npcs[id]?.met ?? false);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const openShop = useGameStore((s) => s.openShop);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const [telling, setTelling] = useState(!met);
  const spec = NPCS[id];
  const name = ui.npc[id].name;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-ink/80 p-2 sm:items-center sm:p-4" data-testid="npc" data-npc={id}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} className="panel flex w-full max-w-xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <img src={art.npc(id)} alt="" className="pixelated h-16 w-16 shrink-0 rounded-md border-2 border-ink bg-teal-light" />
          <div>
            <h2 className="text-lg font-extrabold text-teal-dark" data-testid="npc-name">
              {name}
            </h2>
            <span className="rounded border-2 border-ink bg-hint px-2 text-xs font-bold">{ui.npc.roles[spec.role]}</span>
          </div>
          {!telling && (
            <button type="button" className="btn btn-ghost ml-auto !min-h-9 !px-2 text-xs" data-testid="npc-story-again" onClick={() => setTelling(true)}>
              {ui.npc.storyAgain}
            </button>
          )}
        </div>
        {telling && <Story id={id} onDone={() => (meetNpc(id), setTelling(false))} />}
        {!telling && spec.role === "quest" && <Quest id={id as QuestNpc} onClose={closeOverlay} />}
        {!telling && spec.role === "quiz" && <Quiz id={id as QuizNpc} onClose={closeOverlay} />}
        {!telling && spec.role === "gift" && <Gift id={id as "medic"} onClose={closeOverlay} />}
        {!telling && spec.role === "shop" && (
          <div className="flex flex-col gap-3" data-testid="npc-shop">
            <p className="font-semibold" data-testid="npc-line">
              {ui.npc[id as ShopNpc].greet}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" data-testid="npc-close" onClick={closeOverlay}>
                {ui.npc.close}
              </button>
              <button type="button" className="btn" data-testid="npc-open-shop" onClick={() => openShop(id)}>
                {ui.npc.openShop}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
