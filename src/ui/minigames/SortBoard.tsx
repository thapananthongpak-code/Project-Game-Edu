import { useEffect, useState } from "react";
import { shuffled } from "../../content/choices";
import { fmt, ui } from "../../content/ui-strings";
import type { MinigameSession } from "./useMinigameSession";

interface SortBoardProps {
  session: MinigameSession;
  cards: string[];
  bins: string[];
  /** ที่เก็บที่ถูกของการ์ดแต่ละใบ เป็น index ของ bins */
  answer: number[];
  /** จำนวนการ์ดต่อชุดในระดับประคอง */
  batchSize?: number;
  onDone: () => void;
}

/**
 * กระดานคัดการ์ดลงที่เก็บ ใช้กับกรณีศึกษาลงตะกร้า (ห้อง 2) และไอเทมเข้าคลัง (ห้อง 3)
 * เกมไม่บอกล่วงหน้าว่าที่เก็บแต่ละจุดรับกี่ใบ
 */
export function SortBoard({ session, cards, bins, answer, batchSize, onDone }: SortBoardProps) {
  const [trayOrder] = useState(() => shuffled(cards.map((_, i) => i)));
  /** การ์ดที่คัดถูกแล้ว (การ์ด -> ที่เก็บ) */
  const [placed, setPlaced] = useState<Readonly<Record<number, number>>>({});
  /** โหมดตรวจทั้งรอบ: การ์ดที่วางไว้แต่ยังไม่ได้ส่ง */
  const [pending, setPending] = useState<Readonly<Record<number, number>>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongBin, setWrongBin] = useState<number | null>(null);
  const { roundMode, state } = session;
  const placedCount = Object.keys(placed).length;

  useEffect(() => {
    setPending({});
    setSelected(null);
    setWrongBin(null);
  }, [roundMode, state.repairVisits]);

  useEffect(() => {
    if (placedCount === cards.length) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedCount, cards.length]);

  const unplaced = trayOrder.filter((card) => !(card in placed));
  const size = state.tier === "assist" && batchSize ? batchSize : unplaced.length;
  const active = unplaced.slice(0, size);
  const trayCards = active.filter((card) => !(card in pending));
  const batchTotal = size > 0 ? Math.ceil(cards.length / size) : 1;

  const place = (card: number, bin: number) => {
    if (card in placed || !active.includes(card)) return;
    setSelected(null);
    if (roundMode) {
      setPending({ ...pending, [card]: bin });
      session.setFeedback("start");
      return;
    }
    if (answer[card] === bin) {
      setPlaced({ ...placed, [card]: bin });
      setWrongBin(null);
      session.setFeedback("correct");
      session.record(true);
    } else {
      setWrongBin(bin);
      session.setFeedback("wrong");
      session.record(false, [cards[card]]);
    }
  };

  const submitRound = () => {
    const next = { ...placed };
    const missed: string[] = [];
    for (const [card, bin] of Object.entries(pending)) {
      if (answer[Number(card)] === bin) next[Number(card)] = bin;
      else missed.push(cards[Number(card)]);
    }
    setPlaced(next);
    setPending({});
    session.setFeedback(missed.length === 0 ? "correct" : "roundWrong");
    session.record(missed.length === 0, missed);
  };

  const returnToTray = (card: number) => {
    const { [card]: _returned, ...rest } = pending;
    setPending(rest);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="sort-board">
      {size < cards.length && unplaced.length > 0 && (
        <p className="text-sm font-bold text-slate">{fmt(ui.minigame.batch, { n: Math.min(batchTotal, Math.floor(placedCount / size) + 1), total: batchTotal })}</p>
      )}
      <section aria-label={ui.minigame.tray}>
        <h3 className="mb-1 text-xs font-bold text-slate">{ui.minigame.tray}</h3>
        <div className="flex min-h-12 flex-wrap gap-2">
          {trayCards.map((card) => (
            <button
              key={card}
              type="button"
              draggable
              data-testid="sort-card"
              data-label={cards[card]}
              aria-pressed={selected === card}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", String(card))}
              onClick={() => {
                setSelected(selected === card ? null : card);
                session.setFeedback(selected === card ? "start" : "selected");
              }}
              className={`min-h-11 cursor-grab rounded-lg border-[3px] border-ink px-3 py-2 text-left font-semibold shadow-[0_3px_0_0_#1a1c2c] ${selected === card ? "bg-hint" : "bg-paper hover:bg-teal-light"}`}
            >
              {cards[card]}
            </button>
          ))}
        </div>
      </section>

      <section aria-label={ui.minigame.targets} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>
        {bins.map((bin, binIndex) => (
          // ทั้งกล่องรับการคลิกและการลากวาง ส่วนผู้ใช้คีย์บอร์ดและโปรแกรมอ่านจอใช้ปุ่มชื่อที่เก็บด้านบน
          <div
            key={bin}
            data-testid="sort-bin-area"
            onClick={() => selected !== null && place(selected, binIndex)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              place(Number(event.dataTransfer.getData("text/plain")), binIndex);
            }}
            className={`flex min-h-28 cursor-pointer flex-col gap-1 rounded-lg border-[3px] p-2 ${wrongBin === binIndex ? "border-wrong bg-[#f8e1e5]" : "border-dashed border-ink bg-cream hover:bg-teal-light"}`}
          >
            <button
              type="button"
              data-testid="sort-bin"
              data-label={bin}
              onClick={(event) => {
                event.stopPropagation();
                if (selected !== null) place(selected, binIndex);
              }}
              className="min-h-9 rounded border-2 border-ink bg-teal-light px-2 py-0.5 text-center text-sm font-extrabold"
            >
              {bin}
            </button>
            {Object.entries(placed)
              .filter(([, b]) => b === binIndex)
              .map(([card]) => (
                <span key={card} data-testid="sort-placed" className="rounded border-2 border-correct bg-[#dff5e3] px-2 py-1 text-xs font-semibold">
                  ✓ {cards[Number(card)]}
                </span>
              ))}
            {Object.entries(pending)
              .filter(([, b]) => b === binIndex)
              .map(([card]) => (
                <button
                  key={card}
                  type="button"
                  data-testid="sort-pending"
                  onClick={(event) => {
                    event.stopPropagation();
                    // กำลังถือการ์ดอีกใบอยู่: วางใบนั้นลงที่เก็บนี้ ไม่ใช่ดึงใบที่วางไว้กลับถาด
                    if (selected !== null) place(selected, binIndex);
                    else returnToTray(Number(card));
                  }}
                  className="min-h-7 rounded border-2 border-ink bg-hint px-2 py-1 text-left text-xs font-semibold"
                >
                  {cards[Number(card)]}
                </button>
              ))}
          </div>
        ))}
      </section>

      {roundMode && (
        <button type="button" className="btn self-end" data-testid="submit-round" disabled={trayCards.length > 0 || Object.keys(pending).length === 0} onClick={submitRound}>
          {ui.minigame.submit}
        </button>
      )}
    </div>
  );
}
