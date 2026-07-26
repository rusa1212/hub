-- docs/3rd_wk/voicepreviewplan.md 참고: 로그인 사용자별 음성 선택 저장
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_voice_id text null,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "select_own_settings" on user_settings
  for select
  using (auth.uid() = user_id);

create policy "upsert_own_settings" on user_settings
  for insert
  with check (auth.uid() = user_id);

create policy "update_own_settings" on user_settings
  for update
  using (auth.uid() = user_id);
