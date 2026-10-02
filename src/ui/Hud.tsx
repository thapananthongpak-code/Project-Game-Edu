import { setAudioSettings } from "../audio/engine";
import { useAudioSettings } from "../audio/useAudio";
import { course, isFieldRoom, questTitle, ROOM_COUNT, stationsOf, topicOf } from "../content";
import { kaijuName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { emptyField, fieldStatus } from "../state/field";
import { allBattlesWon, coreCount, pendingBattle, roomProgress, useGameStore } from "../state/gameStore";
import { MIN_ANSWER_CHARS } from "../state/rules";
import { creditBalance } from "../state/shop";

/** เป้าหมายถัดไปของผู้เล่น ตามลำดับการเล่นของห้อง (GDD ข้อ 4.1) และด่านต่อสู้ (GDD ข้อ 12) */
function useObjective(): string {
  const room = useGameStore((s) => s.room);
  const screen = useGameStore((s) => s.screen);
  const progress = useGameStore((s) => s.progress);
  if (room === null) {
    const battle = pendingBattle({ progress });
    if (screen === "hangar") {
      if (battle !== null) return fmt(ui.objective.hangarBattle, { kaiju: kaijuName(battle) });
      return allBattlesWon({ progress }) ? ui.objective.hangarDone : ui.objective.hangarIdle;
    }
    if (battle !== null) return fmt(ui.objective.hallBattle, { kaiju: kaijuName(battle) });
    // ห้องถัดไปบนเส้นทาง 1→6 คือห้องแรกที่ยังไม่มีแกน AI
    const next = course.topics.find((topic) => !roomProgress({ progress }, topic.id).core);
    return next ? fmt(ui.objective.hall, { n: next.id }) : fmt(ui.objective.hallDone, { n: ROOM_COUNT });
  }
  const p = roomProgress({ progress }, room);
  const kaiju = kaijuName(room);
  if (isFieldRoom(room)) {
    if (p.core) return p.battle.won ? ui.objective.fieldDone : fmt(ui.objective.fieldBattle, { kaiju });
    return fieldStatus(p.field ?? emptyField(course.finalQuest), course.finalQuest, MIN_ANSWER_CHARS).complete ? ui.objective.fieldCore : ui.objective.field;
  }
  const total = stationsOf(room).length;
  if (p.stationsSeen < total) return fmt(ui.objective.station, { n: p.stationsSeen + 1, total });
  if (!p.minigameDone) return fmt(ui.objective.minigame, { quest: questTitle(room) });
  if (!p.reviewDone) return ui.objective.review;
  if (!p.core) return ui.objective.core;
  return p.battle.won ? ui.objective.done : fmt(ui.objective.battle, { kaiju });
}

export function Hud() {
  const room = useGameStore((s) => s.room);
  const screen = useGameStore((s) => s.screen);
  const cores = useGameStore(coreCount);
  const credits = useGameStore((s) => creditBalance({ rooms: s.progress, posttest: s.posttest }, s.shop));
  const openOverlay = useGameStore((s) => s.openOverlay);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const toMenu = useGameStore((s) => s.toMenu);
  const objective = useObjective();
  const audio = useAudioSettings();
  const topic = room === null ? null : topicOf(room);
  const soundOn = audio.music || audio.sfx;

  // เอาโฟกัสออกจากปุ่มหลังกด ไม่ให้ Space/Enter ที่ใช้โต้ตอบในเกมไปกดปุ่มซ้ำ
  const press = (run: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    run();
  };

  return (
    <header className="z-10 flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-cream px-2 py-1 text-sm sm:gap-3 sm:px-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-extrabold text-teal-dark">{topic ? fmt(ui.hud.room, { n: room as number }) : screen === "hangar" ? ui.hud.hangar : ui.hud.hall}</span>
          {topic && <span className="truncate font-semibold">{topic.title}</span>}
          {topic && <span className="hidden shrink-0 text-xs text-slate md:inline">{fmt(ui.hud.minutes, { n: topic.minutes })}</span>}
        </div>
        <div className="truncate text-xs text-slate" data-testid="objective">
          ▸ {objective}
        </div>
      </div>
      <span className="hidden shrink-0 rounded-md border-2 border-ink bg-hint px-2 py-0.5 text-xs font-bold min-[520px]:inline" data-testid="credits" data-credits={credits}>
        {fmt(ui.hud.credits, { n: credits })}
      </span>
      <span className="hidden shrink-0 rounded-md border-2 border-ink bg-teal-light px-2 py-0.5 text-xs font-bold min-[420px]:inline" data-testid="cores">
        {fmt(ui.hud.cores, { n: cores, total: ROOM_COUNT })}
      </span>
      {topic && (
        <button type="button" className="btn !min-h-9 shrink-0 !px-2 text-xs" data-testid="hud-tutor" onClick={press(() => setTutorOpen(true))}>
          {ui.hud.tutor}
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost !min-h-9 shrink-0 !px-2 text-xs"
        aria-label={soundOn ? ui.hud.soundOn : ui.hud.soundOff}
        aria-pressed={soundOn}
        title={soundOn ? ui.hud.soundOn : ui.hud.soundOff}
        data-testid="hud-sound"
        onClick={press(() => setAudioSettings({ music: !soundOn, sfx: !soundOn }))}
      >
        <span aria-hidden="true">{soundOn ? "🔊" : "🔇"}</span>
      </button>
      <button type="button" className="btn btn-ghost !min-h-9 shrink-0 !px-2 text-xs" data-testid="hud-questlog" onClick={press(() => openOverlay("questlog"))}>
        {ui.hud.questLog}
      </button>
      <button type="button" className="btn btn-ghost !min-h-9 shrink-0 !px-2 text-xs" onClick={press(toMenu)}>
        {ui.hud.backToMenu}
      </button>
    </header>
  );
}
