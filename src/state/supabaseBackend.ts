// ฐานข้อมูลกลางบน Supabase (ตารางและฟังก์ชันใน supabase/schema.sql)
// ผู้เรียนล็อกอินแบบไม่ระบุตัวตนต่ออุปกรณ์ ไม่มีอีเมลหรือรหัสผ่าน anon key เป็นคีย์สาธารณะ สิทธิ์จริงคุมด้วย RLS
import { createClient } from "@supabase/supabase-js";
import type { RemoteBackend, RemoteRecord, SaveData } from "./progressStore";

interface Row {
  data: SaveData;
  resume_code: string;
}

const toRecord = (row: Row | null | undefined): RemoteRecord | null => (row ? { data: row.data, resumeCode: row.resume_code } : null);

export function createSupabaseBackend(url: string, anonKey: string): RemoteBackend {
  const client = createClient(url, anonKey);

  const hasSession = async () => (await client.auth.getSession()).data.session !== null;

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
      const { data, error } = await client.rpc("save_progress", { p_class_code: save.profile?.classCode ?? "", p_display_name: save.profile?.name ?? "", p_data: save });
      if (error) throw error;
      return data as string;
    },
    async reset() {
      if (!(await hasSession())) return;
      const { error } = await client.rpc("reset_progress");
      if (error) throw error;
    },
    async detach() {
      if (!(await hasSession())) return;
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
