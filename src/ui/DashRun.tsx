import { useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "../audio/engine";
import { foeName } from "../content/story";
import { fmt, ui } from "../content/ui-strings";
import { gateOf } from "../state/campaign";
import { DASH, dashKindOf, dashPassed, wavesOf, waveHits } from "../state/dash";
import { difficultyOf, useGameStore } from "../state/gameStore";
import { art } from "./art";
import { useDialog } from "./useDialog";

type Phase = "ready" | "run" | "won" | "lost";

const W = 320;
const H = 180;
const LANE_X = [88, 160, 232];
const PLAYER_Y = 150;
const TOP_Y = 18;

const loadImage = (src: string): HTMLImageElement => {
  const image = new Image();
  image.src = src;
  return image;
};

/**
 * ด่านทางเชื่อมก่อนเข้าห้องครั้งแรก (GDD ข้อ 22): ทางเดิน 3 ช่อง เลื่อนซ้ายขวาหลบสิ่งกีดขวางหรือพลังของไคจูที่เฝ้าห้อง
 * รูปแบบตายตัว (src/state/dash.ts) ข้ามได้เสมอ ไม่มีผลต่อดาว ระดับความช่วยเหลือ หรือการปลดล็อก
 * วาดด้วย canvas เฉพาะภาพ ข้อความทั้งหมดเป็น HTML
 */
export function DashRun() {
  const zone = useGameStore((s) => s.dashZone) ?? 1;
  const map = useGameStore(difficultyOf);
  const avatar = useGameStore((s) => s.profile?.avatar ?? "a");
  const outfit = useGameStore((s) => s.shop.outfit);
  const finishDash = useGameStore((s) => s.finishDash);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const dialog = useDialog<HTMLDivElement>(closeOverlay);

  const kind = dashKindOf(zone);
  const waves = wavesOf(kind, zone);
  const gate = gateOf(map, zone);
  const kaiju = gate ? foeName(gate.forms[0].art) : "";

  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [shield, setShield] = useState<number>(DASH.shield);
  const [left, setLeft] = useState<number>(DASH.duration);
  const [flash, setFlash] = useState(false);
  const run = useRef({ phase: "ready" as Phase, t: 0, lane: 1, x: LANE_X[1], hits: 0, hurtUntil: -1, next: 0 });
  const images = useRef<{ player: HTMLImageElement; crate: HTMLImageElement; beam: HTMLImageElement; foe: HTMLImageElement } | null>(null);

  useEffect(() => {
    images.current = {
      player: loadImage(art.player(avatar, outfit)),
      crate: loadImage(art.prop("pr_decor_crates")),
      beam: loadImage(art.fx("beam")),
      foe: loadImage(gate ? art.foe(gate.forms[0].art) : art.robot),
    };
  }, [avatar, outfit, gate]);

  const setRunPhase = useCallback((next: Phase) => {
    run.current.phase = next;
    setPhase(next);
  }, []);

  const start = useCallback(() => {
    run.current = { phase: "run", t: 0, lane: 1, x: LANE_X[1], hits: 0, hurtUntil: -1, next: 0 };
    setShield(DASH.shield);
    setLeft(DASH.duration);
    setPhase("run");
  }, []);

  const move = useCallback((step: -1 | 1) => {
    if (run.current.phase !== "run") return;
    run.current.lane = Math.max(0, Math.min(DASH.lanes - 1, run.current.lane + step));
  }, []);

  // ปุ่มซ้ายขวาจากคีย์บอร์ด (ลูกศรหรือ A / D) ทำงานเฉพาะตอนกำลังวิ่ง
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (run.current.phase !== "run") return;
      const code = event.code;
      if (code === "ArrowLeft" || code === "KeyA") move(-1);
      else if (code === "ArrowRight" || code === "KeyD") move(1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let uiTick = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = run.current;
      if (state.phase === "run") {
        state.t += dt;
        // เลื่อนตัวละครไปที่ช่องทางที่เลือกด้วยความเร็วคงที่ (ข้ามหนึ่งช่องทางใช้ laneMoveS)
        const target = LANE_X[state.lane];
        const speed = (LANE_X[1] - LANE_X[0]) / DASH.laneMoveS;
        state.x += Math.max(-speed * dt, Math.min(speed * dt, target - state.x));
        // คลื่นที่ถึงผู้เล่นแล้ว: ตรวจช่องทางที่ยืนอยู่ ณ ตอนนั้น (ช่องทางที่ใกล้ที่สุด)
        const lane = LANE_X.reduce((best, x, i) => (Math.abs(x - state.x) < Math.abs(LANE_X[best] - state.x) ? i : best), 0);
        while (state.next < waves.length && waves[state.next].at <= state.t) {
          const wave = waves[state.next];
          state.next++;
          if (waveHits(wave, lane) && state.t >= state.hurtUntil) {
            state.hits++;
            state.hurtUntil = state.t + DASH.invulnerableS;
            playSfx("hurt");
            setShield(DASH.shield - state.hits);
            setFlash(true);
            window.setTimeout(() => setFlash(false), 350);
          }
        }
        if (!dashPassed(state.hits)) {
          setRunPhase("lost");
          playSfx("lose");
        } else if (state.t >= DASH.duration) {
          setRunPhase("won");
          playSfx("win");
        }
        uiTick += dt;
        if (uiTick >= 0.25) {
          uiTick = 0;
          setLeft(Math.max(0, Math.ceil(DASH.duration - state.t)));
        }
      }
      draw(state);
      frame = requestAnimationFrame(tick);
    };

    const draw = (state: typeof run.current) => {
      const ctx = canvas.current?.getContext("2d");
      const pics = images.current;
      if (!ctx || !pics) return;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#1a1c2c";
      ctx.fillRect(0, 0, W, H);
      // ทางเดิน 3 ช่อง พร้อมเส้นแบ่งที่เลื่อนลงให้รู้สึกว่าวิ่งไปข้างหน้า
      for (let i = 0; i < DASH.lanes; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#333c57" : "#3b4666";
        ctx.fillRect(LANE_X[i] - 36, 0, 72, H);
      }
      ctx.fillStyle = "#566c86";
      const offset = (state.t * 90) % 24;
      for (let y = -24 + offset; y < H; y += 24) for (const x of [LANE_X[0] + 36, LANE_X[1] + 36]) ctx.fillRect(x - 1, y, 2, 12);
      if (kind === "blast") ctx.drawImage(pics.foe, W / 2 - 24, -4, 48, 48);

      for (const wave of waves) {
        const until = wave.at - state.t;
        if (kind === "obstacles") {
          // สิ่งกีดขวางเลื่อนจากบนจอลงมาถึงผู้เล่นตอนเวลา at
          if (until > DASH.travelS || until < -0.3) continue;
          const p = 1 - until / DASH.travelS;
          const y = TOP_Y + p * (PLAYER_Y - TOP_Y);
          for (const lane of wave.blocked) ctx.drawImage(pics.crate, LANE_X[lane] - 20, y - 52, 40, 80);
        } else {
          // แสงเตือนก่อน แล้วพลังพุ่งลงทั้งช่องทาง
          if (until > DASH.warnS || until < -0.25) continue;
          for (const lane of wave.blocked) {
            if (until > 0) {
              ctx.fillStyle = `rgba(255, 205, 117, ${0.15 + 0.25 * (1 - until / DASH.warnS)})`;
              ctx.fillRect(LANE_X[lane] - 36, 0, 72, H);
              ctx.fillStyle = "#ffcd75";
              ctx.beginPath();
              ctx.moveTo(LANE_X[lane], 50);
              ctx.lineTo(LANE_X[lane] - 9, 66);
              ctx.lineTo(LANE_X[lane] + 9, 66);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.fillStyle = "rgba(255, 90, 90, 0.55)";
              ctx.fillRect(LANE_X[lane] - 36, 0, 72, H);
              ctx.drawImage(pics.beam, LANE_X[lane] - 24, 40, 48, 100);
            }
          }
        }
      }

      // ตัวละครของผู้เล่น: กะพริบตอนยังไม่โดนซ้ำได้
      const blink = state.t < state.hurtUntil && Math.floor(state.t * 12) % 2 === 0;
      if (!blink) ctx.drawImage(pics.player, state.x - 32, PLAYER_Y - 60, 64, 64);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [kind, waves, setRunPhase]);

  const intro = kind === "blast" ? fmt(ui.dash.blast, { kaiju, sec: DASH.duration }) : fmt(ui.dash.obstacles, { n: zone, sec: DASH.duration });

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-2 sm:p-4" data-testid="dash" data-phase={phase} data-kind={kind} data-zone={zone}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={fmt(ui.dash.title, { n: zone })} tabIndex={-1} className="panel mx-auto flex max-w-2xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-teal-dark">🏃 {fmt(ui.dash.title, { n: zone })}</h2>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" data-testid="dash-skip" onClick={() => finishDash(false)}>
            {ui.dash.skip}
          </button>
        </div>
        <p className="text-sm text-slate">{intro}</p>
        <p className="text-xs text-slate">{ui.dash.keys} · {ui.dash.note}</p>

        <div className={`relative overflow-hidden rounded-lg border-[3px] ${flash ? "border-wrong" : "border-ink"}`}>
          <canvas ref={canvas} width={W} height={H} role="img" aria-label={ui.dash.canvasLabel} className="pixelated block aspect-video w-full touch-none bg-ink" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
          <span data-testid="dash-shield" data-shield={shield}>
            {"❤️".repeat(Math.max(0, shield))}
            <span className="sr-only">{fmt(ui.dash.shield, { n: shield, total: DASH.shield })}</span>
            <span aria-hidden="true" className="ml-1 text-slate">
              {fmt(ui.dash.shield, { n: shield, total: DASH.shield })}
            </span>
          </span>
          <span data-testid="dash-left">{phase === "run" ? fmt(ui.dash.progress, { sec: left }) : ""}</span>
        </div>

        {phase === "run" ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn !min-h-14 text-lg" data-testid="dash-left-button" onPointerDown={() => move(-1)}>
              {ui.dash.left}
            </button>
            <button type="button" className="btn !min-h-14 text-lg" data-testid="dash-right-button" onPointerDown={() => move(1)}>
              {ui.dash.right}
            </button>
          </div>
        ) : phase === "ready" ? (
          <button type="button" className="btn" autoFocus data-testid="dash-start" onClick={start}>
            {ui.dash.start}
          </button>
        ) : phase === "won" ? (
          <div className="flex flex-col gap-2">
            <p className="font-bold text-correct-dark" role="status" data-testid="dash-result">
              {fmt(ui.dash.won, { n: DASH.reward })}
            </p>
            <button type="button" className="btn" autoFocus data-testid="dash-go" onClick={() => finishDash(true)}>
              {ui.dash.wonGo}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-bold text-wrong" role="status" data-testid="dash-result">
              {ui.dash.lost}
            </p>
            <button type="button" className="btn" autoFocus data-testid="dash-retry" onClick={start}>
              {ui.dash.retry}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
