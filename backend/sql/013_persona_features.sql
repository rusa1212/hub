-- 상황별 고유 기능 플래그 (SituationEnhancementPlan.md 3단계).
--
-- features는 { "<기능 이름>": { ...설정 } } 형태의 JSON. 키가 없으면 그 기능은 꺼진 상태다.
-- 프런트가 GET /api/situations 응답의 features를 보고 기능을 켠다 (front/src/features/*.js).
-- - sleepTimer.idleMinutes: 사용자가 이 시간(분) 동안 말하지 않으면 작별 인사 후 대화를 자동 종료 (1~120)
-- - pomodoro.focusMinutes / breakMinutes: 집중·휴식 경계마다 짧은 음성 알림 (각 1~120)
-- 값이 범위를 벗어나거나 형식이 틀리면 프런트는 그 기능을 끈 것으로 취급한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (012 이후 순서로 실행)

alter table personas add column if not exists features jsonb not null default '{}'::jsonb;

update personas set features = '{"sleepTimer": {"idleMinutes": 10}}'::jsonb where id = 'sleeping';
update personas set features = '{"pomodoro": {"focusMinutes": 25, "breakMinutes": 5}}'::jsonb where id = 'studying';
