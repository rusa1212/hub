-- 페르소나 정규화(personas 테이블) + messages 테이블 자체에서 user/assistant · 페르소나를 함께 분류
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

-- 1) 페르소나 정규화 테이블
-- sessions.persona_id는 그동안 자유 텍스트였음 (backend/src/services/geminiService.js의
-- SITUATION_LABELS, front/src/situations.js의 SITUATIONS와 값이 동일해야 함).
-- '그냥 대화'(일반 채팅)는 기존 관례대로 persona_id = null 로 유지.
create table if not exists personas (
  id text primary key,
  label text not null,
  emoji text null,
  created_at timestamptz not null default now()
);

insert into personas (id, label, emoji) values
  ('studying', '집중 모드', '📚'),
  ('exercising', '운동 중', '🏃'),
  ('sleeping', '자기 전', '🌙'),
  ('morning', '아침 기상', '☀️'),
  ('commuting', '이동 중', '🚌')
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where c.conname = 'sessions_persona_id_fkey' and t.relname = 'sessions'
  ) then
    alter table sessions
      add constraint sessions_persona_id_fkey
      foreign key (persona_id) references personas(id) on delete set null;
  end if;
end $$;

-- 2) messages 테이블에 persona_id를 비정규화해서 저장.
-- role(user/assistant)과 persona_id가 한 테이블에 함께 있어야 조인 없이
-- "이 메시지가 어떤 발화자의, 어떤 페르소나에서 나온 메시지인지" 바로 분류/필터링할 수 있음.
alter table messages add column if not exists persona_id text null references personas(id) on delete set null;

-- 세션 생성 시점의 persona_id를 새 메시지에 자동으로 복사 (백엔드 insert 코드 수정 불필요)
create or replace function set_message_persona_id()
returns trigger as $$
begin
  select persona_id into new.persona_id from sessions where id = new.session_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists messages_set_persona_id on messages;
create trigger messages_set_persona_id
before insert on messages
for each row execute function set_message_persona_id();

-- 기존 메시지에도 세션의 persona_id를 채워넣음 (1회성 백필)
update messages m
set persona_id = s.persona_id
from sessions s
where m.session_id = s.id
  and m.persona_id is distinct from s.persona_id;

create index if not exists messages_persona_id_idx on messages(persona_id);
create index if not exists messages_role_persona_id_idx on messages(role, persona_id);

-- 3) messages에는 지금까지 RLS가 없었음 (sessions만 002_auth.sql에서 RLS 적용).
alter table messages enable row level security;

drop policy if exists "select_own_messages" on messages;
create policy "select_own_messages" on messages
  for select
  using (
    exists (
      select 1 from sessions s
      where s.id = messages.session_id
        and s.user_id = auth.uid()
    )
  );

-- 4) 페르소나별 통계 view (role × persona_id 집계)
create or replace view persona_stats
with (security_invoker = true) as
select
  m.persona_id,
  p.label as persona_label,
  count(distinct m.session_id) as session_count,
  count(m.id) filter (where m.role = 'user') as user_message_count,
  count(m.id) filter (where m.role = 'assistant') as assistant_message_count,
  count(distinct s.user_id) as unique_user_count
from messages m
join sessions s on s.id = m.session_id
left join personas p on p.id = m.persona_id
group by m.persona_id, p.label;
