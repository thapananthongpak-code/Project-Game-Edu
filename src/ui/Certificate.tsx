import { ASSESSMENT_ITEMS_PER_TOPIC, course, ROOM_COUNT, topicOf } from "../content";
import { reviewBlocks } from "../content/review";
import { fmt, ui } from "../content/ui-strings";
import { gainOf } from "../state/assessment";
import { accuracyPercent, emptyField, fieldTotals } from "../state/field";
import { battlesWon, difficultyOf, planOf, roomProgress, useGameStore } from "../state/gameStore";
import type { Profile, RoomProgress } from "../state/progressStore";
import { Stars } from "./Stars";
import { useDialog } from "./useDialog";

const quest = course.finalQuest;

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** สมุดบันทึกสำหรับส่งครู: คำตอบทบทวนทุกห้อง ตารางผล บันทึกเพิ่มเติม และภาพหน้าจอ เป็นไฟล์ HTML ไฟล์เดียว */
function notebookHtml(profile: Profile, progress: Record<number, RoomProgress>): string {
  const parts: string[] = [`<h1>${escapeHtml(ui.certificate.notebook)}: ${escapeHtml(profile.name)}</h1>`];
  for (const topic of course.topics) {
    const answers = roomProgress({ progress }, topic.id).reviewAnswers;
    const blocks = reviewBlocks(topic.id);
    if (blocks.length === 0) continue;
    parts.push(`<h2>${topic.id}. ${escapeHtml(topic.title)}</h2>`);
    let index = 0;
    for (const block of blocks) {
      parts.push(`<h3>${escapeHtml(block.question)}</h3>`);
      for (const fact of block.facts) parts.push(`<p>${escapeHtml(fact.label)}: <b>${escapeHtml(fact.value)}</b></p>`);
      for (const field of block.fields) parts.push(`<p>${field.label ? `<i>${escapeHtml(field.label)}</i><br>` : ""}${escapeHtml(answers[index++] ?? "")}</p>`);
    }
  }
  const last = topicOf(ROOM_COUNT);
  const field = roomProgress({ progress }, ROOM_COUNT).field ?? emptyField(quest);
  const totals = fieldTotals(field.results, quest);
  const table = last.tables[0];
  const rows = quest.resultTable.classes.map((name, i) => {
    const r = field.results[i];
    return `<tr><td>${escapeHtml(name)}</td><td>${r.images ?? ""}</td><td>${quest.resultTable.testsPerClass}</td><td>${r.correct ?? ""}</td><td>${r.correct === null ? "" : `${accuracyPercent(r.correct, quest.resultTable.testsPerClass)}%`}</td></tr>`;
  });
  parts.push(
    `<h2>${last.id}. ${escapeHtml(last.title)}</h2>`,
    `<table border="1" cellpadding="6"><tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>${rows.join("")}<tr><th>${escapeHtml(table.rows[table.rows.length - 1][0])}</th><th>${totals.images ?? ""}</th><th>${totals.tests}</th><th>${totals.correct ?? ""}</th><th>${totals.accuracy ?? ""}%</th></tr></table>`,
  );
  quest.notes?.prompts.forEach((prompt, i) => parts.push(`<h3>${escapeHtml(prompt)}</h3><p>${escapeHtml(field.notes[i] ?? "")}</p>`));
  if (field.evidence.image) parts.push(`<p><img src="${field.evidence.image}" style="max-width:100%"></p>`);
  else if (field.evidence.outsideGame) parts.push(`<p>${escapeHtml(ui.field.outsideGame)}</p>`);
  return `<!doctype html><html lang="th"><meta charset="utf-8"><title>${escapeHtml(ui.certificate.notebook)}</title><body style="font-family:sans-serif;max-width:800px;margin:auto;padding:16px">${parts.join("\n")}</body></html>`;
}

function download(name: string, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // เบราว์เซอร์บางตัวเริ่มดาวน์โหลดช้ากว่าการคลิก ถ้ายกเลิก URL ทันทีไฟล์จะว่าง
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * ใบประกาศนักฝึก AI (GDD ข้อ 8): ยืนยันว่าเล่นจบและส่งงานครบ ไม่ใช่คะแนน คะแนนเป็นของครูตามเกณฑ์ประเมิน
 * สมรรถนะทั้ง 6 ข้อมาจาก topics[].objective ใน course.json
 */
export function Certificate() {
  const profile = useGameStore((s) => s.profile);
  const progress = useGameStore((s) => s.progress);
  const won = useGameStore(battlesWon);
  const battleTotal = useGameStore((s) => planOf(s).battles.length);
  const difficulty = useGameStore(difficultyOf);
  const pretest = useGameStore((s) => s.pretest);
  const posttest = useGameStore((s) => s.posttest);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  if (!profile) return null;
  const growth = gainOf(pretest, posttest, ASSESSMENT_ITEMS_PER_TOPIC);
  const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

  const last = topicOf(ROOM_COUNT);
  const final = roomProgress({ progress }, ROOM_COUNT);
  const field = final.field ?? emptyField(quest);
  const totals = fieldTotals(field.results, quest);
  const table = last.tables[0];
  const { classes, testsPerClass } = quest.resultTable;
  const references = last.sections[last.sections.length - 1];
  const date = new Date(final.coreAt ?? Date.now()).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const cell = "border border-ink px-2 py-1";

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/90 p-2 sm:p-4" data-testid="certificate">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.certificate.title} tabIndex={-1} className="print-area mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border-[6px] border-double border-teal-dark bg-cream p-5 sm:p-8">
        <header className="text-center">
          <div className="flex justify-center gap-1">
            {course.topics.map((topic) => (
              <img key={topic.id} src={`assets/cores/core_${topic.id}.png`} alt="" className="pixelated h-10 w-10" />
            ))}
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-teal-dark">{ui.certificate.title}</h1>
          {course.course && (
            <p className="text-sm text-slate">
              {course.course.code} {course.course.title} · {course.course.unit}
            </p>
          )}
          <p className="mt-3 text-sm text-slate">{ui.certificate.awardedTo}</p>
          <p className="text-2xl font-extrabold" data-testid="certificate-name">
            {profile.name}
          </p>
          <p className="text-sm text-slate">
            {ui.certificate.date} {date}
          </p>
          <p className="mt-1 text-sm font-bold text-teal-dark" data-testid="certificate-guardian">
            ⚔ {fmt(ui.certificate.guardian, { n: won, total: battleTotal })} · {fmt(ui.certificate.difficulty, { name: ui.difficulty[difficulty].name })}
          </p>
        </header>

        <section>
          <h2 className="mb-1 font-extrabold text-teal-dark">{ui.certificate.competencies}</h2>
          <ol className="flex flex-col gap-1">
            {course.topics.map((topic) => {
              const rp = roomProgress({ progress }, topic.id);
              return (
                <li key={topic.id} data-testid="certificate-competency" data-passed={rp.core} className="flex items-center gap-2 rounded border-2 border-ink bg-paper px-2 py-1 text-sm">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-ink font-extrabold ${rp.core ? "bg-correct text-ink" : "bg-cream"}`}>{rp.core ? "✓" : ""}</span>
                  <span className="flex-1 font-semibold">{topic.objective}</span>
                  {topic.id < ROOM_COUNT ? <Stars count={rp.stars} /> : <span className="font-extrabold">{table.headers[table.headers.length - 1]} {totals.accuracy ?? "—"}%</span>}
                </li>
              );
            })}
          </ol>
        </section>

        <section>
          <h2 className="mb-1 font-extrabold text-teal-dark">{ui.certificate.result}</h2>
          <table className="w-full border-collapse text-center text-sm">
            <thead>
              <tr className="bg-teal-light">
                {table.headers.map((header) => (
                  <th key={header} className={cell}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classes.map((name, i) => (
                <tr key={name} className="bg-paper">
                  <th className={`${cell} text-left`}>{name}</th>
                  <td className={cell}>{field.results[i].images}</td>
                  <td className={cell}>{testsPerClass}</td>
                  <td className={cell}>{field.results[i].correct}</td>
                  <td className={cell}>{field.results[i].correct === null ? "" : `${accuracyPercent(field.results[i].correct as number, testsPerClass)}%`}</td>
                </tr>
              ))}
              <tr className="bg-teal-light font-extrabold">
                <th className={`${cell} text-left`}>{table.rows[table.rows.length - 1][0]}</th>
                <td className={cell}>{totals.images}</td>
                <td className={cell}>{totals.tests}</td>
                <td className={cell}>{totals.correct}</td>
                <td className={cell} data-testid="certificate-accuracy">
                  {totals.accuracy}%
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {growth && (
          <section data-testid="certificate-growth">
            <h2 className="mb-1 font-extrabold text-teal-dark">{ui.certificate.growth}</h2>
            <table className="w-full border-collapse text-center text-sm">
              <thead>
                <tr className="bg-teal-light">
                  <th className={`${cell} text-left`}>{ui.certificate.competency}</th>
                  <th className={cell}>{ui.certificate.before}</th>
                  <th className={cell}>{ui.certificate.after}</th>
                  <th className={cell}>{ui.certificate.gain}</th>
                </tr>
              </thead>
              <tbody>
                {growth.byTopic.map((row) => (
                  <tr key={row.topic} className="bg-paper">
                    <th className={`${cell} text-left font-semibold`}>
                      {row.topic}. {topicOf(row.topic).title}
                    </th>
                    <td className={cell}>
                      {row.pre}/{row.max}
                    </td>
                    <td className={cell}>
                      {row.post}/{row.max}
                    </td>
                    <td className={cell}>{signed(row.gain)}</td>
                  </tr>
                ))}
                <tr className="bg-teal-light font-extrabold">
                  <th className={`${cell} text-left`}>{ui.certificate.total}</th>
                  <td className={cell} data-testid="growth-pre">
                    {growth.pre}/{growth.max}
                  </td>
                  <td className={cell} data-testid="growth-post">
                    {growth.post}/{growth.max}
                  </td>
                  <td className={cell} data-testid="growth-gain">
                    {signed(growth.gain)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate">{ui.certificate.growthNote}</p>
          </section>
        )}

        <section>
          <h2 className="mb-1 font-extrabold text-teal-dark">{ui.certificate.criteria}</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {quest.gradingCriteria.map((criterion) => (
                <tr key={criterion.criterion} className="bg-paper">
                  <td className={cell}>{criterion.criterion}</td>
                  <td className={`${cell} w-28 text-center`}>
                    {ui.certificate.weight} {criterion.weightPercent}%
                  </td>
                  <td className={`${cell} w-28 text-slate`}>{ui.certificate.score} ……</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate">{ui.certificate.note}</p>
          <p className="mt-6 text-right text-sm">{ui.certificate.teacherSign} ……………………………………</p>
        </section>

        <section className="text-xs text-slate">
          <h2 className="font-bold">{references.heading}</h2>
          <p className="whitespace-pre-line break-all">{references.body}</p>
        </section>

        <div className="no-print flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" data-testid="certificate-download" onClick={() => download(fmt(ui.certificate.notebookFile, { name: profile.name }), notebookHtml(profile, progress))}>
            {ui.certificate.download}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            {ui.certificate.print}
          </button>
          <button type="button" className="btn" data-testid="certificate-back" onClick={closeOverlay}>
            {ui.certificate.back}
          </button>
        </div>
      </div>
    </div>
  );
}
