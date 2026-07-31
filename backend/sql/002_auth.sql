-- docs/3rd_wk/Authplan.md 참고: 로그인 세션 기록 조회를 위한 마이그레이션
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

alter table sessions
  add constraint sessions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table sessions enable row level security;

create policy "select_own_sessions" on sessions
  for select
  using (auth.uid() = user_id);
