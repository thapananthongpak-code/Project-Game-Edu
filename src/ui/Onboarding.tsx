import { useState } from "react";
import { ui } from "../content/ui-strings";
import { otherForm } from "../state/assessment";
import { LEARNING_STYLES, type LearningStyle } from "../state/adaptive.config";
import { cloudEnabled, randomForm, useGameStore } from "../state/gameStore";
import { CLASS_CODE_PATTERN, normalizeClassCode } from "../state/progressStore";
import { MAX_NAME_CHARS } from "../state/rules";
import { AssessmentRun } from "./AssessmentRun";
import { useDialog } from "./useDialog";

export function StylePicker({ value, onChange }: { value: LearningStyle; onChange: (style: LearningStyle) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
      {LEARNING_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          role="radio"
          aria-checked={value === style}
          data-testid={`style-${style}`}
          onClick={() => onChange(style)}
          className={`rounded-lg border-[3px] border-ink p-2 text-left ${value === style ? "bg-hint shadow-[0_3px_0_0_#1a1c2c]" : "bg-paper hover:bg-teal-light"}`}
        >
          <div className="font-extrabold">{ui.style[style].name}</div>
          <div className="text-sm text-slate">{ui.style[style].detail}</div>
        </button>
      ))}
    </div>
  );
}

/** ขั้นแรกของเกมใหม่: ตั้งชื่อที่แสดง ใส่รหัสห้องเรียน เลือกสไตล์การเรียน แล้วทำแบบทดสอบก่อนเรียน (GDD ข้อ 3 และ 7.1) */
export function Onboarding() {
  const profile = useGameStore((s) => s.profile);
  const setProfile = useGameStore((s) => s.setProfile);
  const completePretest = useGameStore((s) => s.completePretest);
  const [name, setName] = useState(profile?.name ?? "");
  const [classCode, setClassCode] = useState(profile?.classCode ?? "");
  const [style, setStyle] = useState<LearningStyle>(profile?.style ?? "read");
  // สุ่มชุดข้อสอบก่อนเรียน ผู้เรียนครึ่งหนึ่งได้ชุด A อีกครึ่งได้ชุด B แล้วสลับชุดตอนหลังเรียน
  const [form] = useState(randomForm);
  const dialog = useDialog<HTMLDivElement>();
  const code = normalizeClassCode(classCode);
  const codeValid = code === "" || CLASS_CODE_PATTERN.test(code);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/85 p-3 sm:p-6" data-testid="onboarding">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={profile ? ui.pretest.title : ui.onboarding.title} tabIndex={-1} className="panel mx-auto max-w-xl p-4 sm:p-6">
        {profile ? (
          <AssessmentRun phase="pretest" form={form} onFinish={completePretest} />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && codeValid) setProfile({ name: name.trim(), style, classCode: code });
            }}
          >
            <h1 className="text-2xl font-extrabold text-teal-dark">{ui.onboarding.title}</h1>
            <label className="flex flex-col gap-1 font-semibold">
              {ui.onboarding.name}
              <input
                value={name}
                maxLength={MAX_NAME_CHARS}
                placeholder={ui.onboarding.namePlaceholder}
                autoComplete="off"
                data-testid="player-name"
                onChange={(event) => setName(event.target.value)}
                className="select-text rounded-md border-2 border-ink bg-paper p-2 text-base font-normal"
              />
            </label>
            {cloudEnabled() && (
              <label className="flex flex-col gap-1 font-semibold">
                {ui.onboarding.classCode}
                <input
                  value={classCode}
                  maxLength={20}
                  placeholder={ui.onboarding.classCodePlaceholder}
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-invalid={!codeValid}
                  data-testid="class-code"
                  onChange={(event) => setClassCode(event.target.value)}
                  className="select-text rounded-md border-2 border-ink bg-paper p-2 text-base font-normal uppercase"
                />
                {!codeValid && <span className="text-sm font-normal text-wrong">{ui.onboarding.classCodeInvalid}</span>}
              </label>
            )}
            <div className="flex flex-col gap-1">
              <span className="font-semibold">{ui.onboarding.style}</span>
              <StylePicker value={style} onChange={setStyle} />
            </div>
            <button type="submit" className="btn self-end" disabled={!name.trim() || !codeValid} data-testid="onboarding-next">
              {ui.onboarding.next}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** แบบทดสอบหลังเรียน: ใช้ชุดที่ผู้เรียนไม่ได้ทำตอนก่อนเรียน จบแล้วรับแกน AI ชิ้นสุดท้ายและเปิดใบประกาศ */
export function Posttest() {
  const pretest = useGameStore((s) => s.pretest);
  const completePosttest = useGameStore((s) => s.completePosttest);
  const collectCore = useGameStore((s) => s.collectCore);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const [form] = useState(() => (pretest ? otherForm(pretest.form) : randomForm()));
  const dialog = useDialog<HTMLDivElement>();

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/85 p-3 sm:p-6">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui.posttest.title} tabIndex={-1} className="panel mx-auto max-w-xl p-4 sm:p-6">
        <AssessmentRun
          phase="posttest"
          form={form}
          onCancel={closeOverlay}
          onFinish={(result) => {
            completePosttest(result);
            collectCore();
            openOverlay("certificate");
          }}
        />
      </div>
    </div>
  );
}
