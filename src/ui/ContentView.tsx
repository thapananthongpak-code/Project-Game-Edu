import type { DialoguePage } from "../content";
import type { ContentTable } from "../content/schema";
import type { PageStyle } from "../state/adaptive.config";

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

/** ตารางแบบการ์ด 1 ใบต่อ 1 แถว (รูปแบบเน้นคำสำคัญ) */
function CardTable({ table }: { table: ContentTable }) {
  return (
    <div className="grid max-h-[46dvh] gap-2 overflow-auto sm:grid-cols-2" data-testid="card-table">
      {table.rows.map((row) => (
        <div key={row[0]} className="rounded-lg border-2 border-ink bg-paper p-2 text-sm">
          {row.map((cell, c) => (
            <div key={c} className={c === 0 ? "mb-1" : "mt-1 border-t border-mist pt-1"}>
              <div className="text-xs font-bold text-slate">{table.headers[c]}</div>
              <div className={c === 0 ? "font-bold text-teal-dark" : ""}>{cell}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface PageViewProps {
  page: DialoguePage;
  style?: PageStyle;
}

/**
 * แสดงหน้าเนื้อหาหนึ่งหน้า (GDD ข้อ 7.4) ทุกรูปแบบใช้ข้อความจาก course.json ชุดเดียวกันครบทุกคำ
 * read = ข้อความและตารางเต็ม (บทสอน), visual = เน้นคำสำคัญและตารางเป็นการ์ด (ห้องซ่อม)
 */
export function PageView({ page, style = "read" }: PageViewProps) {
  if (page.kind === "table") return style === "read" ? <TableView table={page.table} /> : <CardTable table={page.table} />;
  return <p className="whitespace-pre-line text-base leading-relaxed">{style === "read" ? page.text : <Marked text={page.text} />}</p>;
}
