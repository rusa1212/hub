-- 사용량 집계를 "프로젝트(API 키) 전체" 기준으로 확장.
--
-- 배경: Gemini 무료 티어 쿼터는 사용자당이 아니라 프로젝트당으로 센다
-- (429 에러의 quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier).
-- 따라서 호출 1건마다 "그 사용자의 행"과 "프로젝트 전체 행"을 함께 올리고,
-- 두 누적값을 한 번에 돌려준다. 프로젝트 전체 행은 예약 키 '__project__'를 쓴다
-- (사용자 키는 uuid, 비로그인은 'ip:...' 라서 충돌하지 않음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (009 이후 순서로 실행)

-- 반환 타입이 integer -> jsonb로 바뀌므로 create or replace로는 교체되지 않아 먼저 지운다.
drop function if exists public.record_api_usage(text, text, date);

create or replace function public.record_api_usage(p_usage_key text, p_kind text, p_usage_date date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  project_key constant text := '__project__';
  user_count integer;
  project_count integer;
begin
  insert into api_usage_daily (usage_key, usage_date, kind, count, updated_at)
  values (p_usage_key, p_usage_date, p_kind, 1, now())
  on conflict (usage_key, usage_date, kind)
  do update set count = api_usage_daily.count + 1, updated_at = now()
  returning count into user_count;

  -- 예약 키로 직접 들어온 경우(정상 경로에선 없음) 두 번 세지 않도록 방어
  if p_usage_key = project_key then
    return jsonb_build_object('user', user_count, 'project', user_count);
  end if;

  insert into api_usage_daily (usage_key, usage_date, kind, count, updated_at)
  values (project_key, p_usage_date, p_kind, 1, now())
  on conflict (usage_key, usage_date, kind)
  do update set count = api_usage_daily.count + 1, updated_at = now()
  returning count into project_count;

  return jsonb_build_object('user', user_count, 'project', project_count);
end;
$$;
