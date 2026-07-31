-- docs/dbPlan.md 우선순위 1: sessions + messages
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  persona_id text null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_id_idx on messages(session_id);

-- RLS는 인증 방향(익명 로그인)이 확정되면 별도로 추가 (docs/dbPlan.md 참고).
-- 현재 단계는 백엔드가 service_role 키로 접근하므로 RLS 없이도 동작함.
