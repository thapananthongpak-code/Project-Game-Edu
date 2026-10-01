import { useState } from "react";
import { course } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { claimProgress, cloudEnabled, hasSave as hasSaveData, startNewGame, useGameStore } from "../state/gameStore";

/** เล่นต่อจากเครื่องอื่น: ใส่รหัสเล่นต่อที่แสดงในสมุดเควสของเครื่องเดิม */
function ResumeForm({ onClose }: { onClose: () => void }) {
  const continueGame = useGameStore((s) => s.continueGame);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await claimProgress(code.trim().toUpperCase())) continueGame();
      else setError(ui.menu.resumeWrong);
    } catch {
      setError(ui.menu.resumeOffline);
    }
    setBusy(false);
  };

  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded-md border-2 border-ink bg-paper p-3 text-left"
      data-testid="resume-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {ui.menu.resumePrompt}
        <input
          value={code}
          maxLength={10}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          data-testid="resume-input"
          onChange={(event) => setCode(event.target.value)}
          className="select-text rounded-md border-2 border-ink bg-cream p-2 text-center font-mono text-lg uppercase tracking-widest"
        />
      </label>
      {error && (
        <p className="text-sm font-semibold text-wrong" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost !min-h-10 text-sm" onClick={onClose}>
          {ui.menu.cancel}
        </button>
        <button type="submit" className="btn !min-h-10 text-sm" disabled={busy || code.trim().length < 10} data-testid="resume-submit">
          {ui.menu.resumeGo}
        </button>
      </div>
    </form>
  );
}

/**
 * ยืนยันก่อนเริ่มเกมใหม่เมื่อเครื่องนี้มีความคืบหน้าอยู่แล้ว
 * เครื่องที่ใช้ร่วมกันและซิงก์กับฐานข้อมูลกลาง: แยก "ผู้เล่นใหม่" (ข้อมูลของคนเดิมยังอยู่) ออกจาก "คนเดิมเริ่มใหม่ทั้งหมด"
 */
function ResetConfirm({ name, shared, onClose }: { name: string; shared: boolean; onClose: () => void }) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border-2 border-ink bg-paper p-3 text-left" role="alertdialog" aria-label={fmt(ui.menu.resetTitle, { name })} data-testid="reset-confirm">
      <p className="font-bold">{fmt(ui.menu.resetTitle, { name })}</p>
      <p className="text-sm">{shared ? fmt(ui.menu.resetCloud, { name }) : ui.menu.resetLocal}</p>
      {shared && (
        <button type="button" className="btn" autoFocus data-testid="reset-switch" onClick={() => startNewGame("switch")}>
          {fmt(ui.menu.resetSwitch, { name })}
        </button>
      )}
      <button type="button" className="btn btn-ghost" data-testid="reset-restart" onClick={() => startNewGame("restart")}>
        {shared ? fmt(ui.menu.resetRestart, { name }) : ui.menu.resetConfirm}
      </button>
      <button type="button" className="btn btn-ghost" autoFocus={!shared} onClick={onClose}>
        {ui.menu.cancel}
      </button>
    </div>
  );
}

export function MainMenu() {
  const ready = useGameStore((s) => s.ready && s.hydrated);
  const hasSave = useGameStore(hasSaveData);
  const profile = useGameStore((s) => s.profile);
  const continueGame = useGameStore((s) => s.continueGame);
  const [panel, setPanel] = useState<null | "resume" | "reset">(null);
  const name = profile?.name ?? "";

  const startNew = () => {
    if (hasSave) setPanel("reset");
    else startNewGame("restart");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-ink/80 p-4">
      <div className="panel w-full max-w-md p-6 text-center">
        <img src="assets/characters/ch_mentor_south.png" alt="" className="pixelated mx-auto h-24 w-24" />
        <h1 className="mt-2 text-3xl font-extrabold text-teal-dark">{ui.gameTitle}</h1>
        <p className="mt-1 font-semibold text-slate">{ui.menu.tagline}</p>
        {course.course && (
          <p className="mt-3 text-sm text-slate">
            {course.course.code} {course.course.title}
            <br />
            {course.course.unit}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-3">
          {hasSave && (
            <button type="button" className="btn" disabled={!ready} data-testid="menu-continue" onClick={continueGame}>
              {!ready ? ui.menu.loading : name ? fmt(ui.menu.continueAs, { name }) : ui.menu.continue}
            </button>
          )}
          <button type="button" className={hasSave ? "btn btn-ghost" : "btn"} disabled={!ready} data-testid="menu-new" onClick={startNew}>
            {ready || hasSave ? ui.menu.newGame : ui.menu.loading}
          </button>
          {ready && cloudEnabled() && panel !== "resume" && (
            <button type="button" className="btn btn-ghost" data-testid="menu-resume" onClick={() => setPanel("resume")}>
              {ui.menu.resume}
            </button>
          )}
        </div>
        {panel === "resume" && <ResumeForm onClose={() => setPanel(null)} />}
        {panel === "reset" && <ResetConfirm name={name || ui.questLog.name} shared={cloudEnabled() && Boolean(profile?.classCode)} onClose={() => setPanel(null)} />}
        <p className="mt-4 text-xs text-slate">{ui.menu.prototype}</p>
      </div>
    </div>
  );
}
