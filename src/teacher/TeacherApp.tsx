import { useMemo, useState } from "react";
import { course } from "../content";
import { buildAssessment, seededRng } from "../content/choices";
import { fmt } from "../content/ui-strings";
import { CLASS_CODE_PATTERN, LocalProgressStore, normalizeClassCode } from "../state/progressStore";
import { answersCsv, itemsCsv, type Player, type PlayerRecord, studentsCsv, summarizeGain, summarizeRooms, summarizeStudent, type StudentSummary, toPlayers, writtenAnswers } from "./analytics";
import { t } from "./strings";

type Tab = keyof typeof t.tabs;
interface Session {
  password: string;
  /** ตัวอย่างจากข้อมูลในเครื่องนี้ ไม่ได้มาจากฐานข้อมูลกลาง */
  demo: boolean;
  players: Player[];
  loadedAt: Date;
}

async function callTeacherApi(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const response = await fetch("/api/teacher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return { ok: true, data };
    return { ok: false, reason: typeof data.error === "string" ? data.error : `http_${response.status}` };
  } catch {
    return { ok: false, reason: "network" };
  }
}

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const minutes = (ms: number | null): string => (ms === null ? "—" : (ms / 60000).toFixed(1));
const number = (value: number | null, digits = 1): string => (value === null ? "—" : value.toFixed(digits));
const percent = (share: number | null): string => (share === null ? "—" : `${Math.round(share * 100)}%`);
const signed = (value: number | null, digits = 1): string => (value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}`);
const th = "border border-slate bg-teal-light px-2 py-1.5 text-left align-bottom font-bold";
const td = "border border-slate px-2 py-1.5 align-top";

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canDemo, setCanDemo] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await callTeacherApi({ password });
    setBusy(false);
    if (result.ok) return onLogin({ password, demo: false, players: toPlayers((result.data.players ?? []) as PlayerRecord[]), loadedAt: new Date() });
    const known = result.reason in t.login ? t.login[result.reason as "wrong_password" | "not_configured" | "no_database"] : fmt(t.login.failed, { reason: result.reason });
    setCanDemo(result.reason === "not_configured" || result.reason === "no_database");
    setError(known);
  };

  const demo = async () => {
    const save = await new LocalProgressStore(window.localStorage).load();
    if (!save?.profile) return setError(t.login.demoEmpty);
    onLogin({ password: "", demo: true, players: [{ id: "local", classCode: save.profile.classCode, name: save.profile.name, save, resumeCode: null, updatedAt: save.updatedAt, archived: false }], loadedAt: new Date() });
  };

  return (
    <form
      className="mx-auto mt-10 flex max-w-sm flex-col gap-3 rounded-lg border-[3px] border-ink bg-cream p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1 className="text-2xl font-extrabold text-teal-dark">{t.title}</h1>
      <label className="flex flex-col gap-1 font-semibold">
        {t.login.password}
        <input type="password" value={password} autoComplete="current-password" autoFocus data-testid="teacher-password" onChange={(event) => setPassword(event.target.value)} className="rounded-md border-2 border-ink bg-paper p-2 text-base font-normal" />
      </label>
      {error && (
        <p className="text-sm font-semibold text-wrong" role="alert" data-testid="teacher-error">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy || !password} data-testid="teacher-login">
        {busy ? t.login.loading : t.login.submit}
      </button>
      {canDemo && (
        <button type="button" className="btn btn-ghost" data-testid="teacher-demo" onClick={() => void demo()}>
          {t.login.demo}
        </button>
      )}
      <a href="/" className="py-1 text-center text-sm font-semibold text-teal-dark underline">
        {t.login.game}
      </a>
    </form>
  );
}

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border-2 border-ink bg-cream px-3 py-2">
      <div className="text-sm font-semibold text-slate">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {note && <div className="text-xs text-slate">{note}</div>}
    </div>
  );
}

type SortKey = "name" | "difficulty" | "roomReached" | "cores" | "stars" | "reviewsDone" | "battlesWon" | "fieldAccuracy" | "pre" | "post" | "gain" | "tutorAi" | "timeMs" | "updatedAt";

function StudentsTable({ players }: { players: Player[] }) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "name", descending: false });
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const list = players.map((player) => ({ player, summary: summarizeStudent(player) }));
    const value = (s: StudentSummary) => s[sort.key];
    return list.sort((a, b) => {
      const x = value(a.summary);
      const y = value(b.summary);
      // ค่าว่างอยู่ท้ายเสมอ
      const order = x === null ? (y === null ? 0 : 1) : y === null ? -1 : typeof x === "string" ? x.localeCompare(y as string, "th", { numeric: true }) * (sort.descending ? -1 : 1) : ((x as number) - (y as number)) * (sort.descending ? -1 : 1);
      return order || a.summary.name.localeCompare(b.summary.name, "th", { numeric: true });
    });
  }, [players, sort]);

  const head = (key: SortKey, label: string) => (
    <th className={th} aria-sort={sort.key === key ? (sort.descending ? "descending" : "ascending") : "none"}>
      <button type="button" className="min-h-7 font-bold underline decoration-dotted" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key !== "name" })}>
        {label}
        {sort.key === key ? (sort.descending ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );

  if (players.length === 0) return <p className="rounded-md border-2 border-dashed border-slate p-4 text-slate">{t.students.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] border-collapse text-sm" data-testid="teacher-students">
        <caption className="mb-1 text-left text-xs text-slate">{t.students.sortHint}</caption>
        <thead>
          <tr>
            {head("name", t.students.name)}
            <th className={th}>{t.students.classCode}</th>
            {head("difficulty", t.students.difficulty)}
            {head("roomReached", t.students.room)}
            {head("cores", t.students.cores)}
            {head("stars", t.students.stars)}
            {head("reviewsDone", t.students.review)}
            {head("battlesWon", t.students.battles)}
            {head("fieldAccuracy", t.students.accuracy)}
            {head("pre", t.students.pre)}
            {head("post", t.students.post)}
            {head("gain", t.students.gain)}
            {head("tutorAi", t.students.tutor)}
            {head("timeMs", t.students.time)}
            {head("updatedAt", t.students.updated)}
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, summary: s }) => (
            <StudentRow key={s.id} player={player} summary={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentRow({ player, summary: s, open, onToggle }: { player: Player; summary: StudentSummary; open: boolean; onToggle: () => void }) {
  const answers = open ? writtenAnswers(player.save) : [];
  return (
    <>
      <tr className={s.archived ? "bg-mist/40" : "bg-paper"} data-testid="teacher-student" data-name={s.name}>
        <th scope="row" className={`${td} text-left font-bold`}>
          {s.name}
          {s.archived && <span className="ml-1 rounded bg-slate px-1 text-xs font-semibold text-paper">{t.students.archived}</span>}
        </th>
        <td className={td}>{s.classCode}</td>
        <td className={td} data-testid="teacher-difficulty">
          {t.students.difficultyNames[s.difficulty]}
        </td>
        <td className={td}>{s.roomReached || "—"}</td>
        <td className={td}>
          {s.cores}/{course.topics.length}
        </td>
        <td className={td}>
          {s.stars}/{s.starsMax}
        </td>
        <td className={td}>
          {s.reviewsTotal === 0 ? "—" : `${s.reviewsDone}/${s.reviewsTotal}`}
        </td>
        <td className={td}>
          {s.battlesWon}/{s.battlesTotal}
        </td>
        <td className={td} data-testid="teacher-accuracy">
          {s.fieldAccuracy === null ? "—" : `${s.fieldAccuracy}%`}
          {s.fieldAccuracy !== null && !s.fieldDone && <span className="ml-1 text-xs text-slate">({t.students.fieldPending})</span>}
        </td>
        <td className={td}>{s.pre === null ? "—" : `${s.pre}/${s.assessmentMax}`}</td>
        <td className={td}>{s.post === null ? "—" : `${s.post}/${s.assessmentMax}`}</td>
        <td className={`${td} font-bold`} data-testid="teacher-gain">
          {signed(s.gain, 0)}
        </td>
        <td className={td}>
          {s.tutorAi} / {s.tutorHints}
        </td>
        <td className={td}>{minutes(s.timeMs)}</td>
        <td className={`${td} whitespace-nowrap`}>{new Date(s.updatedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
        <td className={td}>
          <button type="button" className="min-h-7 min-w-7 font-bold text-teal-dark underline" aria-expanded={open} data-testid="teacher-details" onClick={onToggle}>
            {open ? t.students.hide : t.students.details}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-cream">
          <td className={td} colSpan={16}>
            {s.resumeCode && (
              <p className="mb-2 text-sm">
                {t.students.resumeCode}: <span className="font-mono font-bold tracking-widest">{s.resumeCode}</span>
              </p>
            )}
            <h3 className="font-bold">{t.students.answers}</h3>
            {answers.length === 0 ? (
              <p className="text-slate">{t.students.noAnswers}</p>
            ) : (
              <dl className="mt-1 flex flex-col gap-2" data-testid="teacher-answers">
                {answers.map((answer, i) => (
                  <div key={i}>
                    <dt className="font-semibold text-slate">
                      {fmt(t.students.roomLabel, { n: answer.room })} · {answer.question}
                      {answer.label && ` — ${answer.label}`}
                    </dt>
                    <dd className="whitespace-pre-wrap">{answer.answer}</dd>
                  </div>
                ))}
              </dl>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RoomsTable({ players }: { players: Player[] }) {
  const rooms = useMemo(() => summarizeRooms(players), [players]);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm" data-testid="teacher-rooms">
          <thead>
            <tr>
              {[t.rooms.room, t.rooms.entered, t.rooms.finished, t.rooms.time, t.rooms.stars, t.rooms.tutorAi, t.rooms.tutorHints, t.rooms.repairs].map((label) => (
                <th key={label} className={th}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.room} className="bg-paper">
                <th scope="row" className={`${td} text-left`}>
                  {room.room}. {room.title}
                </th>
                <td className={td}>{room.entered}</td>
                <td className={td}>{room.finished}</td>
                <td className={td}>{minutes(room.averageTimeMs)}</td>
                <td className={td}>{number(room.averageStars)}</td>
                <td className={td}>{room.tutorAi}</td>
                <td className={td}>{room.tutorHints}</td>
                <td className={td}>{room.forcedRepairs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate">{t.rooms.note}</p>
      <h3 className="font-extrabold text-teal-dark">{t.rooms.missed}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {rooms
          .filter((room) => room.room < course.topics.length)
          .map((room) => (
            <section key={room.room} className="rounded-lg border-2 border-ink bg-cream p-3" data-testid="teacher-missed">
              <h4 className="font-bold">
                {room.room}. {room.title}
              </h4>
              {room.missed.length === 0 ? (
                <p className="text-sm text-slate">{t.rooms.noMissed}</p>
              ) : (
                <ol className="mt-1 list-decimal pl-5 text-sm">
                  {room.missed.map((entry) => (
                    <li key={entry.label}>
                      {entry.label} <span className="whitespace-nowrap font-semibold text-slate">({fmt(t.rooms.missedCount, entry)})</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}

/** ข้อความของแต่ละข้อจาก course.json ให้ครูรู้ว่าข้อนั้นถามอะไร */
const itemTexts = (): Map<string, string> => {
  const texts = new Map<string, string>();
  for (const form of ["A", "B"] as const) for (const item of buildAssessment(form, seededRng(1))) texts.set(item.id as string, item.card || [...item.options].sort((a, b) => a.localeCompare(b, "th")).join(" / "));
  return texts;
};

function GainTables({ players }: { players: Player[] }) {
  const gain = useMemo(() => summarizeGain(players), [players]);
  const texts = useMemo(itemTexts, []);
  if (gain.pretested === 0) return <p className="rounded-md border-2 border-dashed border-slate p-4 text-slate">{t.gain.noData}</p>;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-extrabold text-teal-dark">{t.gain.byTopic}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm" data-testid="teacher-gain-topics">
          <thead>
            <tr>
              {[t.gain.topic, t.gain.n, t.gain.pre, t.gain.post, t.gain.gain].map((label) => (
                <th key={label} className={th}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gain.byTopic.map((row) => (
              <tr key={row.topic} className="bg-paper">
                <th scope="row" className={`${td} text-left font-semibold`}>
                  {row.topic}. {row.objective}
                </th>
                <td className={td}>{row.paired}</td>
                <td className={td}>
                  {number(row.pre, 2)}/{row.max}
                </td>
                <td className={td}>
                  {number(row.post, 2)}/{row.max}
                </td>
                <td className={`${td} font-bold`}>{signed(row.gain, 2)}</td>
              </tr>
            ))}
            <tr className="bg-teal-light font-extrabold">
              <th scope="row" className={`${td} text-left`}>
                {t.gain.total}
              </th>
              <td className={td}>{gain.paired}</td>
              <td className={td}>
                {number(gain.pre, 2)}/{gain.max}
              </td>
              <td className={td}>
                {number(gain.post, 2)}/{gain.max}
              </td>
              <td className={td}>{signed(gain.gain, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 className="font-extrabold text-teal-dark">{t.gain.byItem}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm" data-testid="teacher-gain-items">
          <thead>
            <tr>
              {[t.gain.item, t.gain.form, t.gain.topic, t.gain.content, t.gain.preShare, t.gain.postShare, t.gain.difference].map((label) => (
                <th key={label} className={th}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gain.items.map((item) => (
              <tr key={item.id} className="bg-paper">
                <th scope="row" className={`${td} text-left`}>
                  {item.id}
                </th>
                <td className={td}>{item.form}</td>
                <td className={td}>{item.topic}</td>
                <td className={td}>{texts.get(item.id)}</td>
                <td className={td}>
                  {percent(item.preCorrect)} <span className="text-xs text-slate">(n={item.preN})</span>
                </td>
                <td className={td}>
                  {percent(item.postCorrect)} <span className="text-xs text-slate">(n={item.postN})</span>
                </td>
                <td className={`${td} font-bold`}>{item.difference === null ? "—" : `${item.difference > 0 ? "+" : ""}${Math.round(item.difference * 100)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate">{t.gain.note}</p>
    </div>
  );
}

function Dashboard({ session, onSession }: { session: Session; onSession: (session: Session | null) => void }) {
  const [tab, setTab] = useState<Tab>("students");
  const [classCode, setClassCode] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(session.demo ? t.login.demoNote : null);

  const classes = useMemo(() => [...new Set(session.players.map((player) => player.classCode).filter(Boolean))].sort(), [session.players]);
  const players = useMemo(
    () => session.players.filter((player) => (classCode === "" || player.classCode === classCode) && (showArchived || !player.archived)),
    [session.players, classCode, showArchived],
  );
  const summaries = useMemo(() => players.map(summarizeStudent), [players]);
  const gain = useMemo(() => summarizeGain(players), [players]);
  const accuracies = summaries.map((s) => s.fieldAccuracy).filter((value) => value !== null);
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = `${classCode || "all"}-${stamp}`;

  const refresh = async () => {
    if (session.demo) return;
    setBusy(true);
    const result = await callTeacherApi({ password: session.password });
    setBusy(false);
    if (result.ok) onSession({ ...session, players: toPlayers((result.data.players ?? []) as PlayerRecord[]), loadedAt: new Date() });
    else setNotice(fmt(t.login.failed, { reason: result.reason }));
  };

  const deleteClass = async () => {
    const code = classCode;
    const count = session.players.filter((player) => player.classCode === code).length;
    if (!CLASS_CODE_PATTERN.test(code) || normalizeClassCode(window.prompt(fmt(t.toolbar.deletePrompt, { code, n: count })) ?? "") !== code) return;
    setBusy(true);
    const result = await callTeacherApi({ password: session.password, classCode: code, action: "delete-class" });
    setBusy(false);
    if (!result.ok) return setNotice(fmt(t.login.failed, { reason: result.reason }));
    setClassCode("");
    setNotice(fmt(t.toolbar.deleted, { n: Number(result.data.deleted ?? 0) }));
    await refresh();
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-3 sm:p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold text-teal-dark">
          {t.title} <span className="text-base font-semibold text-slate">{t.subtitle}</span>
        </h1>
        <span className="text-sm text-slate">{fmt(t.toolbar.loadedAt, { time: session.loadedAt.toLocaleTimeString("th-TH") })}</span>
        {!session.demo && (
          <button type="button" className="btn btn-ghost !min-h-10 text-sm" disabled={busy} data-testid="teacher-refresh" onClick={() => void refresh()}>
            {busy ? t.login.loading : t.toolbar.refresh}
          </button>
        )}
        <button type="button" className="btn btn-ghost !min-h-10 text-sm" onClick={() => onSession(null)}>
          {t.toolbar.logout}
        </button>
      </header>

      {notice && (
        <p className="rounded-md border-2 border-ink bg-hint px-3 py-2 text-sm font-semibold" role="status" data-testid="teacher-notice">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          {t.toolbar.classFilter}
          <select value={classCode} data-testid="teacher-class" onChange={(event) => setClassCode(event.target.value)} className="rounded-md border-2 border-ink bg-paper p-2 text-base">
            <option value="">{t.toolbar.allClasses}</option>
            {classes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" className="h-6 w-6" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          {t.toolbar.showArchived}
        </label>
        {!session.demo && classCode && (
          <button type="button" className="ml-auto rounded-md border-2 border-wrong px-3 py-2 font-bold text-wrong hover:bg-wrong hover:text-paper" disabled={busy} data-testid="teacher-delete" onClick={() => void deleteClass()}>
            {t.toolbar.deleteClass}
          </button>
        )}
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7" data-testid="teacher-cards">
        <Card label={t.cards.students} value={String(players.length)} />
        <Card label={t.cards.finished} value={String(summaries.filter((s) => s.fieldDone).length)} />
        <Card label={t.cards.pre} value={gain.pre === null ? "—" : `${number(gain.pre)}/${gain.max}`} note={fmt(t.cards.paired, { n: gain.paired })} />
        <Card label={t.cards.post} value={gain.post === null ? "—" : `${number(gain.post)}/${gain.max}`} />
        <Card label={t.cards.gain} value={signed(gain.gain)} note={gain.normalizedGain === null ? undefined : `${t.cards.normalized} ${number(gain.normalizedGain, 2)}`} />
        <Card label={t.cards.accuracy} value={accuracies.length === 0 ? "—" : `${number(accuracies.reduce((sum, n) => sum + n, 0) / accuracies.length)}%`} />
        <Card label={t.cards.tutor} value={`${summaries.reduce((sum, s) => sum + s.tutorAi, 0)} / ${summaries.reduce((sum, s) => sum + s.tutorHints, 0)}`} />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="mr-auto flex flex-wrap gap-2">
          {(Object.keys(t.tabs) as Tab[]).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} data-testid={`teacher-tab-${key}`} onClick={() => setTab(key)} className={`btn !min-h-10 text-sm ${tab === key ? "" : "btn-ghost"}`}>
              {t.tabs[key]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost !min-h-10 text-sm" data-testid="teacher-export-students" onClick={() => downloadCsv(`students-${suffix}.csv`, studentsCsv(players, { fixed: t.csv.students, pre: t.csv.pre, post: t.csv.post, stars: t.csv.stars, minutes: t.csv.minutes }))}>
          {t.export.students}
        </button>
        <button type="button" className="btn btn-ghost !min-h-10 text-sm" data-testid="teacher-export-answers" onClick={() => downloadCsv(`answers-${suffix}.csv`, answersCsv(players, t.csv.answers))}>
          {t.export.answers}
        </button>
        <button type="button" className="btn btn-ghost !min-h-10 text-sm" data-testid="teacher-export-items" onClick={() => downloadCsv(`items-${suffix}.csv`, itemsCsv(gain, t.csv.items))}>
          {t.export.items}
        </button>
      </div>

      <div role="tabpanel">
        {tab === "students" && <StudentsTable players={players} />}
        {tab === "rooms" && <RoomsTable players={players} />}
        {tab === "gain" && <GainTables players={players} />}
      </div>
    </div>
  );
}

/** หน้า /teacher: ครูใส่รหัสผ่าน แล้วดูความคืบหน้าของผู้เรียนทั้งห้อง ข้อมูลอ่านผ่าน /api/teacher เท่านั้น */
export function TeacherApp() {
  // รหัสผ่านอยู่ในหน่วยความจำของหน้านี้เท่านั้น โหลดหน้าใหม่ต้องใส่อีกครั้ง
  const [session, setSession] = useState<Session | null>(null);
  return (
    <main className="min-h-full select-text bg-paper text-ink" data-testid="teacher">
      {session ? <Dashboard session={session} onSession={setSession} /> : <Login onLogin={setSession} />}
    </main>
  );
}
