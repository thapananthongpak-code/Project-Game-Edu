import { useState } from "react";
import { type Speaker, storyBeats } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { playSfx } from "../audio/engine";
import { useGameStore } from "../state/gameStore";
import { art } from "./art";
import { useDialog } from "./useDialog";

const PORTRAIT: Record<Speaker, string | null> = { narrator: null, professor: art.professor, mentor: art.mentor };

/**
 * ฉากเนื้อเรื่องแบบช่องการ์ตูน: ภาพประกอบหนึ่งภาพต่อหนึ่งช่อง คำบรรยายหรือคำพูดอยู่ใต้ภาพ
 * อ่านทีละช่อง ข้ามได้ ดูจบแล้วบันทึกว่าดูแล้วและไม่แสดงซ้ำ (GDD ข้อ 2)
 */
export function StoryDialog() {
  const beat = useGameStore((s) => s.storyBeat) as string;
  const name = useGameStore((s) => s.profile?.name ?? ui.questLog.name);
  const finishStory = useGameStore((s) => s.finishStory);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const lines = storyBeats[beat] ?? [];
  const [page, setPage] = useState(0);

  const finish = () => {
    finishStory();
    // บทส่งท้ายจบที่ใบประกาศ
    if (beat === "ending") openOverlay("certificate");
  };
  const dialog = useDialog<HTMLDivElement>(finish);
  const line = lines[Math.min(page, lines.length - 1)];
  const last = page >= lines.length - 1;
  if (!line) return null;
  const portrait = PORTRAIT[line.speaker];
  const narration = line.speaker === "narrator";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/90 p-2 sm:p-6" data-testid="story" data-beat={beat}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={ui.story.speakers[line.speaker]} className="panel flex w-full max-w-2xl flex-col gap-2 p-2 sm:gap-3 sm:p-3">
        {/* ช่องภาพ: ภาพก่อนหน้ายังอยู่จนกว่าภาพใหม่จะมา จึงไม่กระพริบ */}
        <div className="story-panel relative aspect-video max-h-[46dvh] w-full overflow-hidden rounded-md border-[3px] border-ink bg-slate">
          <img key={line.art} src={art.story(line.art)} alt="" className="pixelated story-art absolute inset-0 h-full w-full object-cover" data-testid="story-art" data-art={line.art} />
          <span className="absolute left-1.5 top-1.5 rounded border-2 border-ink bg-cream px-1.5 text-xs font-extrabold">{fmt(ui.story.page, { n: page + 1, total: lines.length })}</span>
        </div>
        <div className={`flex items-start gap-3 rounded-md border-[3px] border-ink p-2 sm:p-3 ${narration ? "bg-hint" : "bg-paper"}`}>
          {portrait && <img src={portrait} alt="" className="pixelated h-14 w-14 shrink-0 rounded-md border-2 border-ink bg-teal-light sm:h-16 sm:w-16" />}
          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="text-sm font-extrabold text-teal-dark" data-testid="story-speaker">
              {ui.story.speakers[line.speaker]}
            </div>
            <p key={page} className={`slide-in mt-0.5 text-base leading-relaxed sm:text-lg ${narration ? "italic" : "font-semibold"}`} data-testid="story-text">
              {fmt(line.text, { name })}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {!last && (
            <button type="button" className="btn btn-ghost !min-h-10 text-sm" data-testid="story-skip" onClick={finish}>
              {ui.story.skip}
            </button>
          )}
          <button
            type="button"
            className="btn !min-h-10"
            data-testid="story-next"
            onClick={() => {
              if (last) return finish();
              playSfx("page");
              setPage(page + 1);
            }}
          >
            {last ? ui.story.done : ui.story.next}
          </button>
        </div>
      </div>
    </div>
  );
}
