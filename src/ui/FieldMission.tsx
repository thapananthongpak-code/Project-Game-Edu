import { course, topicOf } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { accuracyPercent, emptyField, type FieldProgress, fieldStatus, fieldTotals, validCorrect, validImages } from "../state/field";
import { roomProgress, useGameStore } from "../state/gameStore";
import { useDialog } from "./useDialog";

const quest = course.finalQuest;
/** ขนาดด้านยาวสูงสุดของภาพหน้าจอที่เก็บในเบราว์เซอร์ */
const EVIDENCE_MAX_SIDE = 960;

/** ย่อภาพที่แนบให้เล็กพอเก็บใน localStorage คืน data URL แบบ JPEG */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, EVIDENCE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

const toNumber = (text: string): number | null => (text.trim() === "" ? null : Number(text));
const percent = (value: number | null): string => (value === null ? "—" : `${value}%`);

/**
 * ภารกิจภาคสนามห้อง 6 (GDD ข้อ 6): เปิดเครื่องมือจริงในแท็บใหม่ ติ๊กขั้นตอน กรอกตารางผล ติ๊กว่าคิดทบทวนประเด็นของบันทึกแล้ว (ไม่มีการเขียนตอบในเกม) และแนบหลักฐาน
 * ข้อความทั้งหมดมาจาก topics ของห้องนี้และ finalQuest ใน course.json เกมตรวจสิ่งที่เกิดบนเว็บภายนอกไม่ได้ ครูตรวจจากหลักฐาน
 */
export function FieldMission() {
  const room = useGameStore((s) => s.room) as number;
  const saved = useGameStore((s) => roomProgress(s, room).field);
  const setField = useGameStore((s) => s.setField);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const topic = topicOf(room);
  const table = topic.tables[0];
  const field: FieldProgress = saved ?? emptyField(quest);
  const status = fieldStatus(field, quest);
  const totals = fieldTotals(field.results, quest);
  const { classes, testsPerClass } = quest.resultTable;
  // แถวรวมใช้ชื่อตามตารางในเอกสาร: แถวที่ไม่ใช่ชื่อคลาส
  const totalLabel = table.rows.find((row) => !classes.includes(row[0]))?.[0] ?? "";
  const [steps, previewNote] = topic.sections[0].body.split("\n\n");
  void steps;
  const stepsDone = field.steps.filter(Boolean).length;
  const update = (patch: Partial<FieldProgress>) => setField({ ...field, ...patch });

  const setResult = (index: number, key: "images" | "correct", text: string) =>
    update({ results: field.results.map((r, i) => (i === index ? { ...r, [key]: toNumber(text) } : r)) });

  const attach = async (file: File | undefined) => {
    if (file) update({ evidence: { ...field.evidence, image: await shrinkImage(file) } });
  };

  const section = "flex flex-col gap-2 rounded-lg border-2 border-ink bg-paper p-3";
  const done = (ok: boolean) => `shrink-0 rounded border-2 border-ink px-1.5 text-xs font-bold ${ok ? "bg-correct text-ink" : "bg-cream"}`;

  const dialog = useDialog<HTMLDivElement>();

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="field">
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={ui.field.title} className="panel mx-auto flex max-w-3xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">
            {ui.field.title}: {topic.title}
          </h2>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setTutorOpen(true)}>
              {ui.hud.tutor}
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="field-close" onClick={closeOverlay}>
              {ui.field.close}
            </button>
          </div>
        </div>

        <section className={section}>
          <p>{topic.intro}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="h-6 w-6 shrink-0" checked={field.ready} data-testid="field-ready" onChange={(event) => update({ ready: event.target.checked })} />
            {ui.field.ready}
          </label>
        </section>

        <section className={section}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold text-teal-dark">{topic.sections[0].heading}</h3>
            <span className={done(status.checklist)}>{fmt(ui.field.statusChecklist, { n: stepsDone, total: quest.steps.length })}</span>
          </div>
          <a href={quest.url} target="_blank" rel="noopener noreferrer" className="btn inline-flex items-center justify-center self-start no-underline" data-testid="field-link">
            ↗ {fmt(ui.field.open, { tool: quest.tool })}
          </a>
          <span className="text-xs text-slate">{ui.field.newTab}</span>
          <ol className="flex flex-col gap-1">
            {quest.steps.map((step, i) => (
              <li key={step}>
                <label className={`flex items-start gap-2 ${i > 0 && !field.steps[i - 1] ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-6 w-6 shrink-0"
                    checked={field.steps[i]}
                    // ติ๊กตามลำดับ: ขั้นถัดไปติ๊กได้เมื่อขั้นก่อนหน้าติ๊กแล้ว และยกเลิกได้เฉพาะขั้นล่าสุด
                    disabled={(i > 0 && !field.steps[i - 1]) || (field.steps[i] && field.steps[i + 1] === true)}
                    data-testid="field-step"
                    onChange={(event) => update({ steps: field.steps.map((s, j) => (j === i ? event.target.checked : s)) })}
                  />
                  <span>
                    <span className="font-bold">{i + 1}.</span> {step}
                  </span>
                </label>
              </li>
            ))}
          </ol>
          {previewNote && stepsDone >= 4 && (
            <p className="rounded-md border-2 border-ink bg-hint p-2 text-sm" data-testid="field-preview-note">
              <span className="mr-1 font-extrabold">{ui.mentorName}:</span>
              {previewNote}
            </p>
          )}
        </section>

        <section className={section}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold text-teal-dark">{topic.sections[1].heading}</h3>
            <span className={done(status.results)}>{ui.field.statusResults}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="field-table">
              <thead>
                <tr>
                  {table.headers.map((header) => (
                    <th key={header} className="border-2 border-ink bg-teal-light px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classes.map((name, i) => {
                  const result = field.results[i];
                  const imagesOk = result.images === null || validImages(result.images, quest);
                  const correctOk = result.correct === null || validCorrect(result.correct, quest);
                  return (
                    <tr key={name} data-testid="field-row">
                      <th className="border-2 border-ink bg-cream px-2 py-1 text-left">{name}</th>
                      <td className="border-2 border-ink p-1">
                        <input type="number" min={quest.minImagesPerClass} step={1} inputMode="numeric" value={result.images ?? ""} data-testid="field-images" aria-label={`${table.headers[1]}: ${name}`} aria-invalid={!imagesOk} onChange={(event) => setResult(i, "images", event.target.value)} className={`w-20 select-text rounded border-2 p-1 text-center ${imagesOk ? "border-steel" : "border-wrong bg-[#f8e1e5]"}`} />
                        {!imagesOk && <div className="text-xs text-wrong">{fmt(ui.field.imagesInvalid, { n: quest.minImagesPerClass ?? 1 })}</div>}
                      </td>
                      <td className="border-2 border-ink px-2 py-1 text-center font-bold">{testsPerClass}</td>
                      <td className="border-2 border-ink p-1">
                        <input type="number" min={0} max={testsPerClass} step={1} inputMode="numeric" value={result.correct ?? ""} data-testid="field-correct" aria-label={`${table.headers[3]}: ${name}`} aria-invalid={!correctOk} onChange={(event) => setResult(i, "correct", event.target.value)} className={`w-20 select-text rounded border-2 p-1 text-center ${correctOk ? "border-steel" : "border-wrong bg-[#f8e1e5]"}`} />
                        {!correctOk && <div className="text-xs text-wrong">{fmt(ui.field.correctInvalid, { n: testsPerClass })}</div>}
                      </td>
                      <td className="border-2 border-ink px-2 py-1 text-center font-bold" data-testid="field-accuracy">
                        {percent(validCorrect(result.correct, quest) ? accuracyPercent(result.correct, testsPerClass) : null)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-teal-light font-extrabold" data-testid="field-total">
                  <th className="border-2 border-ink px-2 py-1 text-left">{totalLabel}</th>
                  <td className="border-2 border-ink px-2 py-1 text-center">{totals.images ?? "—"}</td>
                  <td className="border-2 border-ink px-2 py-1 text-center">{totals.tests}</td>
                  <td className="border-2 border-ink px-2 py-1 text-center">{totals.correct ?? "—"}</td>
                  <td className="border-2 border-ink px-2 py-1 text-center" data-testid="field-total-accuracy">
                    {percent(totals.accuracy)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {quest.accuracyFormula && <p className="text-sm font-semibold">{quest.accuracyFormula}</p>}
        </section>

        {quest.notes && (
          <section className={section}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-extrabold text-teal-dark">{quest.notes.label}</h3>
              <span className={done(status.notes)}>{quest.notes.label}</span>
            </div>
            <p className="text-xs text-slate">{ui.field.reflectNote}</p>
            {quest.notes.prompts.map((prompt, i) => (
              <label key={prompt} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-ink bg-cream px-2 py-1">
                <input
                  type="checkbox"
                  className="h-6 w-6 shrink-0"
                  checked={field.reflected[i] ?? false}
                  data-testid="field-note"
                  onChange={(event) => update({ reflected: field.reflected.map((value, j) => (j === i ? event.target.checked : value)) })}
                />
                <span className="flex flex-col">
                  <span className="font-semibold">{prompt}</span>
                  <span className="text-xs text-slate">{ui.field.reflect}</span>
                </span>
              </label>
            ))}
          </section>
        )}

        <section className={section}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold text-teal-dark">{topic.sections[2].heading}</h3>
            <span className={done(status.evidence)}>{ui.field.evidence}</span>
          </div>
          <p className="text-sm">{topic.sections[2].body}</p>
          {field.evidence.image ? (
            <div className="flex items-start gap-2">
              <img src={field.evidence.image} alt="" className="max-h-40 rounded border-2 border-ink" data-testid="field-evidence-image" />
              <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => update({ evidence: { ...field.evidence, image: null } })}>
                {ui.field.removeImage}
              </button>
            </div>
          ) : (
            <label className="btn btn-ghost inline-flex cursor-pointer items-center self-start">
              {ui.field.attach}
              <input type="file" accept="image/*" className="hidden" data-testid="field-attach" onChange={(event) => void attach(event.target.files?.[0])} />
            </label>
          )}
          <span className="text-xs text-slate">{ui.field.storage}</span>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-6 w-6 shrink-0" checked={field.evidence.outsideGame} data-testid="field-outside" onChange={(event) => update({ evidence: { ...field.evidence, outsideGame: event.target.checked } })} />
            {ui.field.outsideGame}
          </label>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1" data-testid="field-status" data-complete={status.complete}>
            <span className={done(status.ready)}>{ui.field.statusReady}</span>
            <span className={done(status.checklist)}>{fmt(ui.field.statusChecklist, { n: stepsDone, total: quest.steps.length })}</span>
            <span className={done(status.results)}>{ui.field.statusResults}</span>
            {quest.notes && <span className={done(status.notes)}>{quest.notes.label}</span>}
            <span className={done(status.evidence)}>{ui.field.evidence}</span>
          </div>
          {status.complete && <span className="font-bold text-correct-dark">✓ {ui.field.done}</span>}
          <button type="button" className="btn" onClick={closeOverlay}>
            {ui.field.close}
          </button>
        </div>
      </div>
    </div>
  );
}
