import { setAudioSettings } from "../audio/engine";
import { useAudioSettings } from "../audio/useAudio";
import { course, isFieldRoom, questTitle, ROOM_COUNT, stationsOf } from "../content";
import { kaijuName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { emptyField, fieldStatus } from "../state/field";
import { cloudEnabled, coreCount, isRoomUnlocked, roomProgress, startTierOf, useGameStore } from "../state/gameStore";
import { MIN_ANSWER_CHARS } from "../state/rules";
import { creditBalance } from "../state/shop";
import { art } from "./art";
import { StylePicker } from "./Onboarding";
import { Stars } from "./Stars";
import { useDialog } from "./useDialog";

/** สมุดเควสและโปรไฟล์: ผู้เล่น สไตล์การเรียน แกน AI ที่เก็บได้ สมรรถนะที่ผ่าน และขั้นตอนของห้องที่กำลังเล่น */
export function QuestLog() {
  const room = useGameStore((s) => s.room);
  const profile = useGameStore((s) => s.profile);
  const pretest = useGameStore((s) => s.pretest);
  const posttest = useGameStore((s) => s.posttest);
  const sync = useGameStore((s) => s.sync);
  const resumeCode = useGameStore((s) => s.resumeCode);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const progress = useGameStore((s) => s.progress);
  const setStyle = useGameStore((s) => s.setStyle);
  const outfit = useGameStore((s) => s.shop.outfit);
  const credits = useGameStore((s) => creditBalance({ rooms: s.progress, posttest: s.posttest }, s.shop));
  const audio = useAudioSettings();
  const focus = room ?? 1;
  const p = roomProgress({ progress }, focus);
  const total = stationsOf(focus).length;

  const steps = isFieldRoom(focus)
    ? [
        { done: fieldStatus(p.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete, text: ui.questLog.stepField },
        { done: posttest !== null, text: ui.questLog.stepPosttest },
        { done: p.core, text: ui.questLog.stepCertificate },
        { done: p.battle.won, text: fmt(ui.questLog.stepBattle, { kaiju: kaijuName(focus) }) },
      ]
    : [
        { done: p.stationsSeen >= total, text: fmt(ui.questLog.stepStations, { n: p.stationsSeen, total }) },
        { done: p.minigameDone, text: fmt(ui.questLog.stepMinigame, { quest: questTitle(focus) }) },
        { done: p.reviewDone, text: ui.questLog.stepReview },
        { done: p.core, text: ui.questLog.stepCore },
        { done: p.battle.won, text: fmt(ui.questLog.stepBattle, { kaiju: kaijuName(focus) }) },
      ];

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="questlog">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.questLog.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">{ui.questLog.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={closeOverlay}>
            {ui.questLog.close}
          </button>
        </div>

        {profile && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <img src={art.player(profile.avatar, outfit)} alt="" className="pixelated h-16 w-16 rounded-md border-2 border-ink bg-teal-light" />
              <div>
                <div className="text-xs font-bold text-slate">{ui.questLog.name}</div>
                <div className="text-xl font-extrabold" data-testid="profile-name">
                  {profile.name}
                </div>
                {profile.classCode && <div className="text-sm font-semibold text-slate">{fmt(ui.questLog.classCode, { code: profile.classCode })}</div>}
                <div className="text-sm font-bold text-teal-dark" data-testid="profile-credits">
                  {fmt(ui.questLog.credits, { n: credits })}
                </div>
              </div>
            </div>
            {cloudEnabled() && profile.classCode && (
              <div className="rounded-md border-2 border-ink bg-paper px-3 py-2 text-sm" data-testid="sync" data-status={sync}>
                <div className="font-semibold" role="status">
                  {ui.questLog.sync[sync]}
                </div>
                {resumeCode && (
                  <div className="mt-1">
                    {ui.questLog.resumeCode}: <span className="select-text font-mono text-lg font-extrabold tracking-widest" data-testid="resume-code">{resumeCode}</span>
                  </div>
                )}
              </div>
            )}
            <h3 className="text-xs font-bold text-slate">{ui.questLog.style}</h3>
            <StylePicker value={profile.style} onChange={setStyle} />
            <h3 className="text-xs font-bold text-slate">{ui.sound.title}</h3>
            <div className="flex flex-wrap gap-2">
              {(["music", "sfx"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="switch"
                  aria-checked={audio[kind]}
                  data-testid={`sound-${kind}`}
                  onClick={() => setAudioSettings({ [kind]: !audio[kind] })}
                  className={`min-h-10 rounded-lg border-[3px] border-ink px-3 font-bold ${audio[kind] ? "bg-hint" : "bg-paper"}`}
                >
                  {kind === "music" ? ui.sound.music : ui.sound.effects}: {audio[kind] ? ui.sound.on : ui.sound.off}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate" data-testid="profile-cores">
            {fmt(ui.questLog.cores, { n: coreCount({ progress }), total: ROOM_COUNT })}
          </h3>
          <div className="flex flex-wrap gap-2">
            {course.topics.map((topic) => {
              const collected = roomProgress({ progress }, topic.id).core;
              return (
                <div
                  key={topic.id}
                  data-collected={collected}
                  title={topic.title}
                  className={`flex h-14 w-14 items-center justify-center rounded-lg border-[3px] ${collected ? "border-ink bg-teal-light" : "border-dashed border-steel bg-paper text-slate"}`}
                >
                  {collected ? <img src={`assets/cores/core_${topic.id}.png`} alt="" className="pixelated h-10 w-10" /> : <span className="text-lg font-extrabold">{topic.id}</span>}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{ui.questLog.competencies}</h3>
          <ul className="flex flex-col gap-1">
            {course.topics.map((topic) => {
              const rp = roomProgress({ progress }, topic.id);
              const status = rp.core ? ui.questLog.passed : isRoomUnlocked({ progress }, topic.id) ? ui.questLog.statusOpen : ui.questLog.statusLocked;
              return (
                <li key={topic.id} data-passed={rp.core} className="flex items-start gap-2 rounded-md border-2 border-ink bg-paper px-2 py-1 text-sm">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-ink text-xs font-extrabold ${rp.core ? "bg-correct text-ink" : "bg-cream"}`}>
                    {rp.core ? "✓" : topic.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={rp.core ? "font-semibold" : "text-slate"}>{topic.objective}</div>
                    <div className="truncate text-xs text-slate">
                      {topic.title}
                      {pretest && topic.id < ROOM_COUNT && ` · ${fmt(ui.questLog.startTier, { name: ui.tier[startTierOf({ pretest, progress }, topic.id)] })}`}
                    </div>
                  </div>
                  {rp.stars > 0 && <Stars count={rp.stars} />}
                  <span className={`shrink-0 rounded px-1.5 text-xs font-bold ${rp.core ? "bg-correct text-ink" : "bg-mist"}`}>{status}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold text-slate">{fmt(ui.questLog.steps, { n: focus })}</h3>
          <ul className="flex flex-col gap-1">
            {steps.map((step) => (
              <li key={step.text} className="flex items-center gap-2" data-done={step.done}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-ink text-sm font-bold ${step.done ? "bg-correct text-ink" : "bg-paper"}`}>
                  {step.done ? "✓" : ""}
                </span>
                <span className={step.done ? "text-slate line-through" : "font-semibold"}>{step.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
