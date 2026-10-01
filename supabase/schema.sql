-- AI Trainer Quest: โครงสร้างฐานข้อมูลบน Supabase
-- วิธีใช้: Supabase Dashboard > SQL Editor > วางทั้งไฟล์นี้แล้วกด Run (รันซ้ำได้)
-- ต้องเปิด Authentication > Sign In / Providers > Allow anonymous sign-ins ด้วย
--
-- หลักการ
--   * ผู้เรียนไม่มีบัญชี ไม่มีอีเมล เกมล็อกอินแบบไม่ระบุตัวตน (anonymous sign-in) ต่ออุปกรณ์
--   * ข้อมูลส่วนบุคคลที่เก็บมีแค่ชื่อที่แสดง (แนะนำชื่อเล่นหรือเลขที่) กับรหัสห้องเรียน
--   * ผู้เรียนอ่านได้เฉพาะแถวของตัวเอง (RLS) และเขียนได้ผ่านฟังก์ชันด้านล่างเท่านั้น
--   * ครูอ่านข้อมูลทั้งห้องผ่าน /api/teacher ซึ่งใช้ service role key ฝั่งเซิร์ฟเวอร์ (ข้าม RLS)

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  class_code text not null,
  display_name text not null,
  -- ความคืบหน้าทั้งหมดของเกม (SaveData ใน src/state/progressStore.ts) ไม่มีภาพหลักฐาน
  data jsonb not null,
  -- รหัสสำหรับเล่นต่อจากเครื่องอื่น
  resume_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ผู้เรียนกดเริ่มเกมใหม่: เก็บแถวเดิมไว้ให้ครู ไม่ลบ
  archived_at timestamptz
);

create index if not exists players_class_code_idx on public.players (class_code);

-- อุปกรณ์ (การล็อกอินแบบไม่ระบุตัวตน) ที่เข้าถึงผู้เล่นแต่ละคนได้ หนึ่งอุปกรณ์ต่อหนึ่งผู้เล่น
create table if not exists public.player_devices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  linked_at timestamptz not null default now()
);

create index if not exists player_devices_player_id_idx on public.player_devices (player_id);

alter table public.players enable row level security;
alter table public.player_devices enable row level security;

-- ผู้เรียน: อ่านได้เฉพาะของตัวเอง ไม่มีสิทธิ์เขียนตารางโดยตรง
revoke all on public.players, public.player_devices from anon, authenticated;
grant select on public.players, public.player_devices to authenticated;

drop policy if exists "players: read own" on public.players;
create policy "players: read own" on public.players for select to authenticated
  using (id in (select player_id from public.player_devices where user_id = (select auth.uid())));

drop policy if exists "player_devices: read own" on public.player_devices;
create policy "player_devices: read own" on public.player_devices for select to authenticated
  using (user_id = (select auth.uid()));

-- รหัสเล่นต่อ: 10 ตัวจากเลขฐานสิบหก (40 บิต) สุ่มด้วย gen_random_uuid
create or replace function public.new_resume_code() returns text
language sql volatile set search_path = ''
as $$ select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) $$;

-- บันทึกความคืบหน้าของผู้เรียนที่ล็อกอินอยู่ คืนรหัสเล่นต่อ
create or replace function public.save_progress(p_class_code text, p_display_name text, p_data jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_player uuid;
  v_code text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  p_class_code := upper(btrim(coalesce(p_class_code, '')));
  p_display_name := btrim(coalesce(p_display_name, ''));
  if p_class_code !~ '^[A-Z0-9_-]{1,20}$' then
    raise exception 'invalid class code' using errcode = '22023';
  end if;
  if char_length(p_display_name) not between 1 and 40 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 200000 then
    raise exception 'invalid data' using errcode = '22023';
  end if;

  select player_id into v_player from public.player_devices where user_id = v_user;
  if v_player is null then
    insert into public.players (class_code, display_name, data, resume_code)
    values (p_class_code, p_display_name, p_data, public.new_resume_code())
    returning id, resume_code into v_player, v_code;
    insert into public.player_devices (user_id, player_id) values (v_user, v_player);
  else
    update public.players
    set class_code = p_class_code, display_name = p_display_name, data = p_data, updated_at = now()
    where id = v_player
    returning resume_code into v_code;
  end if;
  return v_code;
end;
$$;

-- ผู้เรียนคนใหม่มาใช้เครื่องเดิม (เครื่องที่ใช้ร่วมกันในห้องปฏิบัติการ): ตัดการเชื่อมกับอุปกรณ์นี้อย่างเดียว
-- ความคืบหน้าของคนเดิมยังอยู่ครบ ครูยังเห็น และเจ้าของเล่นต่อที่เครื่องอื่นได้ด้วยรหัสเล่นต่อ
create or replace function public.detach_device() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.player_devices where user_id = auth.uid();
end;
$$;

-- ผู้เรียนคนเดิมขอเริ่มใหม่ทั้งหมด: เก็บแถวเดิมไว้ให้ครูในสถานะเก็บถาวร แล้วตัดการเชื่อมกับอุปกรณ์นี้
create or replace function public.reset_progress() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_player uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select player_id into v_player from public.player_devices where user_id = v_user;
  if v_player is null then
    return;
  end if;
  delete from public.player_devices where user_id = v_user;
  update public.players set archived_at = now()
  where id = v_player and not exists (select 1 from public.player_devices where player_id = v_player);
end;
$$;

-- ย้ายมาเล่นต่อที่อุปกรณ์นี้ด้วยรหัสเล่นต่อ คืนแถวว่างถ้ารหัสไม่ถูก
create or replace function public.claim_progress(p_code text) returns table (data jsonb, resume_code text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_current uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select p.id into v_target from public.players p
  where p.resume_code = upper(btrim(coalesce(p_code, ''))) and p.archived_at is null;
  if v_target is null then
    -- หน่วงคำตอบของรหัสที่ผิด ให้การเดารหัสช้าลง
    perform pg_sleep(0.5);
    return;
  end if;

  select d.player_id into v_current from public.player_devices d where d.user_id = v_user;
  if v_current is distinct from v_target then
    -- ความคืบหน้าที่เคยเชื่อมกับอุปกรณ์นี้ (อาจเป็นของผู้เรียนอีกคนที่ใช้เครื่องร่วมกัน) ไม่ถูกแตะ เจ้าของยังใช้รหัสเล่นต่อได้
    delete from public.player_devices d where d.user_id = v_user;
    insert into public.player_devices (user_id, player_id) values (v_user, v_target);
  end if;
  return query select p.data, p.resume_code from public.players p where p.id = v_target;
end;
$$;

revoke execute on function public.save_progress(text, text, jsonb), public.reset_progress(), public.detach_device(), public.claim_progress(text), public.new_resume_code() from public, anon;
grant execute on function public.save_progress(text, text, jsonb), public.reset_progress(), public.detach_device(), public.claim_progress(text) to authenticated;
