import { playSfx } from "../../audio/engine";
import { type ReactNode, useMemo, useState } from "react";
import { questOf, resolveRefs, type Station, stripNumber, topicOf } from "../../content";
import { shuffled } from "../../content/choices";
import type { Minigame, Topic } from "../../content/schema";
import { fmt, ui } from "../../content/ui-strings";
import { roomProgress, useGameStore } from "../../state/gameStore";
import type { IMPLEMENTED_MINIGAMES } from "../../state/rules";
import { PageView } from "../ContentView";
import { RepairBay } from "../RepairBay";
import { Stars } from "../Stars";
import { AccuracyBoard } from "./AccuracyBoard";
import { MatchBoard } from "./MatchBoard";
import { SortBoard } from "./SortBoard";
import { useDialog } from "../useDialog";
import { type MinigameSession, useMinigameSession } from "./useMinigameSession";

type Kind = (typeof IMPLEMENTED_MINIGAMES)[number];
// ชนิดมินิเกมใน schema กับรายการที่ประกาศว่าเล่นได้ (src/state/rules.ts) ต้องเป็นชุดเดียวกัน ไม่เช่นนั้น build ไม่ผ่าน
const kindsMatch: [Minigame["kind"]] extends [Kind] ? ([Kind] extends [Minigame["kind"]] ? true : never) : never = true;
void kindsMatch;

/** ด่านหนึ่งของมินิเกม ห้องหนึ่งมีได้หลายด่านเล่นต่อกันโดยนับผิดสะสมร่วมกัน (GDD ห้อง 4 และ 5) */
interface Stage {
  kind: Kind;
  /** ข้อความจาก course.json ที่แสดงเหนือกระดาน เช่น คำสั่งของกิจกรรม หรือชื่อคอลัมน์ที่กำลังจับคู่ */
  heading?: string;
  /** แผงอ้างอิงที่เปิดอ่านได้ (ว่าง = ด่านนี้เปิดอ่านจากหลังการ์ดแทน) */
  reference: Station[];
  /** เนื้อหาที่ห้องซ่อมใช้ทบทวน */
  repair: Station[];
  board: (session: MinigameSession, onDone: () => void) => ReactNode;
}

/** สร้างด่านจากการตั้งค่าใน quests.json ข้อความทุกชิ้นบนกระดานมาจาก course.json */
function stagesOf(room: number, topic: Topic, game: Minigame): Stage[] {
  const reference = resolveRefs(room, game.reference ?? []);
  const base = { kind: game.kind, reference, repair: reference };
  switch (game.kind) {
    case "match-terms": {
      const terms = topic.sections[game.section].terms ?? [];
      return [{ ...base, board: (session, onDone) => <MatchBoard session={session} cards={terms.map((t) => ({ label: t.term }))} slots={terms.map((t) => t.definition)} batchSize={game.assistBatch} onDone={onDone} /> }];
    }
    case "sort-cases": {
      const table = topic.tables[game.basketTable];
      return [
        {
          ...base,
          heading: topic.reviewInstruction,
          board: (session, onDone) => (
            <SortBoard session={session} cards={topic.reviewQuestions.map((q) => q.question)} bins={table.rows.map((row) => row[0])} answer={game.answerKey} batchSize={game.assistBatch} onDone={onDone} />
          ),
        },
      ];
    }
    case "sort-items": {
      const question = topic.reviewQuestions[game.question];
      const headers = topic.tables[game.binTable].headers;
      return [
        {
          ...base,
          board: (session, onDone) => (
            <SortBoard
              session={session}
              cards={question.items ?? []}
              bins={game.binColumns.map((column) => headers[column])}
              answer={game.answerKey.map((column) => game.binColumns.indexOf(column))}
              batchSize={game.assistBatch}
              onDone={onDone}
            />
          ),
        },
      ];
    }
    case "order-steps": {
      // หน้าการ์ดตัดเลขนำหน้าออก ไม่เช่นนั้นเลขจะเฉลยลำดับ ห้องซ่อมทบทวนจากหลังการ์ดแบบสลับลำดับด้วยเหตุผลเดียวกัน
      const cards = topic.sections.map((section) => ({ label: stripNumber(section.heading), back: section.body }));
      const backs = shuffled(cards).map((card) => ({ title: card.label, pages: [{ kind: "text" as const, text: card.back }] }));
      return [
        {
          ...base,
          repair: backs,
          board: (session, onDone) => (
            <MatchBoard session={session} cards={cards} slots={cards.map((_, i) => fmt(ui.minigame.stepSlot, { n: i + 1 }))} batchSize={game.assistBatch} sequential onDone={onDone} />
          ),
        },
      ];
    }
    case "accuracy": {
      const question = topic.reviewQuestions[game.question];
      if (!question.accuracyCase) return [];
      const problem = question.accuracyCase;
      return [{ ...base, board: (session, onDone) => <AccuracyBoard session={session} question={question.question} problem={problem} onDone={onDone} /> }];
    }
    case "match-table": {
      const table = topic.tables[game.table];
      // หนึ่งด่านต่อหนึ่งคอลัมน์: จับป้ายของคอลัมน์นั้นเข้ากับแถว (คอลัมน์แรก)
      return game.columns.map((column) => ({
        ...base,
        heading: `${table.headers[0]} ↔ ${table.headers[column]}`,
        board: (session, onDone) => (
          <MatchBoard key={column} session={session} cards={table.rows.map((row) => ({ label: row[column] }))} slots={table.rows.map((row) => row[0])} batchSize={game.assistBatch} onDone={onDone} />
        ),
      }));
    }
  }
}

/** แผงอ้างอิงที่เปิดอ่านระหว่างเล่น (ใช้สิทธิ์เปิดอ่าน 1 ครั้งต่อการเปิด) */
function PeekPanel({ reference, onClose }: { reference: Station[]; onClose: () => void }) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/70 p-3" data-testid="peek">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.minigame.peekTitle} tabIndex={-1} className="panel flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto p-4">
        <h3 className="text-xs font-bold text-slate">{ui.minigame.peekTitle}</h3>
        {reference.map((ref) => (
          <div key={ref.title} className="flex flex-col gap-2">
            <h4 className="font-extrabold text-teal-dark">{ref.title}</h4>
            {ref.pages.map((page, i) => (
              <PageView key={i} page={page} />
            ))}
          </div>
        ))}
        <button type="button" className="btn self-end" onClick={onClose}>
          {ui.dialogue.close}
        </button>
      </div>
    </div>
  );
}

/**
 * หน้าต่างมินิเกมของห้อง 1–5: เล่นทีละด่านตามที่ quests.json กำหนด
 * ระดับความช่วยเหลือ สิทธิ์เปิดอ่าน ห้องซ่อม และดาว มาจากเครื่องยนต์ปรับระดับผ่าน useMinigameSession
 */
export function MinigameOverlay() {
  const room = useGameStore((s) => s.room) as number;
  const completeMinigame = useGameStore((s) => s.completeMinigame);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const session = useMinigameSession(room);
  const stages = useMemo(() => (questOf(room)?.minigames ?? []).flatMap((game) => stagesOf(room, topicOf(room), game)), [room]);
  const [stageIndex, setStageIndex] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const dialog = useDialog<HTMLDivElement>();

  if (stages.length === 0) return null;
  const complete = stageIndex >= stages.length;
  const stage = stages[Math.min(stageIndex, stages.length - 1)];
  const { state } = session;
  const offer = !complete && session.repairOffered;
  const must = !complete && session.repairRequired;

  const stageDone = () => {
    session.setFeedback(stageIndex + 1 >= stages.length ? "complete" : "stageDone");
    setStageIndex(stageIndex + 1);
  };
  const finish = () => {
    playSfx("star");
    const hadCore = roomProgress(useGameStore.getState(), room).core;
    completeMinigame(state);
    // ระดับยาก: ผ่านเควสแล้วได้แกน AI ของหัวข้อนี้ทันที แสดงหน้ารับแกน
    if (!hadCore && roomProgress(useGameStore.getState(), room).core) openOverlay("reward");
    else closeOverlay();
  };
  const instruction = !session.roundMode ? ui.quest[stage.kind].instruction : stage.kind === "accuracy" ? ui.minigame.accuracyRound : ui.minigame.roundInstruction;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="minigame" data-kind={stage.kind} data-tier={state.tier} data-mode={state.checkMode} data-stage={Math.min(stageIndex, stages.length - 1)}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={fmt(ui.minigame.title, { quest: ui.quest[stage.kind].title })} className="panel mx-auto flex max-w-4xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">
            {fmt(ui.minigame.title, { quest: ui.quest[stage.kind].title })}
            {stages.length > 1 && <span className="ml-2 text-sm text-slate">{fmt(ui.minigame.stage, { n: Math.min(stageIndex + 1, stages.length), total: stages.length })}</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded border-2 border-ink bg-teal-light px-2 py-0.5 font-bold" data-testid="tier">
              {fmt(ui.minigame.tier, { name: ui.tier[state.tier] })}
            </span>
            <span className="rounded border-2 border-ink bg-paper px-2 py-0.5 font-bold" data-testid="misses">
              {fmt(ui.minigame.misses, { n: state.totalMisses })}
            </span>
            <button
              type="button"
              className="btn btn-ghost !min-h-9 text-sm"
              data-testid="peek-button"
              // ด่านที่ไม่มีแผงอ้างอิง ใช้สิทธิ์เปิดอ่านจากปุ่มพลิกหลังการ์ดแทน ปุ่มนี้จึงแสดงสิทธิ์ที่เหลืออย่างเดียว
              disabled={session.peeksLeft === 0 || complete || stage.reference.length === 0}
              onClick={() => session.takePeek() && setPeeking(true)}
            >
              {Number.isFinite(session.peeksLeft) ? fmt(ui.minigame.peek, { n: session.peeksLeft }) : ui.minigame.peekUnlimited}
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setTutorOpen(true)}>
              {ui.hud.tutor}
            </button>
            {/* เล่นจบแล้วปิดหน้าต่าง: นับว่าผ่าน ไม่ต้องเล่นซ้ำ */}
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={complete ? finish : closeOverlay}>
              {ui.minigame.close}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border-2 border-ink bg-teal-light px-3 py-2">
          <img src="assets/characters/ch_mentor_south.png" alt="" className="pixelated h-10 w-10 shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" data-testid="feedback" data-state={session.feedback}>
              <span className="mr-1 font-extrabold">{ui.mentorName}:</span>
              {must ? ui.minigame.repairRequired : offer ? ui.minigame.repairOffer : ui.minigame[session.feedback]}
            </p>
            {(offer || must) && (
              <div className="flex gap-2" data-testid="repair-prompt" data-required={must}>
                {offer && (
                  <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="repair-decline" onClick={session.declineRepair}>
                    {ui.minigame.keepPlaying}
                  </button>
                )}
                <button type="button" className="btn !min-h-9 text-sm" data-testid="repair-go" onClick={session.enterRepair}>
                  {ui.minigame.goRepair}
                </button>
              </div>
            )}
          </div>
        </div>

        {!complete && (
          <>
            {stage.heading && <p className="font-bold">{stage.heading}</p>}
            <p className="text-sm text-slate">{instruction}</p>
            {/* ถูกบังคับเข้าห้องซ่อม: หยุดกระดานไว้จนกว่าจะกลับมา (inert กันทั้งเมาส์ คีย์บอร์ด และโปรแกรมอ่านจอ) */}
            <div className={must ? "opacity-50" : ""} inert={must} key={stageIndex}>
              {stage.board(session, stageDone)}
            </div>
          </>
        )}

        {complete && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-ink bg-paper px-3 py-2" data-testid="minigame-result">
            <span className="flex items-center gap-2 font-bold">
              <Stars count={state.stars} />
              {fmt(ui.minigame.stars, { n: state.stars })}
            </span>
            <button type="button" className="btn" data-testid="minigame-finish" onClick={finish}>
              {ui.minigame.finish}
            </button>
          </div>
        )}
      </div>

      {peeking && <PeekPanel reference={stage.reference} onClose={() => setPeeking(false)} />}

      {session.inRepair && <RepairBay room={room} stations={stage.repair} onDone={session.leaveRepair} />}
    </div>
  );
}
