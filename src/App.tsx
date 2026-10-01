import { useEffect, useState } from "react";
import { PhaserGame } from "./game/PhaserGame";
import { useGameStore } from "./state/gameStore";
import { ui, fmt } from "./content/ui-strings";
import { nextStyle } from "./state/adaptive";
import { Certificate } from "./ui/Certificate";
import { CoreReward } from "./ui/CoreReward";
import { DialogueBox } from "./ui/DialogueBox";
import { FieldMission } from "./ui/FieldMission";
import { Hud } from "./ui/Hud";
import { MainMenu } from "./ui/MainMenu";
import { Onboarding, Posttest } from "./ui/Onboarding";
import { QuestLog } from "./ui/QuestLog";
import { ReviewNotebook } from "./ui/ReviewNotebook";
import { StageOverlay } from "./ui/StageOverlay";
import { MinigameOverlay } from "./ui/minigames/MinigameOverlay";
import { Toast } from "./ui/Toast";
import { TouchControls } from "./ui/TouchControls";
import { TutorPanel } from "./ui/TutorPanel";
import { useRoomTimer } from "./ui/useRoomTimer";

/** แสดงปุ่มสัมผัสเมื่ออุปกรณ์ใช้นิ้วเป็นหลัก หรือเมื่อมีการแตะจอครั้งแรก */
function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  useEffect(() => {
    const onTouch = () => setTouch(true);
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);
  return touch;
}

/** พี่บิตเสนอให้เปลี่ยนสไตล์การเรียน หลังถูกบังคับเข้าห้องซ่อม 2 ห้องติดกัน ปฏิเสธได้ (GDD ข้อ 7.2) */
function StyleSuggestion() {
  const open = useGameStore((s) => s.styleSuggestion && s.overlay === null);
  const style = useGameStore((s) => s.profile?.style ?? "read");
  const setStyle = useGameStore((s) => s.setStyle);
  const dismiss = useGameStore((s) => s.dismissStyleSuggestion);
  if (!open) return null;
  const suggested = nextStyle(style);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center p-3" data-testid="style-suggestion">
      <div className="panel flex max-w-xl flex-wrap items-center gap-3 p-3">
        <img src="assets/characters/ch_mentor_south.png" alt="" className="pixelated h-12 w-12" />
        <p className="min-w-0 flex-1 text-sm font-semibold">{fmt(ui.styleSuggestion.text, { style: ui.style[suggested].name })}</p>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={dismiss}>
          {ui.styleSuggestion.decline}
        </button>
        <button
          type="button"
          className="btn !min-h-9 text-sm"
          onClick={() => {
            setStyle(suggested);
            dismiss();
          }}
        >
          {ui.styleSuggestion.accept}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const screen = useGameStore((s) => s.screen);
  const overlay = useGameStore((s) => s.overlay);
  const tutorOpen = useGameStore((s) => s.tutorOpen);
  const touch = useTouchDevice();
  useRoomTimer();
  const playing = screen === "hall" || screen === "room";

  return (
    <div className="flex h-dvh w-full select-none flex-col overflow-hidden bg-ink">
      {playing && <Hud />}
      {/* จอแนวตั้ง: ฉากเกมอยู่ด้านบนตามสัดส่วน 16:9 พื้นที่ด้านล่างเป็นของปุ่มสัมผัสและกล่องสนทนา */}
      <main className="relative min-h-0 flex-1 portrait:h-[56.25vw] portrait:flex-none">
        <PhaserGame />
      </main>
      {playing && <StageOverlay touch={touch} />}
      {playing && touch && overlay === null && !tutorOpen && <TouchControls />}
      {overlay === "dialogue" && <DialogueBox />}
      {overlay === "minigame" && <MinigameOverlay />}
      {overlay === "field" && <FieldMission />}
      {overlay === "posttest" && <Posttest />}
      {overlay === "certificate" && <Certificate />}
      <StyleSuggestion />
      {overlay === "review" && <ReviewNotebook />}
      {overlay === "reward" && <CoreReward />}
      {overlay === "questlog" && <QuestLog />}
      {tutorOpen && screen === "room" && <TutorPanel />}
      {screen === "onboarding" && <Onboarding />}
      {screen === "menu" && <MainMenu />}
      <Toast />
    </div>
  );
}
