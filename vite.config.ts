/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/** ฟังก์ชันฝั่งเซิร์ฟเวอร์ใน api/ และตัวแปร environment ที่แต่ละตัวใช้ (ค่าลับ ไม่มี prefix VITE_ จึงไม่ถูกส่งไปที่เบราว์เซอร์) */
const SERVER_FUNCTIONS = ["tutor", "teacher"] as const;
const SERVER_ENV = ["GEMINI_API_KEY", "TEACHER_PASSWORD", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/**
 * ให้ npm run dev และ npm run preview ตอบ /api/tutor และ /api/teacher ได้เหมือนบน Vercel:
 * โหลดตัวจัดการจาก api/<ชื่อ>.ts แล้วเรียกด้วย Request มาตรฐาน ค่าลับอ่านจาก .env ฝั่งเซิร์ฟเวอร์
 */
function apiDev(): Plugin {
  return {
    name: "api-dev",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const key of SERVER_ENV) if (env[key]) process.env[key] ??= env[key];
      for (const name of SERVER_FUNCTIONS) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const api = (await server.ssrLoadModule(`/api/${name}.ts`)) as { POST: (request: Request) => Promise<Response> };
            const response =
              req.method === "POST"
                ? await api.POST(new Request(`http://localhost/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: Buffer.concat(chunks) }))
                : Response.json({ error: "method_not_allowed" }, { status: 405 });
            res.statusCode = response.status;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(await response.text());
          } catch (error) {
            server.config.logger.error(`api-dev ${name}: ${(error as Error).message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "server_error" }));
          }
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDev()],
  server: { host: true },
  test: { include: ["src/**/*.test.ts", "supabase/**/*.test.ts", "api/**/*.test.ts"] },
});
