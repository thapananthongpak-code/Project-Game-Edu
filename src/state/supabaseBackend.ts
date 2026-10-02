// ฐานข้อมูลกลางบน Supabase (ตารางและฟังก์ชันใน supabase/schema.sql)
// ค่าเริ่มต้น: ผู้เรียนล็อกอินแบบไม่ระบุตัวตนต่ออุปกรณ์ ไม่มีอีเมลหรือรหัสผ่าน
// ทางเลือก (เปิดด้วย VITE_GOOGLE_LOGIN=1): เข้าสู่ระบบด้วย Google เพื่อเล่นต่อได้จากทุกเครื่อง อีเมลอยู่ในระบบบัญชีของ Supabase (auth.users) เท่านั้น
// เกมไม่คัดลอกอีเมลลงตาราง players และครูไม่เห็นอีเมลในแดชบอร์ด anon key เป็นคีย์สาธารณะ สิทธิ์จริงคุมด้วย RLS
import { createClient } from "@supabase/supabase-js";
import type { AccountInfo, RemoteBackend, RemoteRecord, SaveData } from "./progressStore";

interface Row {
  data: SaveData;
  resume_code: string;
}

/** รหัสห้องเรียนของผู้เล่นที่เข้าสู่ระบบด้วย Google แต่ไม่มีรหัสห้องจากครู (ฐานข้อมูลต้องมีรหัสห้องเสมอ) */
export const SOLO_CLASS_CODE = "SOLO";

const toRecord = (row: Row | null | undefined): RemoteRecord | null => (row ? { data: row.data, resumeCode: row.resume_code } : null);

/** ข้อผิดพลาดที่ Supabase ส่งกลับมาใน URL หลังพาไปล็อกอินกับ Google อ่านแล้วลบออกจาก URL */
function consumeAuthError(): string | null {
  const params = new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`);
  const code = params.get("error_code") ?? params.get("error");
  if (code) window.history.replaceState(null, "", window.location.pathname);
  return code;
}

export function createSupabaseBackend(url: string, anonKey: string): RemoteBackend {
  const authError = consumeAuthError();
  const client = createClient(url, anonKey);

  const session = async () => (await client.auth.getSession()).data.session;
  const hasSession = async () => (await session()) !== null;

  /**
   * ล็อกอินแบบไม่ระบุตัวตนเมื่อจะส่งข้อมูลครั้งแรก supabase-js เก็บ session ไว้ในเบราว์เซอร์และต่ออายุเอง
   * ผู้เล่นที่ไม่ใส่รหัสห้องเรียนจึงไม่ถูกสร้างบัญชีเลย (Supabase จำกัดจำนวนการล็อกอินไม่ระบุตัวตนต่อ IP ต่อชั่วโมง ดู README)
   */
  const signedIn = async () => {
    if (await hasSession()) return;
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  };

  return {
    authError,
    async account(): Promise<AccountInfo | null> {
      const user = (await session())?.user;
      if (!user) return null;
      return user.is_anonymous ? { provider: "anonymous", email: null } : { provider: "google", email: user.email ?? null };
    },
    async signInWithGoogle(link) {
      const options = { redirectTo: `${window.location.origin}/` };
      const user = (await session())?.user;
      // อุปกรณ์ที่มีบัญชีไม่ระบุตัวตนอยู่แล้ว: ผูก Google เข้ากับบัญชีเดิม ความคืบหน้าจึงตามมาด้วย
      const { error } = link && user?.is_anonymous ? await client.auth.linkIdentity({ provider: "google", options }) : await client.auth.signInWithOAuth({ provider: "google", options });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
    async load() {
      // อุปกรณ์ที่ยังไม่เคยล็อกอินยังไม่มีข้อมูลในฐานข้อมูลกลาง ไม่ต้องสร้างบัญชีเพื่อมาอ่าน
      if (!(await hasSession())) return null;
      // RLS ให้เห็นเฉพาะแถวของผู้เล่นที่เชื่อมกับอุปกรณ์นี้
      const { data, error } = await client.from("players").select("data, resume_code").is("archived_at", null).maybeSingle<Row>();
      if (error) throw error;
      return toRecord(data);
    },
    async save(save) {
      await signedIn();
      const { data, error } = await client.rpc("save_progress", { p_class_code: save.profile?.classCode || SOLO_CLASS_CODE, p_display_name: save.profile?.name ?? "", p_data: save });
      if (error) throw error;
      return data as string;
    },
    async reset() {
      if (!(await hasSession())) return;
      const { error } = await client.rpc("reset_progress");
      if (error) throw error;
    },
    async detach() {
      const user = (await session())?.user;
      if (!user) return;
      // บัญชี Google: ออกจากระบบที่เครื่องนี้อย่างเดียว การเชื่อมบัญชีกับความคืบหน้ายังอยู่ เจ้าของล็อกอินที่เครื่องไหนก็เล่นต่อได้
      if (!user.is_anonymous) {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        return;
      }
      const { error } = await client.rpc("detach_device");
      if (error) throw error;
    },
    async claim(code) {
      await signedIn();
      const { data, error } = await client.rpc("claim_progress", { p_code: code });
      if (error) throw error;
      return toRecord((data as Row[] | null)?.[0]);
    },
  };
}
