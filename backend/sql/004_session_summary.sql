-- 대화 종료 시 생성되는 한 줄 요약을 세션에 저장 (기록 보기 화면에 표시)
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

alter table sessions add column if not exists summary text null;
