-- 관리자 계정 + STT/TTS 일별 사용량 집계
-- 1) profiles.is_admin: 관리자 여부 (백엔드 requireAdmin 미들웨어가 이 값을 본다)
-- 2) api_usage_daily: 사용자(또는 비로그인 IP)별·날짜별·종류별 STT/TTS 호출 누적 횟수
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (008 이후 순서로 실행)

alter table profiles add column if not exists is_admin boolean not null default false;

-- usage_key: 로그인 사용자는 auth.users.id 문자열, 비로그인은 'ip:<주소>'.
-- 익명 호출도 세야 하므로 user_id FK 대신 텍스트 키를 쓴다.
create table if not exists api_usage_daily (
  usage_key text not null,
  usage_date date not null,
  kind text not null check (kind in ('stt', 'tts')),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_key, usage_date, kind)
);

create index if not exists api_usage_daily_date_idx on api_usage_daily (usage_date desc);

-- 백엔드(service_role)만 읽고 쓰므로 정책 없이 RLS만 켜서 클라이언트 직접 접근을 막는다.
alter table api_usage_daily enable row level security;

-- 호출 1건을 기록하고 그날의 누적 횟수를 돌려준다.
-- (조회 후 갱신하면 동시 요청에서 한도를 넘길 수 있어, upsert+증가를 한 번의 왕복으로 처리)
create or replace function public.record_api_usage(p_usage_key text, p_kind text, p_usage_date date)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_count integer;
begin
  insert into api_usage_daily (usage_key, usage_date, kind, count, updated_at)
  values (p_usage_key, p_usage_date, p_kind, 1, now())
  on conflict (usage_key, usage_date, kind)
  do update set count = api_usage_daily.count + 1, updated_at = now()
  returning count into new_count;
  return new_count;
end;
$$;

-- 관리자 지정: 앱에서 평소처럼 아이디/비밀번호로 가입한 뒤 아래 한 줄을 실행하면 된다.
-- update profiles set is_admin = true where username = 'admin';
