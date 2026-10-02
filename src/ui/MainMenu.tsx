import { useState } from "react";
import { setAudioSettings } from "../audio/engine";
import { useAudioSettings } from "../audio/useAudio";
import { course } from "../content";
import { fmt, ui } from "../content/ui-strings";
import { claimProgress, cloudEnabled, googleLoginEnabled, googleNotice, hasSave as hasSaveData, signInWithGoogle, signOutAccount, startNewGame, useGameStore } from "../state/gameStore";
import { art } from "./art";

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

/** เข้าสู่ระบบด้วย Google (ทางเลือก): เล่นต่อได้จากทุกเครื่องโดยไม่ต้องจดรหัสเล่นต่อ */
function GoogleAccount() {
  const account = useGameStore((s) => s.account);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(googleNotice() === "failed");
  const inUse = googleNotice() === "in-use";

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-md border-2 border-ink bg-paper p-3 text-left text-sm" data-testid="google-account" data-provider={account?.provider ?? "none"}>
      {account?.provider === "google" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-all font-semibold" data-testid="google-email">
            {fmt(ui.menu.googleAccount, { email: account.email ?? "" })}
          </span>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" disabled={busy} data-testid="google-signout" onClick={run(signOutAccount)}>
            {ui.menu.googleSignOut}
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-ghost w-full" disabled={busy} data-testid="google-signin" onClick={run(signInWithGoogle)}>
            {ui.menu.google}
          </button>
          <p className="mt-2 text-slate">{ui.menu.googleNote}</p>
        </>
      )}
      {(inUse || failed) && (
        <p className="mt-2 font-semibold text-wrong" role="alert" data-testid="google-notice">
          {inUse ? ui.menu.googleInUse : ui.menu.googleFailed}
        </p>
      )}
    </div>
  );
}

export function MainMenu() {
  const ready = useGameStore((s) => s.ready && s.hydrated);
  const hasSave = useGameStore(hasSaveData);
  const profile = useGameStore((s) => s.profile);
  const continueGame = useGameStore((s) => s.continueGame);
  const account = useGameStore((s) => s.account);
  const audio = useAudioSettings();
  const [panel, setPanel] = useState<null | "resume" | "reset">(null);
  const name = profile?.name ?? "";
  const soundOn = audio.music || audio.sfx;

  const startNew = () => {
    if (hasSave) setPanel("reset");
    else startNewGame("restart");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-ink/80 p-4">
      <div className="panel w-full max-w-md p-6 text-center">
        <div className="flex items-end justify-center gap-1">
          <img src={art.player("a", "lab")} alt="" className="pixelated h-20 w-20" />
          <img src={art.mentor} alt="" className="pixelated h-24 w-24" />
          <img src={art.player("b", "lab")} alt="" className="pixelated h-20 w-20" />
        </div>
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
        {panel === "reset" && <ResetConfirm name={name || ui.questLog.name} shared={cloudEnabled() && (Boolean(profile?.classCode) || account?.provider === "google")} onClose={() => setPanel(null)} />}
        {ready && googleLoginEnabled() && <GoogleAccount />}
        <button
          type="button"
          className="btn btn-ghost mt-3 !min-h-10 text-sm"
          aria-pressed={soundOn}
          data-testid="menu-sound"
          onClick={() => setAudioSettings({ music: !soundOn, sfx: !soundOn })}
        >
          <span aria-hidden="true">{soundOn ? "🔊" : "🔇"}</span> {soundOn ? ui.hud.soundOn : ui.hud.soundOff}
        </button>
        <p className="mt-4 text-xs text-slate">{ui.menu.prototype}</p>
      </div>
    </div>
  );
}
