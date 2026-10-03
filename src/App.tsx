import { useEffect, useState } from "react";
import { useAudioDirector } from "./audio/useAudio";
import { PhaserGame } from "./game/PhaserGame";
import { pendingStory, useGameStore } from "./state/gameStore";
import { Battle } from "./ui/Battle";
import { Certificate } from "./ui/Certificate";
import { CoreReward } from "./ui/CoreReward";
import { DialogueBox } from "./ui/DialogueBox";
import { FieldMission } from "./ui/FieldMission";
import { Hud } from "./ui/Hud";
import { MainMenu } from "./ui/MainMenu";
import { Missions } from "./ui/Missions";
import { Onboarding, Posttest } from "./ui/Onboarding";
import { QuestLog } from "./ui/QuestLog";
import { ReviewQuiz } from "./ui/ReviewQuiz";
import { Shop } from "./ui/Shop";
import { Storage } from "./ui/Storage";
import { GuardianBay } from "./ui/GuardianBay";
import { Wardrobe } from "./ui/Wardrobe";
import { BitPad } from "./ui/BitPad";
import { TravelMap } from "./ui/TravelMap";
import { DecorBoard } from "./ui/DecorBoard";
import { Extras } from "./ui/Extras";
import { StageOverlay } from "./ui/StageOverlay";
import { StoryDialog } from "./ui/StoryDialog";
import { MinigameOverlay } from "./ui/minigames/MinigameOverlay";
import { Npc } from "./ui/Npc";
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

/** เปิดฉากเนื้อเรื่องที่ถึงคิวเมื่อผู้เล่นว่างอยู่ (ไม่มีหน้าต่างอื่นเปิด) */
function useStoryTrigger(): void {
  const beat = useGameStore((s) => (s.ready && s.overlay === null && !s.tutorOpen ? pendingStory(s) : null));
  const openStory = useGameStore((s) => s.openStory);
  useEffect(() => {
    if (beat) openStory(beat);
  }, [beat, openStory]);
}

export function App() {
  const screen = useGameStore((s) => s.screen);
  const overlay = useGameStore((s) => s.overlay);
  const tutorOpen = useGameStore((s) => s.tutorOpen);
  const tutorRoom = useGameStore((s) => s.tutorRoom);
  const touch = useTouchDevice();
  useRoomTimer();
  useAudioDirector();
  useStoryTrigger();
  const playing = screen === "hall" || screen === "hangar" || screen === "room";

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
      {overlay === "review" && <ReviewQuiz />}
      {overlay === "reward" && <CoreReward />}
      {overlay === "questlog" && <QuestLog />}
      {overlay === "shop" && <Shop />}
      {overlay === "npc" && <Npc />}
      {overlay === "missions" && <Missions />}
      {overlay === "storage" && <Storage />}
      {overlay === "guardian" && <GuardianBay />}
      {overlay === "wardrobe" && <Wardrobe />}
      {overlay === "bit" && <BitPad />}
      {overlay === "travel" && <TravelMap />}
      {overlay === "decor" && <DecorBoard />}
      {overlay === "extras" && <Extras />}
      {overlay === "battle" && <Battle />}
      {overlay === "story" && <StoryDialog />}
      {tutorOpen && tutorRoom !== null && <TutorPanel />}
      {screen === "onboarding" && <Onboarding />}
      {screen === "menu" && <MainMenu />}
      <Toast />
    </div>
  );
}
