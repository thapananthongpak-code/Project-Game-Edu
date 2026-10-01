import type { DialoguePage } from "../content";
import type { ContentTable } from "../content/schema";
import { fmt, ui } from "../content/ui-strings";
import type { LearningStyle } from "../state/adaptive.config";

/** จำนวนชิ้นที่ต้องเปิดเองในสไตล์ลงมือทำ: ข้อความ 1 ชิ้นต่อหน้า ตาราง 1 ชิ้นต่อเซลล์ */
export function revealUnits(page: DialoguePage): number {
  return page.kind === "table" ? page.table.rows.length * page.table.headers.length : 1;
}

/** เน้นคำภาษาอังกฤษในวงเล็บโดยไม่เปลี่ยนตัวข้อความ */
function Marked({ text }: { text: string }) {
  return text.split(/(\([A-Za-z][A-Za-z :]*\))/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="term-mark">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function TableView({ table }: { table: ContentTable }) {
  return (
    <div className="max-h-[40dvh] overflow-auto rounded-md border-2 border-ink">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} className="border-b-2 border-ink bg-teal-light px-2 py-1 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]} className="odd:bg-paper even:bg-cream">
              {row.map((cell, i) => (
                <td key={i} className={`border-t border-mist px-2 py-1 align-top ${i === 0 ? "font-semibold" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ตารางแบบการ์ด 1 ใบต่อ 1 แถว (สไตล์ดูภาพ และลงมือทำซึ่งเซลล์คว่ำอยู่จนกว่าจะแตะ) */
function CardTable({ table, revealed, onReveal }: { table: ContentTable; revealed?: ReadonlySet<number>; onReveal?: (unit: number) => void }) {
  const columns = table.headers.length;
  return (
    <div className="grid max-h-[46dvh] gap-2 overflow-auto sm:grid-cols-2" data-testid="card-table">
      {table.rows.map((row, r) => (
        <div key={row[0]} className="rounded-lg border-2 border-ink bg-paper p-2 text-sm">
          {row.map((cell, c) => {
            const unit = r * columns + c;
            const hidden = revealed !== undefined && !revealed.has(unit);
            return (
              <div key={c} className={c === 0 ? "mb-1" : "mt-1 border-t border-mist pt-1"}>
                <div className="text-xs font-bold text-slate">{table.headers[c]}</div>
                {hidden ? (
                  <button type="button" data-testid="flip-cell" className="mt-0.5 w-full rounded border-2 border-dashed border-ink bg-teal-light py-1 text-xs font-bold" onClick={() => onReveal?.(unit)}>
                    {ui.dialogue.faceDown}
                  </button>
                ) : (
                  <div className={c === 0 ? "font-bold text-teal-dark" : ""}>{cell}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface PageViewProps {
  page: DialoguePage;
  style?: LearningStyle;
  /** ชิ้นที่เปิดแล้ว (ใช้เฉพาะสไตล์ลงมือทำ) */
  revealed?: ReadonlySet<number>;
  onReveal?: (unit: number) => void;
}

/**
 * แสดงหน้าเนื้อหาหนึ่งหน้าตามสไตล์การเรียน (GDD ข้อ 7.4) ทุกสไตล์ใช้ข้อความจาก course.json ชุดเดียวกันครบทุกคำ
 * อ่าน = ข้อความและตารางเต็ม, ดูภาพ = เน้นคำสำคัญและตารางเป็นการ์ด, ลงมือทำ = ต้องเปิดเองทีละชิ้นก่อนอ่าน
 */
export function PageView({ page, style = "read", revealed, onReveal }: PageViewProps) {
  const hands = style === "hands" && revealed !== undefined;
  if (page.kind === "table") {
    if (style === "read") return <TableView table={page.table} />;
    return (
      <div className="flex flex-col gap-1">
        {hands && <p className="text-xs font-semibold text-slate">{fmt(ui.dialogue.flipHint, { n: revealed.size, total: revealUnits(page) })}</p>}
        <CardTable table={page.table} revealed={hands ? revealed : undefined} onReveal={onReveal} />
      </div>
    );
  }
  if (hands && !revealed.has(0)) {
    return (
      <button type="button" data-testid="pull-lever" className="btn w-full" onClick={() => onReveal?.(0)}>
        ⇩ {ui.dialogue.pullLever}
      </button>
    );
  }
  return <p className="whitespace-pre-line text-base leading-relaxed">{style === "read" ? page.text : <Marked text={page.text} />}</p>;
}
