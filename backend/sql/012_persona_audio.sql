-- 상황별 "소리" 설정: TTS 말투, 답변 최대 문장 수, 무음 감지(VAD) 기준값.
--
-- - tts_style: Gemini TTS에 "Say <tts_style>: <본문>" 형태로 붙는 말투 지시 (영어 부사구).
--   null이면 말투 지시 없이 읽는다. "like ~" 같은 비유를 넣으면 SAFETY로 차단되는 경우가 있어
--   (2026-09-27 확인) 형용사 위주로 짧게 쓴다. 차단되면 백엔드가 말투 없이 한 번 더 읽는다.
-- - max_sentences: 답변 최대 문장 수. null이면 기본 규칙(1~3문장)을 따른다.
-- - silence_threshold / silence_duration_ms: 프런트 무음 감지 기준. null이면 프런트 기본값
--   (SILENCE_THRESHOLD=10, SILENCE_DURATION_MS=1500, AirPodsLog.jsx)을 쓴다.
--   아래 값은 초기 추정치라 실제 사용 환경에서 조정이 필요하다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (011 이후 순서로 실행)

alter table personas add column if not exists tts_style text null;
alter table personas add column if not exists max_sentences smallint null
  check (max_sentences is null or max_sentences between 1 and 5);
alter table personas add column if not exists silence_threshold smallint null
  check (silence_threshold is null or silence_threshold between 1 and 60);
alter table personas add column if not exists silence_duration_ms integer null
  check (silence_duration_ms is null or silence_duration_ms between 500 and 5000);

-- 운동 중: 숨소리를 발화로 오인하지 않게 기준을 올리고, 숨 고르며 끊어 말하는 걸 고려해 대기를 늘림
update personas set
  tts_style = 'in an upbeat, energetic and punchy voice',
  max_sentences = 1,
  silence_threshold = 14,
  silence_duration_ms = 1800
where id = 'exercising';

-- 자기 전: 작게 말하는 걸 잡도록 기준을 낮추고, 느린 말투를 고려해 대기를 늘림
update personas set
  tts_style = 'in a low, slow, calm and soothing voice',
  max_sentences = 2,
  silence_threshold = 7,
  silence_duration_ms = 2000
where id = 'sleeping';

-- 아침 기상: 막 깬 상태의 느린 말투를 고려해 대기를 조금 늘림
update personas set
  tts_style = 'in a bright, fresh and gently cheerful voice',
  max_sentences = 3,
  silence_threshold = null,
  silence_duration_ms = 1800
where id = 'morning';

-- 이동 중: 주변 소음(차량·안내방송)을 발화로 오인하지 않게 기준을 올림
update personas set
  tts_style = 'in a clear, calm and concise voice',
  max_sentences = 2,
  silence_threshold = 14,
  silence_duration_ms = null
where id = 'commuting';

update personas set
  tts_style = 'in a quiet, calm and unhurried voice',
  max_sentences = 1,
  silence_threshold = null,
  silence_duration_ms = null
where id = 'studying';
