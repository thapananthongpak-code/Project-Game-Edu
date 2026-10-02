# AI Trainer Quest

เกมเว็บ 2D สำหรับสอนวิชา 21906-2001 เปิดโลกเทคโนโลยีปัญญาประดิษฐ์ (หลักสูตร ปวช. 2567) หน่วยการเรียนรู้ Machine Learning
ผู้เรียนเป็นนักฝึกงานใน Pixel AI Lab เดินเรียนและทำเควสของ 6 หัวข้อตามลำดับ เก็บแกน AI มาติดตั้งให้หุ่นยนต์ "การ์เดียน" แล้วพาออกไปปราบไคจูด้วยการตอบโจทย์จากเนื้อหาที่เรียน เลือกได้ 3 ระดับความยาก (ง่าย 6 ห้อง / กลาง 3 ห้อง / ยาก 1 ห้องกับบอส 3 ร่าง) เนื้อเรื่องเล่าเป็นช่องการ์ตูน ห้องสุดท้ายออกไปสร้างโมเดลจริงด้วย [Teachable Machine](https://teachablemachine.withgoogle.com/)

| เอกสาร | สำหรับ |
|---|---|
| [docs/TEACHER_GUIDE.md](docs/TEACHER_GUIDE.md) | ครูผู้สอน: วิธีใช้ในชั้นเรียน แดชบอร์ด และการพาผู้เรียนทำ Teachable Machine |
| [docs/EVALUATION_PLAN.md](docs/EVALUATION_PLAN.md) | แผนเก็บข้อมูลเปรียบเทียบก่อนเรียน–หลังเรียน |
| [docs/GDD.md](docs/GDD.md), [docs/ART_GUIDE.md](docs/ART_GUIDE.md) | ผู้พัฒนา: การออกแบบเกมและงานภาพ |
| [CLAUDE.md](CLAUDE.md) | ผู้พัฒนา: กติกาของโค้ดและท่อข้อมูลเนื้อหา |

## รันในเครื่อง

ต้องมี Node 22.18 ขึ้นไป

```sh
npm install
npm run dev        # http://localhost:5173  (แดชบอร์ดผู้สอนอยู่ที่ /teacher)
```

ไม่ต้องตั้งค่าอะไรก็เล่นได้ครบทุกระดับความยาก: ความคืบหน้าเก็บในเบราว์เซอร์ และพี่บิตตอบด้วยคำใบ้สำเร็จรูป
ระบบที่ต้องตั้งค่าเพิ่มมี 4 อย่าง แต่ละอย่างเปิดแยกกันได้:

| ระบบ | ตัวแปร | ถ้าไม่ตั้ง |
|---|---|---|
| เก็บความคืบหน้าขึ้นฐานข้อมูลกลาง | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | เก็บในเครื่องของผู้เรียนอย่างเดียว |
| แดชบอร์ดผู้สอน | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TEACHER_PASSWORD` | หน้า `/teacher` แจ้งว่ายังไม่ได้ตั้งค่า |
| ติวเตอร์ AI (ในห้องเรียนและในด่านต่อสู้) | `ANTHROPIC_API_KEY` | พี่บิตให้คำใบ้สำเร็จรูปจากเนื้อหาของห้อง |
| เข้าสู่ระบบด้วย Google | `VITE_GOOGLE_LOGIN=1` + ตั้งค่าใน Supabase (ข้อ 1.1) | ไม่มีปุ่มบนหน้าเมนู ผู้เรียนเล่นต่อจากเครื่องอื่นด้วยรหัสเล่นต่อ |

คำอธิบายของแต่ละตัวแปรอยู่ใน [.env.example](.env.example)

## นำขึ้นใช้งานจริง (Supabase + Vercel)

### 1. ฐานข้อมูล Supabase

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com) (แผนฟรีพอสำหรับหนึ่งรายวิชา)
2. เมนู **SQL Editor** → วางเนื้อหาทั้งไฟล์ [supabase/schema.sql](supabase/schema.sql) → **Run** (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
3. เมนู **Authentication → Sign In / Providers** → เปิด **Allow anonymous sign-ins**
4. เมนู **Authentication → Rate Limits** → เพิ่มค่า **anonymous sign-ins** (ค่าเริ่มต้นจำกัดต่อ IP ต่อชั่วโมง ทั้งห้องเรียนมักออกอินเทอร์เน็ตด้วย IP เดียวกัน) ให้มากกว่าจำนวนผู้เรียนที่จะลงทะเบียนพร้อมกัน เช่น 200
5. เมนู **Project Settings → API** (หรือ **API Keys**) จดค่า 3 ค่า:
   - Project URL → ใช้กับ `VITE_SUPABASE_URL` และ `SUPABASE_URL`
   - คีย์ `anon` `public` (หรือ Publishable key) → `VITE_SUPABASE_ANON_KEY`
   - คีย์ `service_role` (หรือ Secret key) → `SUPABASE_SERVICE_ROLE_KEY` **คีย์นี้อ่านข้อมูลได้ทุกแถว ห้ามใส่ในโค้ด ห้ามตั้งชื่อขึ้นต้นด้วย `VITE_` และห้ามส่งให้ใคร**

ค่าเริ่มต้น ผู้เรียนไม่มีบัญชี ไม่มีอีเมล ไม่มีรหัสผ่าน เกมล็อกอินแบบไม่ระบุตัวตนต่ออุปกรณ์เมื่อผู้เรียนใส่รหัสห้องเรียน
ผู้เรียนอ่านได้เฉพาะแถวของตัวเองและเขียนได้ผ่านฟังก์ชันใน schema เท่านั้น (ทดสอบกับ Postgres ใน `supabase/schema.test.ts`)

### 1.1 เข้าสู่ระบบด้วย Google (ทางเลือก)

เปิดเมื่อต้องการให้ผู้เรียนเล่นต่อจากเครื่องใดก็ได้ด้วยบัญชี Google แทนการจดรหัสเล่นต่อ **เมื่อเปิดแล้ว Supabase จะเก็บอีเมลของผู้เรียนที่กดปุ่มนี้ไว้ในระบบบัญชี (Authentication → Users)** ตารางของเกมไม่เก็บอีเมล และครูไม่เห็นอีเมลในแดชบอร์ด ตกลงกับสถานศึกษาเรื่องข้อมูลส่วนบุคคลก่อนเปิด (ดู docs/TEACHER_GUIDE.md ข้อ 7.2)

1. [Google Cloud Console](https://console.cloud.google.com/) → สร้างหรือเลือกโปรเจกต์ → **APIs & Services → OAuth consent screen** → กรอกชื่อแอปและอีเมลติดต่อ (ถ้าใช้ Google Workspace ของสถานศึกษา เลือก Internal เพื่อจำกัดเฉพาะบัญชีของสถานศึกษา ถ้าเลือก External ต้องกด Publish app จึงใช้กับบัญชีทั่วไปได้)
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → ชนิด **Web application**
   - Authorized JavaScript origins: ที่อยู่ของเกม เช่น `https://ai-trainer-quest.vercel.app` (และ `http://localhost:5173` ถ้าจะทดสอบในเครื่อง)
   - Authorized redirect URIs: `https://<รหัสโปรเจกต์>.supabase.co/auth/v1/callback` (คัดลอกจากหน้าตั้งค่า Google ของ Supabase ในขั้นถัดไป)
   - จด **Client ID** และ **Client secret**
3. Supabase → **Authentication → Sign In / Providers → Google** → เปิดใช้ แล้ววาง Client ID และ Client secret
4. Supabase → **Authentication → Sign In / Providers** → เปิด **Allow manual linking** (ให้ผู้เรียนที่ลงทะเบียนด้วยรหัสห้องเรียนไปแล้วผูกบัญชี Google เข้ากับความคืบหน้าเดิมได้)
5. Supabase → **Authentication → URL Configuration** → **Site URL** = ที่อยู่ของเกม และเพิ่มใน **Redirect URLs**: `https://ai-trainer-quest.vercel.app/` (และ `http://localhost:5173/` ถ้าทดสอบในเครื่อง)
6. ตั้ง `VITE_GOOGLE_LOGIN=1` (ใน `.env` และบน Vercel) แล้ว build ใหม่ ปุ่ม **เข้าสู่ระบบด้วย Google** จะขึ้นบนหน้าเมนู

ผู้เล่นที่เข้าสู่ระบบด้วย Google โดยไม่ใส่รหัสห้องเรียนถูกบันทึกใต้รหัสห้อง `SOLO` (ครูกรองดูหรือลบได้จากแดชบอร์ด)

### 2. Vercel

1. ที่ [vercel.com](https://vercel.com) → **Add New… → Project** → Import repository นี้จาก GitHub (Vercel รู้จัก Vite เอง ไม่ต้องแก้คำสั่ง build)
2. ก่อนกด Deploy เปิด **Environment Variables** แล้วใส่ตัวแปรตาม [.env.example](.env.example) (6 ตัว และ `VITE_GOOGLE_LOGIN` ถ้าเปิดใช้ Google) ให้ครบทั้ง Production และ Preview
3. กด **Deploy**

หรือใช้ CLI:

```sh
npx vercel login
npx vercel link
for name in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY TEACHER_PASSWORD ANTHROPIC_API_KEY; do npx vercel env add "$name" production; done
npx vercel --prod
```

ตัวแปรที่ขึ้นต้นด้วย `VITE_` ถูกฝังลงในโค้ดตอน build **แก้ค่าแล้วต้อง Redeploy** จึงมีผล ตัวแปรที่เหลืออ่านตอนฟังก์ชันทำงาน แต่ Vercel ก็ต้อง Redeploy เพื่อส่งค่าใหม่ให้ฟังก์ชันเช่นกัน

### 3. ตรวจหลังขึ้นระบบ

1. เปิดเว็บ → เริ่มเกมใหม่ → ต้องมีช่อง **รหัสห้องเรียน** (ถ้าไม่มี แปลว่า `VITE_SUPABASE_*` ยังไม่เข้า build ให้ Redeploy)
2. ลงทะเบียนด้วยรหัสห้องเรียนทดลอง ทำแบบทดสอบก่อนเรียนให้จบ → เปิดสมุดเควส ต้องขึ้น "บันทึกขึ้นฐานข้อมูลแล้ว" และมีรหัสเล่นต่อ
3. เปิด `/teacher` ใส่รหัสผ่านครู → ต้องเห็นผู้เรียนทดลอง แล้วใช้ปุ่ม "ลบข้อมูลห้องนี้" ลบข้อมูลทดลองออก
4. เข้าห้อง 1 กด "ถามพี่บิต" ถามคำถามหนึ่งข้อ → ถ้าตั้ง `ANTHROPIC_API_KEY` แล้วจะได้คำตอบจาก AI และตัวนับคำถามลดลง
5. ถ้าเปิดใช้ Google: หน้าเมนูต้องมีปุ่ม **เข้าสู่ระบบด้วย Google** กดแล้วกลับมาที่เกมโดยเมนูแสดงอีเมลของบัญชี เปิดเกมจากเบราว์เซอร์อื่นแล้วเข้าสู่ระบบบัญชีเดิม ต้องเห็นปุ่ม "เล่นต่อ (ชื่อเดิม)"

## คำสั่งตรวจสอบ

```sh
npm test                 # unit test: เครื่องยนต์ปรับระดับ ระดับความยาก ด่านต่อสู้ (บอสหลายร่าง) ร้านค้า แผนที่ เพลง ข้อสอบ คะแนนพัฒนาการ ที่เก็บข้อมูล แดชบอร์ด ติวเตอร์ และ schema ของฐานข้อมูล (Postgres ในหน่วยความจำ)
npm run build            # ตรวจชนิด + build
npm run validate:content # โครงสร้างเนื้อหา เฉลย และข้อสอบสองชุด
npm run verify:content   # เทียบเนื้อหากับไฟล์ Word ต้นฉบับทีละบรรทัด
npm run check:coverage   # ทุกหัวข้อมีบทสอน เควส คำถามทบทวน ห้องซ่อม ข้อสอบ ด่านต่อสู้ และภาพครบ
npm run test:e2e         # เล่นจบระดับง่าย (6 ห้อง 6 ด่าน) ระดับกลาง และระดับยาก ด้วย Chrome + ร้านค้า + เสียง + แดชบอร์ด + คีย์บอร์ดอย่างเดียว + จอสัมผัส + ตรวจการเข้าถึง
                         # ต้องเปิดเซิร์ฟเวอร์ dev แบบไม่ต่อฐานข้อมูลกลาง: VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= ANTHROPIC_API_KEY= npm run dev
                         # และอย่าแก้ไฟล์ในโปรเจกต์ระหว่างรัน (หน้าเกมจะโหลดใหม่กลางการทดสอบ)
npm run test:e2e:cloud   # การซิงก์กับฐานข้อมูลกลางและการเข้าสู่ระบบด้วย Google (Supabase จำลอง) ดูวิธีเปิดเซิร์ฟเวอร์ในหัวไฟล์ scripts/e2e-cloud.mjs
npm run test:perf        # เวลาโหลดและเฟรมเรตเมื่อถ่วง CPU และเครือข่าย (ต้อง build แล้วเปิด npx vite preview --port 4173)
```

## ที่มาของเนื้อหา

เนื้อหาบทเรียนทั้งหมดมาจากใบเนื้อหาใน `source/course-content.docx` แปลงเป็น `src/content/course.json` ด้วยสคริปต์ ไม่มีการสรุปย่อหรือแต่งเพิ่ม (ยกเว้นคำตอบของติวเตอร์ AI ซึ่งถูกจำกัดให้ใช้เฉพาะเนื้อหาของห้องที่ผู้เรียนอยู่)
เนื้อเรื่องของเกม (ไคจู การ์เดียน อาจารย์วิน) เป็นข้อความของเกมใน `src/content/story.ts` ไม่ใช่เนื้อหาบทเรียน และไม่มีข้อเท็จจริงเรื่อง ML
ภาพพิกเซลสร้างด้วย Pixel Lab รายการและ prompt อยู่ใน `public/assets/assets-manifest.json` ดนตรีและเสียงประกอบสังเคราะห์ในเบราว์เซอร์ด้วย Web Audio (`src/audio/`) ไม่มีไฟล์เสียง
