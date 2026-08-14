-- Barge-in Phase 3: assistant 응답 중단 표시 + 분석용 이벤트 로그
-- Supabase 대시보드 > SQL Editor에서 001~005 이후 순서로 실행하세요.

alter table messages add column if not exists interrupted boolean not null default false;
alter table messages add column if not exists interrupted_at timestamptz null;

create table if not exists conversation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  message_id uuid null references messages(id) on delete set null,
  event_type text not null check (event_type in ('barge_in')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_events_session_id_idx
  on conversation_events(session_id, created_at);

alter table conversation_events enable row level security;

drop policy if exists "select_own_conversation_events" on conversation_events;
create policy "select_own_conversation_events" on conversation_events
  for select
  using (
    exists (
      select 1 from sessions s
      where s.id = conversation_events.session_id
        and s.user_id = auth.uid()
    )
  );
