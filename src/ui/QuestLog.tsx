import { setAudioSettings } from "../audio/engine";
import { useAudioSettings } from "../audio/useAudio";
import { course, isFieldRoom, questTitle, ROOM_COUNT, stationsOf } from "../content";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { zoneOfTopic } from "../state/campaign";
import { cloudEnabled, guardianPowerOf, coreCount, creditsOf, difficultyOf, fieldComplete, isRoomUnlocked, isTopicOpen, planOf, roomProgress, startTierOf, useGameStore } from "../state/gameStore";
import { NPC_ACTIVITY_TOTAL, npcActivitiesDone, NPCS } from "../state/npcs";
import { art } from "./art";
import { Stars } from "./Stars";
import { useDialog } from "./useDialog";

/** สมุดเควสและโปรไฟล์: ผู้เล่น ระดับความยาก แกน AI ที่เก็บได้ สมรรถนะที่ผ่าน และขั้นตอนของห้องที่กำลังเล่น */
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
  const battles = useGameStore((s) => s.battles);
  const npcs = useGameStore((s) => s.npcs);
  const outfit = useGameStore((s) => s.shop.outfit);
  const credits = useGameStore(creditsOf);
  const audio = useAudioSettings();
  const run = { profile, progress, battles };
  const power = useGameStore(guardianPowerOf);
  const plan = planOf(run);
  const difficulty = difficultyOf(run);
  // หัวข้อที่แสดงขั้นตอน: หัวข้อที่กำลังทำ หรือหัวข้อแรกที่ยังไม่ได้แกน AI
  const focus = room ?? course.topics.find((topic) => !roomProgress(run, topic.id).core)?.id ?? ROOM_COUNT;
  const p = roomProgress(run, focus);
  const total = stationsOf(focus).length;
  // ด่านต่อสู้ที่ต้องใช้แกน AI ของหัวข้อนี้
  const battle = plan.battles.find((b) => b.requires.includes(focus));
  const battleStep = battle ? [{ done: battles[battle.id]?.won ?? false, text: fmt(ui.questLog.stepBattle, { kaiju: foeName(battle.forms[0].art) }) }] : [];

  const steps = isFieldRoom(focus)
    ? [
        { done: fieldComplete(p), text: ui.questLog.stepField },
        { done: posttest !== null, text: ui.questLog.stepPosttest },
        { done: p.core, text: ui.questLog.stepCertificate },
        ...battleStep,
      ]
    : [
        ...(plan.stations === "required" ? [{ done: p.stationsSeen >= total, text: fmt(ui.questLog.stepStations, { n: p.stationsSeen, total }) }] : []),
        ...(plan.stations === "optional" ? [{ done: p.stationsSeen >= total, text: ui.questLog.stepArchive }] : []),
        { done: p.minigameDone, text: fmt(ui.questLog.stepMinigame, { quest: questTitle(focus) }) },
        ...(plan.review ? [{ done: p.reviewDone, text: ui.questLog.stepReview }] : []),
        { done: p.core, text: ui.questLog.stepCore },
        ...battleStep,
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
            <h3 className="text-xs font-bold text-slate">{ui.questLog.difficulty}</h3>
            <div className="rounded-md border-2 border-ink bg-paper px-3 py-2 text-sm" data-testid="profile-difficulty" data-difficulty={difficulty}>
              <div className="font-extrabold">{ui.difficulty[difficulty].name}</div>
              <div className="text-slate">{ui.difficulty[difficulty].detail}</div>
              <div className="text-xs text-slate">{ui.questLog.difficultyNote}</div>
            </div>
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
            {fmt(ui.questLog.cores, { n: coreCount({ progress }), total: ROOM_COUNT })} · <span data-testid="profile-power" data-power={power}>{fmt(ui.questLog.power, { n: power })}</span>
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
              const open = isRoomUnlocked(run, zoneOfTopic(difficulty, topic.id)) && isTopicOpen(run, topic.id);
              const status = rp.core ? ui.questLog.passed : open ? ui.questLog.statusOpen : ui.questLog.statusLocked;
              return (
                <li key={topic.id} data-passed={rp.core} className="flex items-start gap-2 rounded-md border-2 border-ink bg-paper px-2 py-1 text-sm">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-ink text-xs font-extrabold ${rp.core ? "bg-correct text-ink" : "bg-cream"}`}>
                    {rp.core ? "✓" : topic.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={rp.core ? "font-semibold" : "text-slate"}>{topic.objective}</div>
                    <div className="truncate text-xs text-slate">
                      {topic.title}
                      {pretest && topic.id < ROOM_COUNT && ` · ${fmt(ui.questLog.startTier, { name: ui.tier[startTierOf({ pretest, progress, profile }, topic.id)] })}`}
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

        <section data-testid="questlog-side">
          <h3 className="mb-1 text-xs font-bold text-slate">{fmt(ui.questLog.side, { n: npcActivitiesDone(npcs), total: NPC_ACTIVITY_TOTAL })}</h3>
          <ul className="flex flex-col gap-1">
            {Object.values(NPCS)
              .filter((spec) => spec.role !== "shop")
              .map((spec) => {
                const record = npcs[spec.id];
                const id = spec.id as "mechanic" | "foreman" | "coach" | "director";
                const done = spec.role === "quest" ? Boolean(record?.done) : (record?.tries ?? 0) > 0;
                const started = done || Boolean(record?.accepted);
                const text =
                  spec.role === "quest"
                    ? fmt(ui.questLog.sideQuest, { name: ui.npc[id].name, item: ui.npc[id as "mechanic" | "foreman"].item, n: record?.found.length ?? 0, total: spec.pickups })
                    : fmt(ui.questLog.sideQuiz, { name: ui.npc[id].name, n: record?.best ?? 0, total: spec.questions });
                return (
                  <li key={spec.id} className="flex items-center gap-2 text-sm" data-done={done}>
                    <img src={art.npc(spec.id)} alt="" className="pixelated h-8 w-8 shrink-0" />
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-ink text-sm font-bold ${done ? "bg-correct text-ink" : "bg-paper"}`}>{done ? "✓" : ""}</span>
                    <span className={done ? "text-slate" : "font-semibold"}>{started ? text : `${ui.npc[id].name}: ${ui.questLog.sideOpen}`}</span>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>
    </div>
  );
}
