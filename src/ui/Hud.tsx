import { setAudioSettings } from "../audio/engine";
import { useAudioSettings } from "../audio/useAudio";
import { isFieldRoom, questTitle, stationsOf, topicOf } from "../content";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { DIFFICULTIES, mapIndex } from "../state/campaign";
import { allBattlesWon, coreCount, coreTotal, creditsOf, difficultyOf, nextStepOf, pendingBattle, planOf, roomProgress, useGameStore } from "../state/gameStore";
import { art } from "./art";

/** เป้าหมายถัดไปของผู้เล่น ตามลำดับการเล่นของแมพที่อยู่ (GDD ข้อ 4.1 และ 15) และด่านต่อสู้ (GDD ข้อ 12) */
function useObjective(): string {
  const zone = useGameStore((s) => s.zone);
  const screen = useGameStore((s) => s.screen);
  const profile = useGameStore((s) => s.profile);
  const progress = useGameStore((s) => s.progress);
  const battles = useGameStore((s) => s.battles);
  const posttest = useGameStore((s) => s.posttest);
  const state = { profile, progress, battles, posttest };
  const plan = planOf(state);
  const battle = pendingBattle(state);
  const kaiju = battle ? foeName(battle.forms[0].art) : "";

  if (zone === null) {
    if (screen === "hangar") {
      if (battle) return fmt(ui.objective.hangarBattle, { kaiju });
      return allBattlesWon(state) ? ui.objective.hangarDone : ui.objective.hangarIdle;
    }
    if (battle) return fmt(ui.objective.hallBattle, { kaiju });
    // ห้องถัดไปบนเส้นทาง คือห้องแรกที่ยังมีหัวข้อไม่ได้แกน AI
    const next = plan.zones.findIndex((z) => z.topics.some((topic) => !roomProgress(state, topic).core)) + 1;
    if (next > 0) return fmt(ui.objective.hall, { n: next });
    // ชนะครบทุกด่านของแมพนี้แล้ว: เดินทางไปแมพถัดไป (แมพสุดท้าย: จบทุกแมพแล้ว)
    const onward = DIFFICULTIES[mapIndex(profile?.difficulty) + 1];
    if (!allBattlesWon(state)) return fmt(ui.objective.hallDone, { n: plan.zones.length });
    return onward ? fmt(ui.objective.hallTravel, { map: ui.difficulty[onward].name }) : ui.objective.hallAllDone;
  }

  const topics = plan.zones[zone - 1]?.topics ?? [];
  const single = topics.length === 1;
  const topic = topics.find((t) => !roomProgress(state, t).core);
  if (topic === undefined) {
    const field = topics.some(isFieldRoom);
    if (battle) return fmt(field ? ui.objective.fieldBattle : ui.objective.battle, { kaiju });
    return field ? ui.objective.fieldDone : single ? ui.objective.done : ui.objective.zoneDone;
  }
  const p = roomProgress(state, topic);
  switch (nextStepOf(state, topic)) {
    case "field":
      return ui.objective.field;
    case "posttest":
      return ui.objective.fieldCore;
    case "station":
      return fmt(ui.objective.station, { n: p.stationsSeen + 1, total: stationsOf(topic).length });
    case "minigame":
      if (plan.stations === "optional") return fmt(ui.objective.archive, { n: topic, quest: questTitle(topic) });
      return fmt(single ? ui.objective.minigame : ui.objective.minigameTopic, { n: topic, quest: questTitle(topic) });
    case "review":
      return single ? ui.objective.review : fmt(ui.objective.reviewTopic, { n: topic });
    default:
      return isFieldRoom(topic) ? ui.objective.fieldCore : single ? ui.objective.core : fmt(ui.objective.coreTopic, { n: topic });
  }
}

export function Hud() {
  const zone = useGameStore((s) => s.zone);
  const room = useGameStore((s) => s.room);
  const screen = useGameStore((s) => s.screen);
  const cores = useGameStore(coreCount);
  const total = useGameStore(coreTotal);
  const map = useGameStore(difficultyOf);
  const credits = useGameStore(creditsOf);
  // ห้องที่มีหลายหัวข้อ: บอกด้วยว่ากำลังทำเรื่องที่เท่าไร
  const multi = useGameStore((s) => s.zone !== null && (planOf(s).zones[s.zone - 1]?.topics.length ?? 1) > 1);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const setTutorOpen = useGameStore((s) => s.setTutorOpen);
  const toMenu = useGameStore((s) => s.toMenu);
  const objective = useObjective();
  const audio = useAudioSettings();
  const topic = zone === null || room === null ? null : topicOf(room);
  const soundOn = audio.music || audio.sfx;

  // เอาโฟกัสออกจากปุ่มหลังกด ไม่ให้ Space/Enter ที่ใช้โต้ตอบในเกมไปกดปุ่มซ้ำ
  const press = (run: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    run();
  };

  return (
    <header className="z-10 flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-cream px-2 py-1 text-sm sm:gap-3 sm:px-3" data-zone={zone ?? undefined} data-topic={topic ? room : undefined} data-map={map}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 rounded border-2 border-ink bg-teal-light px-1 text-xs font-extrabold" data-testid="hud-map" title={ui.difficulty[map].name}>
            {fmt(ui.hud.map, { n: mapIndex(map) + 1 })}
          </span>
          <span className="shrink-0 font-extrabold text-teal-dark">{topic ? fmt(ui.hud.room, { n: zone as number }) : screen === "hangar" ? ui.hud.hangar : ui.hud.hall}</span>
          {topic && (
            <span className="truncate font-semibold" data-testid="hud-topic">
              {multi && `${fmt(ui.hud.topic, { n: room as number })}: `}
              {topic.title}
            </span>
          )}
          {topic && <span className="hidden shrink-0 text-xs text-slate md:inline">{fmt(ui.hud.minutes, { n: topic.minutes })}</span>}
        </div>
        <div className="truncate text-xs text-slate" data-testid="objective">
          ▸ {objective}
        </div>
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-md border-2 border-ink bg-hint px-2 py-0.5 text-xs font-bold min-[520px]:flex" data-testid="credits" data-credits={credits}>
        <img src={art.credit} alt="" className="pixelated h-4 w-4" />
        {fmt(ui.hud.credits, { n: credits })}
      </span>
      <span className="hidden shrink-0 rounded-md border-2 border-ink bg-teal-light px-2 py-0.5 text-xs font-bold min-[420px]:inline" data-testid="cores">
        {fmt(ui.hud.cores, { n: cores, total })}
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
