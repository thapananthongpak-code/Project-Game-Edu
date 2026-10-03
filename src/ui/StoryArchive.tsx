import { playSfx } from "../audio/engine";
import { chapterTitle, STORY_CHAPTERS, storyLines } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { DIFFICULTIES } from "../state/campaign";
import { difficultyOf, mapUnlocked, useGameStore } from "../state/gameStore";
import { art } from "./art";
import { useDialog } from "./useDialog";

/**
 * เครื่องฉายในโรงเก็บหุ่น: บันทึกเรื่องราวของทุกแมพที่ไปถึงแล้ว ตอนที่ดูแล้วเปิดดูซ้ำได้ ตอนที่ยังไม่ถึงแสดงว่ายังไม่ถึง (GDD ข้อ 2)
 * เรื่องของแต่ละแมพเรียงตามลำดับที่เกิดขึ้น ตอนจบของแมพหนึ่งต่อไปยังตอนมาถึงของแมพถัดไป
 */
export function StoryArchive() {
  const state = useGameStore((s) => s);
  const openStory = useGameStore((s) => s.openStory);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);
  const here = difficultyOf(state);
  // แมพที่อยู่ขึ้นก่อนและเปิดไว้ แมพอื่นที่ไปถึงแล้วพับไว้ กดเปิดดูได้
  const maps = [here, ...DIFFICULTIES.filter((map) => map !== here && mapUnlocked(state, map))];

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="archive">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.archive.title} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">📽 {ui.archive.title}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="archive-close" onClick={closeOverlay}>
            {ui.archive.close}
          </button>
        </div>
        <p className="text-sm text-slate">{ui.archive.intro}</p>
        {maps.map((map) => (
          <details key={map} open={map === here} className="rounded-md border-2 border-ink bg-cream p-2" data-testid={`archive-${map}`} data-here={map === here}>
            <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-extrabold" data-testid={`archive-toggle-${map}`}>
              {ui.difficulty[map].name}
              {map === here && <span className="rounded border-2 border-ink bg-hint px-1 text-xs">{ui.archive.here}</span>}
              <span className="text-xs font-bold text-slate">{fmt(ui.archive.progress, { n: STORY_CHAPTERS[map].filter((beat) => state.story.includes(beat)).length, total: STORY_CHAPTERS[map].length })}</span>
            </summary>
            <ol className="mt-2 flex flex-col gap-1">
              {STORY_CHAPTERS[map].map((beat, i) => {
                const seen = state.story.includes(beat);
                const first = storyLines(beat)[0];
                return (
                  <li key={beat} className={`flex items-center gap-2 rounded-md border-2 border-ink px-2 py-1 ${seen ? "bg-paper" : "border-dashed bg-cream"}`} data-testid={`chapter-${beat}`} data-seen={seen}>
                    {seen && first ? <img src={art.story(first.art)} alt="" className="pixelated aspect-video w-16 shrink-0 rounded-sm border-2 border-ink object-cover" /> : <span className="flex aspect-video w-16 shrink-0 items-center justify-center rounded-sm border-2 border-dashed border-slate text-xs font-bold text-slate">?</span>}
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-bold">{fmt(ui.archive.chapter, { n: i + 1 })}</span> {seen ? chapterTitle(map, beat) : ui.archive.locked}
                    </span>
                    {seen && (
                      <button type="button" className="btn !min-h-9 shrink-0 !px-2 text-xs" data-testid={`chapter-play-${beat}`} onClick={() => (playSfx("click"), openStory(beat))}>
                        {ui.archive.play}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
        ))}
      </div>
    </div>
  );
}
