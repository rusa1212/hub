-- 상황(페르소나) 정의를 personas 테이블 한 곳에서 관리.
--
-- 배경: 상황 하나를 추가/수정하려면 front/src/situations.js(라벨·이모지),
-- AirPodsLog.jsx(인사말), geminiService.js(라벨·프롬프트), 005 시드 데이터 네 곳을 함께
-- 고쳐야 했다. 이제 인사말·상황별 프롬프트·노출 순서·노출 여부를 이 테이블에 두고,
-- 백엔드는 GET /api/situations 로 목록을 내려주고 프런트는 받아서 그리기만 한다.
-- '그냥 대화'는 기존 관례대로 persona_id = null 이며 이 테이블에 행이 없다
-- (화면 표시는 front/src/SituationsContext.jsx, 프롬프트는 geminiService.js의 GENERAL_CHAT_INSTRUCTION).
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (010 이후 순서로 실행)

alter table personas add column if not exists greeting text null;
alter table personas add column if not exists prompt text null;
alter table personas add column if not exists sort_order integer not null default 0;
-- 선택 화면에서 숨길 때 false. 행을 지우면 과거 세션의 persona_id가 null로 바뀌므로 삭제 대신 이 값을 쓴다.
alter table personas add column if not exists is_active boolean not null default true;

-- 기존 하드코딩 값 이관 (화면 순서는 기존 front/src/situations.js 순서를 따름)
insert into personas (id, label, emoji, greeting, prompt, sort_order) values
  ('exercising', '운동 중', '🏃',
   '운동 중이구나! 텐션 확 올려줄 준비 됐어.',
   '에너지 있고 빠른 템포의 톤, 텐션을 올려주는 콘텐츠 추천.',
   10),
  ('sleeping', '자기 전', '🌙',
   '자기 전이구나, 편안하게 갈 수 있게 준비할게.',
   '낮고 차분한 톤, 수면을 유도하는 잔잔한 콘텐츠 추천.',
   20),
  ('morning', '아침 기상', '☀️',
   '좋은 아침, 일어나자마자 화면 볼 필요 없이 나랑 얘기하면서 하루 시작해보자.',
   '산뜻하고 가벼운 톤으로 하루를 여는 느낌을 주고, 화면 대신 귀로 하루를 시작할 수 있게 도와줘.',
   30),
  ('commuting', '이동 중', '🚌',
   '이동 중이구나, 눈이랑 손은 편하게 두고 나랑 얘기하면서 가자.',
   '대중교통·도보 등 안전이 우선인 상황이니 담백하고 짧은 응답을 유지하고, 이동하며 듣기 좋은 콘텐츠를 추천해줘.',
   40),
  ('studying', '집중 모드', '📚',
   '집중 모드구나, 방해되지 않게 조용히 있을게. 필요할 때 편하게 불러줘.',
   '공부·과제·업무 등 몰입이 필요한 상황이야. 집중에 방해되지 않는 차분한 톤, 짧고 간결한 응답, 가사 없는/잔잔한 콘텐츠 위주로 추천.',
   50)
on conflict (id) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  greeting = excluded.greeting,
  prompt = excluded.prompt,
  sort_order = excluded.sort_order;

alter table personas alter column greeting set not null;
alter table personas alter column prompt set not null;

-- 상황 목록은 로그인 전 화면에도 보여야 하는 공개 정보라 읽기만 누구나 허용.
-- (백엔드는 service-role 키라 RLS와 무관하게 읽고, 쓰기는 정책이 없으므로 service-role만 가능)
alter table personas enable row level security;
drop policy if exists "select_personas" on personas;
create policy "select_personas" on personas for select using (true);
