-- 상황 선택 화면에 보여줄 짧은 설명 (SituationEnhancementPlan.md 4-3).
-- 상황마다 무엇이 달라지는지(말투·추천·고유 기능)를 한 줄로 알려준다. null이면 설명 없이 라벨만 보인다.
-- '그냥 대화'는 행이 없으므로 front/src/SituationsContext.jsx의 GENERAL_CHAT.description에 둔다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (013 이후 순서로 실행)

alter table personas add column if not exists description text null;

update personas set description = '힘찬 목소리, 텐션 올리는 음악 추천' where id = 'exercising';
update personas set description = '차분한 목소리, 잔잔한 음악 추천 · 10분 조용하면 자동 종료' where id = 'sleeping';
update personas set description = '산뜻한 목소리로 가볍게 하루 시작' where id = 'morning';
update personas set description = '짧고 담백하게, 이동하며 듣기 좋은 추천' where id = 'commuting';
update personas set description = '먼저 말 걸지 않고, 25분마다 쉬는 시간 알림' where id = 'studying';
