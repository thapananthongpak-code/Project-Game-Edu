# ai-trainer-quest

เกมเว็บ 2D สอนวิชา 21906-2001 เปิดโลกเทคโนโลยีปัญญาประดิษฐ์ (หลักสูตร ปวช. 2567) หน่วยการเรียนรู้ Machine Learning

## แนวเกม

"AI Trainer Quest": ผู้เล่นเป็นนักฝึกงานใน Pixel AI Lab เดินเก็บเควสผ่าน 6 ห้อง

- ห้องเรียงลำดับเชิงเส้น ห้อง 1→6 ปลดล็อกตามลำดับ เพราะเนื้อหาต่อยอดกัน ห้ามทำให้ข้ามห้องได้
- ห้อง N ใช้เนื้อหาจาก `topics[N-1]` (`id` = เลขห้อง)
- ห้อง 6 เป็นภารกิจภาคสนาม เชื่อมกับเว็บ Teachable Machine จริง (https://teachablemachine.withgoogle.com/) ใช้ข้อมูลจาก `finalQuest`

## เอกสารออกแบบ

- `docs/GDD.md`: กลไกทุกห้อง เกณฑ์ผ่าน ระบบ Personalized Education และที่มาของข้อมูลแต่ละส่วนใน `course.json` อ่านก่อนลงโค้ดเกม
- `docs/ART_GUIDE.md`: ขนาดพิกเซล จานสี รายการแอสเซต และ prompt สำหรับ Pixel Lab
- `docs/TEACHER_GUIDE.md`: คู่มือครู (ใช้ในชั้นเรียน แดชบอร์ด Teachable Machine ข้อมูลของผู้เรียน) แก้พฤติกรรมที่ครูเห็นแล้วต้องแก้คู่มือนี้ด้วย
- `docs/EVALUATION_PLAN.md`: แผนวัดผลก่อนเรียน–หลังเรียน สูตรคะแนนพัฒนาการ และข้อจำกัดของข้อมูล
- `README.md`: วิธีรัน ตั้งค่า Supabase และนำขึ้น Vercel

## โครงสร้างโค้ด

Vite + React + TypeScript + Tailwind v4 + Phaser 3 สถานะตอนนี้: เล่นได้ครบ 6 ห้อง (ห้อง 1–5 สถานี + มินิเกม + คำถามทบทวน, ห้อง 6 ภารกิจภาคสนาม + แบบทดสอบหลังเรียน + ใบประกาศ) มีแบบทดสอบก่อนเรียน/หลังเรียนคู่ขนาน ที่เก็บข้อมูลบน Supabase และแดชบอร์ดผู้สอน สิ่งที่ยังต่างจาก GDD อยู่ใน GDD ข้อ 11 ข้อ 9

- `src/game/`: ฉาก Phaser (`BootScene` โหลดภาพตาม manifest, `HallScene` โถงทางเดิน 6 ประตู, `RoomScene` ห้องเรียน, `WorldScene` คลาสฐานเรื่องเดิน ชน และโต้ตอบ)
- `src/ui/`: React ทับบนฉาก (เมนู, HUD, กล่องบทสนทนา, สมุดบันทึก, ภารกิจภาคสนาม, ใบประกาศ, สมุดเควส, ปุ่มสัมผัส) ข้อความทุกอย่างแสดงด้วย HTML ไม่วาดลง canvas
- `src/state/`: `gameStore.ts` (zustand) เป็นสะพานระหว่าง Phaser กับ React
  - `adaptive.ts` เครื่องยนต์ปรับระดับ เป็นฟังก์ชันล้วน (ระดับความช่วยเหลือ ห้องซ่อม ดาว) ตัวเลขทุกตัวอยู่ใน `adaptive.config.ts` แก้กติกาแล้วต้องแก้ `adaptive.test.ts` ด้วย
  - `progressStore.ts` interface `ProgressStore` มี `LocalProgressStore` (localStorage) และ `SyncedProgressStore` (เครื่อง + Supabase ผ่าน `RemoteBackend` ใน `supabaseBackend.ts`) `createProgressStore()` เลือกตาม `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` รูปแบบข้อมูลคือ `SaveData` (`SAVE_VERSION`) เพิ่มช่องใหม่ต้องเพิ่มใน `emptyRoom`, ตัวตรวจชนิดของ `migrateSave` และเทสต์ ส่งขึ้นฐานข้อมูลกลางเฉพาะผู้เล่นที่ใส่รหัสห้องเรียน ภาพหลักฐานห้ามออกจากเครื่อง (`withoutEvidenceImage`)
  - `assessment.ts` คะแนนแบบทดสอบก่อนเรียน/หลังเรียนและคะแนนพัฒนาการ (ฟังก์ชันล้วน)
  - `rules.ts` ตัวเลขกติกาอื่นจาก GDD
- `src/tutor/` + `api/tutor.ts`: ติวเตอร์ AI "ถามพี่บิต" `api/tutor.ts` เป็นฟังก์ชัน serverless ของ Vercel ที่เรียก Claude API (`claude-opus-5-5`) ฝั่งเซิร์ฟเวอร์เท่านั้น และไม่ import โค้ดจาก `src/` ขีดจำกัดใน `TUTOR_LIMITS` ต้องตรงกับ `src/tutor/config.ts` (มีเทสต์ตรวจ) ตอน `npm run dev` Vite ตอบ `/api/tutor` ด้วยตัวจัดการเดียวกัน
- `supabase/schema.sql`: ตาราง สิทธิ์ (RLS) และฟังก์ชันของฐานข้อมูลกลาง รันซ้ำได้ `supabase/schema.test.ts` ทดสอบกับ Postgres จริงในหน่วยความจำ (PGlite) แก้ schema ต้องแก้เทสต์และ `scripts/e2e-cloud.mjs` (Supabase จำลอง) ด้วย
- `src/teacher/` + `api/teacher.ts`: แดชบอร์ดผู้สอนที่ `/teacher` (แยก bundle จากเกม เลือกใน `src/main.tsx`) `api/teacher.ts` ตรวจ `TEACHER_PASSWORD` แล้วอ่านด้วย service role key และไม่ import โค้ดจาก `src/` การสรุปทั้งหมดเป็นฟังก์ชันล้วนใน `analytics.ts` ข้อความของแดชบอร์ดอยู่ใน `strings.ts`
- `src/ui/useDialog.ts`: หน้าต่างทุกบานต้องใช้ hook นี้คู่กับ `role="dialog"` (โฟกัส วน Tab ปิดด้วย Esc)
- `src/ui/minigames/`: มินิเกมของห้อง 1–5 `MinigameOverlay.tsx` สร้างด่านจาก `quests.json` (ห้องหนึ่งมีได้หลายด่าน นับผิดสะสมร่วมกัน) กระดานมี 3 แบบใช้ร่วมกัน: `MatchBoard` (ห้อง 1, 4, 5) `SortBoard` (ห้อง 2, 3) `AccuracyBoard` (ห้อง 4) เพิ่มชนิดมินิเกมใหม่ต้องเพิ่มใน schema, `IMPLEMENTED_MINIGAMES` (`rules.ts`) และ `stagesOf` พร้อมกัน ไม่เช่นนั้น build ไม่ผ่าน
- `src/content/`: `index.ts` เป็นทางเข้าเดียวของเนื้อหา, `review.ts` โครงสมุดบันทึกของแต่ละห้อง, `choices.ts` สร้างโจทย์เลือกตอบ (แบบทดสอบก่อนเรียน/หลังเรียนชุด A และ B, ห้องซ่อม) จาก `course.json` ตามที่ `quests.json` อ้าง, `ui-strings.ts` ข้อความระบบ (ห้ามมีข้อเท็จจริงเรื่อง ML)
- `public/assets/assets-manifest.json`: รายการภาพที่เกมโหลด พร้อม prompt, arguments และ id ของ Pixel Lab ต่อชิ้น สร้างโดย `npm run assets:build` ห้ามแก้ด้วยมือ
  - `status: "generated"` = ภาพจริงจาก Pixel Lab: ผู้เล่น (CH-01), พี่บิต (CH-02), ไทล์เซตห้อง 1–6 (TS-01..06), แกน AI 6 ชิ้น (CORE-1..6) ต้นฉบับและ `source.json` อยู่ใน `assets-src/pixellab/<ASSET-ID>/`
  - `status: "placeholder"` = ภาพชั่วคราวที่ `scripts/build-assets.py` วาด (ประตู เสาสถานี เครื่องฝึก โต๊ะ แท่น และไทล์โถงทางเดิน)
  - ลำดับเจนต่อชิ้น: `npm run pixellab -- gen <ID>` → รอ → `npm run pixellab -- fetch <ID> <pixellab-id>` → ตรวจภาพ → `npm run assets:build`

```sh
npm run dev                 # เปิดเกมที่ http://localhost:5173
npm run build               # ตรวจชนิด + build
npm test                    # unit test (vitest): adaptive engine, ตัวสร้างโจทย์, คะแนนพัฒนาการ, ProgressStore, แดชบอร์ด, ติวเตอร์, schema ของฐานข้อมูล
npm run test:e2e            # เล่นจบทั้ง 6 ห้องด้วย Chrome + แดชบอร์ด + ผู้เรียนที่ตอบผิดมาก + คีย์บอร์ดอย่างเดียว + จอสัมผัส + axe-core ทุกหน้าจอ (ต้องเปิด npm run dev ไว้ก่อน) E2E_ONLY=struggle,keyboard,touch รันเฉพาะบางชุด
npm run test:e2e:cloud      # ซิงก์กับ Supabase จำลอง: ลงทะเบียน เล่นต่อจากเครื่องอื่น เครื่องที่ใช้ร่วมกัน เครือข่ายล่ม (วิธีเปิดเซิร์ฟเวอร์อยู่ในหัวไฟล์)
npm run test:perf           # เวลาโหลดและเฟรมเรตเมื่อถ่วง CPU/เครือข่าย (ต้อง build แล้วเปิด npx vite preview --port 4173)
npm run check:coverage      # ทุกหัวข้อใน course.json มีบทสนทนา มินิเกม คำถามทบทวน ห้องซ่อม และภาพรองรับครบ
npm run assets:build        # สร้าง public/assets และ manifest จากต้นฉบับ Pixel Lab + ภาพชั่วคราว
npm run pixellab -- gen CH-01   # เจนแอสเซตด้วย Pixel Lab ตาม manifest (ต้องมี PIXELLAB_API_TOKEN ใน .env ใช้โควตา)
```

## ขอบเขตเนื้อหา

- เนื้อหาการเรียนอยู่ในไฟล์ `source/course-content.docx` เท่านั้น ห้ามเพิ่มเนื้อหานอกไฟล์นี้
- ห้ามสรุปย่อ เรียบเรียงใหม่ หรือแต่งเพิ่มข้อความบทเรียน ถ้าต้องการข้อความที่ต้นฉบับไม่มี (เช่น คำบรรยายตาราง คำใบ้ แนวคำตอบ) ให้ถามผู้ใช้ก่อน
- ข้อยกเว้นเดียวคือติวเตอร์ AI (GDD ข้อ 7.5): ตอบเป็นคำของตัวเองได้ แต่ system prompt ใน `api/tutor.ts` ต้องล็อกให้ใช้เฉพาะเนื้อหา `course.json` ของห้องปัจจุบัน ให้คำใบ้ก่อนเฉลย และปฏิเสธคำถามนอกหลักสูตร
- ห้าม OCR หรือเดาเนื้อหาจากชื่อไฟล์ อ่านไฟล์ด้วย python-docx หรือ pandoc

## กติกาโค้ด

- เนื้อหาการเรียนทั้งหมดอยู่ใน `src/content/course.json` เท่านั้น ห้ามฝังข้อความบทเรียนในคอมโพเนนต์ คอมโพเนนต์อ่านจาก JSON ผ่าน type ใน `src/content/schema.ts`
- เฉลยและการตั้งค่ามินิเกมอยู่ใน `src/content/quests.json` เก็บได้เฉพาะเฉลยและ index ที่อ้างถึง `course.json` ห้ามมีข้อความบทเรียน (ตัวตรวจไม่ให้ผ่านถ้าพบข้อความภาษาไทย) ไฟล์นี้แก้ด้วยมือ
- ห้ามใส่ API token ในโค้ดฝั่งเว็บ ใช้ `.env` + `.gitignore` (`.env` ถูก ignore แล้ว) ค่าลับ: `PIXELLAB_API_TOKEN` (สคริปต์เจนภาพ), `ANTHROPIC_API_KEY` (ติวเตอร์), `SUPABASE_SERVICE_ROLE_KEY` และ `TEACHER_PASSWORD` (แดชบอร์ดผู้สอน) ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น บน Vercel ตั้งใน Environment Variables ห้ามตั้งชื่อตัวแปรความลับขึ้นต้นด้วย `VITE_` เพราะ Vite จะฝังลง bundle ค่าที่ขึ้นต้นด้วย `VITE_` ได้มีแค่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` (คีย์สาธารณะ สิทธิ์จริงคุมด้วย RLS) รายการทั้งหมดอยู่ใน `.env.example`
- ข้อมูลของผู้เรียน: เก็บให้น้อยที่สุด ผู้เรียนเห็นเฉพาะข้อมูลของตัวเอง ห้ามเพิ่มช่องที่ระบุตัวบุคคล (อีเมล ชื่อจริง ภาพ) ลงใน `SaveData` หรือตาราง `players` โดยไม่ถามผู้ใช้ก่อน
- UI ใหม่ต้องผ่านการตรวจการเข้าถึงใน `npm run test:e2e` (axe-core, ตัวอักษรไม่เล็กกว่า 12 px, เป้ากดไม่เล็กกว่า 24 px) และใช้ได้ด้วยคีย์บอร์ด สีตัวอักษรใช้ `text-ink` / `text-slate` / `text-teal-dark` / `text-correct-dark` / `text-wrong` (อย่าใช้ `text-steel`, `text-correct` หรือตัวอักษรขาวบนพื้นเขียว คอนทราสต์ไม่ถึง 4.5:1)

## ท่อข้อมูลเนื้อหา

`course.json` สร้างจากไฟล์ Word ด้วยสคริปต์ ห้ามแก้ด้วยมือ ถ้าเนื้อหาเปลี่ยนให้แก้ที่ไฟล์ Word แล้วรันใหม่ตามลำดับ:

```sh
npm run convert:content    # source/course-content.docx -> src/content/course.json (ต้องมี python-docx)
npm run validate:content   # ตรวจโครงสร้าง course.json (ครบ 6 topics, finalQuest ไม่ว่าง) และ quests.json (index และเฉลยชี้ถูกที่)
npm run verify:content     # เทียบ course.json กับไฟล์ Word ทีละบรรทัด ทั้งตกหล่นและแต่งเพิ่ม
```

สคริปต์ `.ts` รันด้วย Node โดยตรง (Node ≥ 22.18) ไม่ต้องติดตั้งแพ็กเกจ

## รูปแบบของ course.json

- `sections[].heading` เก็บตามต้นฉบับรวมเลขนำหน้า เช่น `"1 ความสัมพันธ์ระหว่าง AI และ ML"`
- `sections[].body`: ย่อหน้าคั่นด้วย `\n\n` ขึ้นบรรทัดในย่อหน้าเดียวกันคั่นด้วย `\n` และเป็น `""` เมื่อหัวข้อย่อยนั้นมีแต่ตาราง
- `tables[].sectionIndex` บอกว่าตารางอยู่ในหัวข้อย่อยใด ส่วน `caption` คือชื่อหัวข้อย่อยนั้น (ต้นฉบับไม่มีคำบรรยายตาราง)
- รายการเลขข้อ (`reviewQuestions`, `finalQuest.steps`) ตัด "1. " ออก ใช้ลำดับใน array แทน
- ฟิลด์ที่เพิ่มจาก schema ตั้งต้นเพื่อไม่ให้ข้อความในต้นฉบับตกหล่น: `course`, `topics[].intro`, `topics[].reviewHeading`, `topics[].reviewInstruction`, `tables[].sectionIndex`
- ฟิลด์ที่ตัวแปลงแยกจากประโยคในต้นฉบับให้มินิเกมใช้ (ไม่ใช่ข้อความใหม่ `verify:content` ตรวจว่าประกอบกลับเป็นประโยคเดิมได้): `sections[].terms`, `sections[].accuracyCase`, `reviewQuestions[].items`, `reviewQuestions[].accuracyCase`, `tables[].placement`, `finalQuest.minImagesPerClass` ถ้ามินิเกมต้องการข้อมูลเพิ่ม ให้เพิ่มที่ `scripts/convert-content.py` พร้อมการตรวจใน `scripts/verify-content.py`
- เกมไม่แสดง `tables[].caption`
- หัวข้อ 6 ไม่มีคำถามทบทวน (`reviewQuestions: []`) เนื้อหาทั้งหมดของหัวข้อ 6 อยู่ใน `topics[5]` และ `finalQuest` จัดโครงสร้างจากข้อความชุดเดียวกัน
