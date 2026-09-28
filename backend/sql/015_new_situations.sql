-- 신규 상황 추가: 요리·집안일 / 산책·휴식 / 기분 전환 (SituationEnhancementPlan.md 5단계).
--
-- - safety_profile: 시스템 프롬프트의 안전 가이드 종류. 문구 자체는 DB가 아니라 백엔드 코드
--   (geminiService.js의 *_SAFETY_INSTRUCTION)에 있어서, DB 값을 고쳐도 안전 규칙 내용은 바꿀 수 없다.
--   - standard: 위험한 요청은 짧게 거절하고 다른 이야기로 넘어감 (기존 동작)
--   - supportive: 자해·자살 언급 시 거절하지 않고 공감 + 상담 창구(109) 안내, 진단·치료 표현 금지
-- - '기분 전환'(venting)은 감정적으로 취약한 사용자가 들어올 수 있어 is_active = false로 넣는다.
--   내부 테스트 후 `update personas set is_active = true where id = 'venting';` 로 공개한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (014 이후 순서로 실행)

alter table personas add column if not exists safety_profile text not null default 'standard'
  check (safety_profile in ('standard', 'supportive'));

insert into personas (
  id, label, emoji, greeting, prompt, sort_order, is_active,
  tts_style, max_sentences, silence_threshold, silence_duration_ms, description, safety_profile
) values
  ('cooking', '요리·집안일', '🍳',
   '요리하는구나! 손 바쁘니까 필요한 거 있으면 말로 해.',
   '손이 바쁘고 물소리·조리 소음이 있는 상황이야. 레시피나 순서를 물으면 한 번에 한 단계씩 짧고 분명하게 말하고, 다음 단계는 사용자가 물어볼 때 알려줘. 불이나 칼을 다루는 중일 수 있으니 길게 늘어지는 이야기는 피해. 타이머를 맞춰달라고 하면 아직 타이머 기능은 없다고 솔직하게 말해줘. 음악은 경쾌한 BGM 위주로 추천.',
   60, true,
   'in a clear, friendly and steady voice', 2, 14, null,
   '한 번에 한 단계씩, 짧고 분명하게 안내', 'standard'),
  ('walking', '산책·휴식', '🚶',
   '산책 중이구나, 천천히 걸으면서 편하게 얘기하자.',
   '여유 있게 걷거나 쉬는 상황이야. 서두르지 않는 편안한 톤으로, 사용자가 꺼낸 날씨·계절·오늘 있었던 일 같은 이야기를 자연스럽게 이어가. 걸으며 듣기 좋은 가볍고 잔잔한 음악 추천.',
   70, true,
   'in a relaxed, warm and easygoing voice', 3, null, null,
   '여유로운 톤, 걸으며 듣기 좋은 추천', 'standard'),
  ('venting', '기분 전환', '😮‍💨',
   '무슨 일 있었어? 편하게 털어놔도 돼, 다 들을게.',
   '사용자가 속상하거나 답답한 마음을 털어놓고 싶은 상황이야. 해결책이나 조언을 먼저 내놓지 말고, 사용자의 말을 짧게 되짚으며 공감하고 들어주는 데 집중해. 조언은 사용자가 원할 때만 짧게 해. 이 상황에서는 [페르소나]의 음악 추천보다 들어주는 것이 우선이라, 음악은 사용자가 먼저 원할 때만 추천해.',
   80, false,
   'in a warm, gentle and calm voice', 2, null, 2000,
   '조언보다 공감, 이야기를 들어줘요', 'supportive')
on conflict (id) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  greeting = excluded.greeting,
  prompt = excluded.prompt,
  sort_order = excluded.sort_order,
  tts_style = excluded.tts_style,
  max_sentences = excluded.max_sentences,
  silence_threshold = excluded.silence_threshold,
  silence_duration_ms = excluded.silence_duration_ms,
  description = excluded.description,
  safety_profile = excluded.safety_profile;
  -- is_active는 덮어쓰지 않는다: 이미 공개한 venting을 이 파일을 다시 실행했다고 숨기지 않기 위함
