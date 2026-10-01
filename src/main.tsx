import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

// /teacher = แดชบอร์ดผู้สอน โหลดแยกจากเกม (ไม่โหลด Phaser และไม่แตะความคืบหน้าของผู้เล่นในเครื่อง)
if (window.location.pathname.replace(/\/+$/, "") === "/teacher") {
  document.title = "แดชบอร์ดผู้สอน · AI Trainer Quest";
  document.body.classList.add("teacher");
  void import("./teacher/TeacherApp").then(({ TeacherApp }) =>
    root.render(
      <StrictMode>
        <TeacherApp />
      </StrictMode>,
    ),
  );
} else {
  void Promise.all([import("./App"), import("./state/gameStore")]).then(([{ App }, { connectProgressStore }]) => {
    void connectProgressStore();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
