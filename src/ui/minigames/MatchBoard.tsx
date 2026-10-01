import { useEffect, useState } from "react";
import { shuffled } from "../../content/choices";
import { fmt, ui } from "../../content/ui-strings";
import type { MinigameSession } from "./useMinigameSession";

export interface MatchCard {
  label: string;
  /** ข้อความด้านหลังการ์ด พลิกอ่านได้โดยใช้สิทธิ์เปิดอ่าน 1 ครั้ง */
  back?: string;
}

interface MatchBoardProps {
  session: MinigameSession;
  /** การ์ดใบที่ i คู่กับช่องที่ i */
  cards: MatchCard[];
  slots: string[];
  /** จำนวนคู่ต่อชุดในระดับประคอง */
  batchSize?: number;
  /** ช่องเรียงตามลำดับจริงและแจกชุดตามลำดับช่อง (การเรียงขั้นตอน) ถ้าไม่ใช่ ช่องจะสลับลำดับ */
  sequential?: boolean;
  onDone: () => void;
}

/**
 * กระดานจับคู่การ์ดกับช่อง ใช้กับบัตรคำศัพท์ (ห้อง 1) การเรียงขั้นตอน (ห้อง 4) และการจับคู่ระบบ (ห้อง 5)
 * โหมดตรวจทีละชิ้น: วางถูกการ์ดล็อก วางผิดการ์ดกลับถาด โหมดตรวจทั้งรอบ: วางให้ครบแล้วกดส่ง (GDD ข้อ 4.2)
 */
export function MatchBoard({ session, cards, slots, batchSize, sequential = false, onDone }: MatchBoardProps) {
  const indices = cards.map((_, i) => i);
  const [trayOrder] = useState(() => shuffled(indices));
  const [slotOrder] = useState(() => (sequential ? indices : shuffled(indices)));
  const [placed, setPlaced] = useState<ReadonlySet<number>>(new Set());
  /** โหมดตรวจทั้งรอบ: การ์ดที่วางไว้ในช่องแต่ยังไม่ได้ส่ง (ช่อง -> การ์ด) */
  const [pending, setPending] = useState<Readonly<Record<number, number>>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongSlot, setWrongSlot] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(new Set());
  const { roundMode, state } = session;

  // เมื่อเปลี่ยนเป็นตรวจทีละชิ้น หรือกลับจากห้องซ่อม การ์ดที่วางค้างไว้กลับถาด
  useEffect(() => {
    setPending({});
    setSelected(null);
    setWrongSlot(null);
  }, [roundMode, state.repairVisits]);

  useEffect(() => {
    if (placed.size === cards.length) onDone();
    // เรียกครั้งเดียวเมื่อวางครบ onDone ของด่านเปลี่ยนทุกครั้งที่วาดใหม่จึงไม่ใส่ในรายการ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.size, cards.length]);

  // ระดับประคอง: แสดงทีละชุดเล็ก ชุดเรียงตามลำดับช่องเมื่อเป็นการเรียงขั้นตอน
  const unplaced = (sequential ? indices : trayOrder).filter((card) => !placed.has(card));
  const size = state.tier === "assist" && batchSize ? batchSize : unplaced.length;
  const active = unplaced.slice(0, size);
  const pendingCards = new Set(Object.values(pending));
  const trayCards = trayOrder.filter((card) => active.includes(card) && !pendingCards.has(card));
  const visibleSlots = slotOrder.filter((slot) => placed.has(slot) || active.includes(slot));
  const batchTotal = size > 0 ? Math.ceil(cards.length / size) : 1;

  const place = (card: number, slot: number) => {
    if (placed.has(slot) || placed.has(card) || !active.includes(card)) return;
    setSelected(null);
    if (roundMode) {
      // วางไว้ก่อน ยังไม่ตรวจ ถ้าการ์ดนี้อยู่ช่องอื่นให้ย้ายมา
      const others = Object.fromEntries(Object.entries(pending).filter(([, c]) => c !== card));
      setPending({ ...others, [slot]: card });
      session.setFeedback("start");
      return;
    }
    if (card === slot) {
      setPlaced(new Set(placed).add(slot));
      setWrongSlot(null);
      session.setFeedback("correct");
      session.record(true);
    } else {
      setWrongSlot(slot);
      session.setFeedback("wrong");
      session.record(false, [cards[card].label]);
    }
  };

  const clickSlot = (slot: number) => {
    if (selected !== null) place(selected, slot);
    else if (roundMode && slot in pending) {
      const { [slot]: _returned, ...rest } = pending;
      setPending(rest);
    }
  };

  /** การกดส่ง 1 หน = การตรวจ 1 ครั้ง ถูกเมื่อถูกทุกชิ้น ชิ้นที่ผิดกลับถาด */
  const submitRound = () => {
    const next = new Set(placed);
    const missed: string[] = [];
    for (const [slot, card] of Object.entries(pending)) {
      if (Number(slot) === card) next.add(card);
      else missed.push(cards[card].label);
    }
    setPlaced(next);
    setPending({});
    session.setFeedback(missed.length === 0 ? "correct" : "roundWrong");
    session.record(missed.length === 0, missed);
  };

  const flip = (card: number) => {
    if (flipped.has(card)) setFlipped(new Set([...flipped].filter((c) => c !== card)));
    else if (session.takePeek()) setFlipped(new Set(flipped).add(card));
  };

  return (
    <div className="flex flex-col gap-3" data-testid="match-board">
      {size < cards.length && unplaced.length > 0 && (
        <p className="text-sm font-bold text-slate">{fmt(ui.minigame.batch, { n: Math.min(batchTotal, Math.floor(placed.size / size) + 1), total: batchTotal })}</p>
      )}
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <section aria-label={ui.minigame.tray}>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.minigame.tray}</h3>
          <div className="flex flex-wrap gap-2 md:flex-col">
            {trayCards.map((card) => (
              <div key={card} className={`rounded-lg border-[3px] border-ink shadow-[0_3px_0_0_#1a1c2c] ${selected === card ? "bg-hint" : "bg-paper"}`}>
                <button
                  type="button"
                  draggable
                  data-testid="match-card"
                  data-label={cards[card].label}
                  aria-pressed={selected === card}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", String(card))}
                  onClick={() => {
                    setSelected(selected === card ? null : card);
                    session.setFeedback(selected === card ? "start" : "selected");
                  }}
                  className="min-h-11 w-full cursor-grab rounded-md px-3 py-2 text-left font-bold hover:bg-teal-light"
                >
                  {cards[card].label}
                </button>
                {cards[card].back !== undefined && (
                  <div className="border-t-2 border-mist px-3 py-1">
                    {flipped.has(card) && (
                      <p className="mb-1 whitespace-pre-line text-sm leading-snug" data-testid="card-back">
                        {cards[card].back}
                      </p>
                    )}
                    <button type="button" data-testid="flip-card" disabled={!flipped.has(card) && session.peeksLeft <= 0} onClick={() => flip(card)} className="min-h-7 px-1 text-xs font-bold text-teal-dark underline disabled:text-steel disabled:no-underline">
                      {flipped.has(card) ? ui.minigame.flipBack : ui.minigame.flip}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section aria-label={ui.minigame.targets}>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.minigame.targets}</h3>
          <div className="flex flex-col gap-2">
            {visibleSlots.map((slot) => {
              const filled = placed.has(slot);
              const waiting = slot in pending ? cards[pending[slot]].label : null;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={filled}
                  data-testid="match-slot"
                  data-label={slots[slot]}
                  data-filled={filled}
                  data-pending={waiting ?? ""}
                  onClick={() => clickSlot(slot)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    place(Number(event.dataTransfer.getData("text/plain")), slot);
                  }}
                  className={`flex min-h-14 flex-col gap-1 rounded-lg border-[3px] px-3 py-2 text-left sm:flex-row sm:items-center sm:gap-3 ${
                    filled ? "border-correct bg-[#dff5e3]" : wrongSlot === slot ? "border-wrong bg-[#f8e1e5]" : "border-dashed border-ink bg-cream hover:bg-teal-light"
                  }`}
                >
                  <span className="text-sm font-semibold leading-snug sm:flex-1">{slots[slot]}</span>
                  <span
                    className={`rounded-md border-2 px-2 py-1 text-sm font-bold sm:w-1/2 ${
                      filled ? "border-correct bg-paper" : waiting ? "border-ink bg-hint" : "border-dashed border-steel text-slate"
                    }`}
                  >
                    {filled ? `✓ ${cards[slot].label}` : (waiting ?? ui.minigame.emptySlot)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {roundMode && (
        <button type="button" className="btn self-end" data-testid="submit-round" disabled={trayCards.length > 0 || Object.keys(pending).length === 0} onClick={submitRound}>
          {ui.minigame.submit}
        </button>
      )}
    </div>
  );
}
