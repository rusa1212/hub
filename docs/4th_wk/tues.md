# 에어팟 로그 — 작업 로그 (화요일)

## 1. Gemini 응답 길이 제한 완화

- `backend/src/services/geminiService.js`의 `generateReply`에서 `maxOutputTokens: 300`
  때문에 답변이 중간에 잘리는 문제 확인.
- `300 → 800`으로 상향.

## 2. 페르소나 구조 개편 (`docs/4th_wk/personaAdd.md` 반영)

- 문서의 impact-to-effort 우선순위 1·2순위인 "이동 중" / "아침 기상"을 상황 목록에 추가하고,
  기존 "공부 중"은 공부·과제·업무를 포괄하도록 "집중 모드"로 개칭. 3순위(시험 기간/스트레스),
  4순위(요리 중 등)는 이번엔 보류.
- `front/src/situations.js`: `SITUATIONS` 배열에 `morning`(☀️ 아침 기상), `commuting`
  (🚌 이동 중) 추가, `studying` 라벨을 "집중 모드"로 변경, 상황 기반 항목들 뒤에
  디폴트("그냥 대화")가 오도록 순서 정리.
- `front/src/AirPodsLog.jsx`: `SITUATION_GREETINGS`에 `morning`/`commuting` 인사말 추가,
  `studying` 인사말을 "집중 모드" 문구로 수정.
- `backend/src/services/geminiService.js`: `SITUATION_LABELS`에 `morning`/`commuting` 추가
  (세션 생성 시 situation 값 검증이 이 객체 기반이라 별도 백엔드 검증 코드 수정 불필요),
  시스템 프롬프트의 상황 인식 섹션에 두 상황의 톤 가이드 추가.

## 3. "그냥 대화" 모드에서 음악 페르소나 컨셉 제거

- 기존엔 상황을 고르지 않아도 시스템 프롬프트에 "음악을 깊이 아는 친구" 페르소나가
  항상 포함되어, 기본 인사말도 "너의 플레이리스트 친구야"였음.
- `geminiService.js`의 시스템 프롬프트를 세 블록으로 분리:
  - `BASE_INSTRUCTION`: 톤/응답 형식 등 공통 규칙.
  - `SITUATION_PERSONA_INSTRUCTION`: 상황을 직접 선택했을 때만 붙는 음악 친구
    페르소나 + 상황별 톤 가이드.
  - `GENERAL_CHAT_INSTRUCTION`: 상황 미선택("그냥 대화") 시 컨셉 없이 평범한
    대화 상대로만 행동하도록 하는 지침.
  - `buildSystemInstruction(situation)`이 `situation`이 없으면
    `BASE + GENERAL_CHAT`만, 있으면 `BASE + SITUATION_PERSONA + 세션 상황`을 조합.
- `front/src/AirPodsLog.jsx`의 기본 인사말도 "플레이리스트 친구" 문구를 빼고
  "안녕, 오늘 하루는 어땠어?"로 단순화.

## 4. TTS 429(쿼터 초과) 진단 및 모델 교체

- 실행 로그에서 `postTts → synthesizeSpeech` 호출 시
  `RESOURCE_EXHAUSTED` 429 확인. 에러의 `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
  `model: gemini-2.5-flash-tts`, `quotaValue: 10`으로 봤을 때 무료 티어 **일일** 한도
  소진이며, 응답에 딸려온 "36초 후 재시도" 안내는 일일 한도엔 의미 없는 기본 backoff임을 확인.
- 채팅/STT(`MODEL = 'gemini-flash-latest'`)와 TTS(`TTS_MODEL`)는 서로 다른 모델이라
  쿼터도 분리되어 있음을 코드로 확인. `ai.models.generateContent`를 직접 호출해
  `gemini-flash-latest`가 실제로 `gemini-3.6-flash`(최신 세대)로 응답함을 검증 —
  즉 채팅 쪽은 이미 최신 모델을 쓰고 있었고, TTS만 `gemini-2.5-flash-preview-tts`로
  하드코딩되어 있어 구버전에 머물러 있었던 것.
- `ai.models.list()`로 사용 가능한 flash 계열 모델 목록을 조회해 최신 TTS 후보
  (`gemini-3.1-flash-tts-preview`) 확인 후, 실제 `generateContent` 호출로 기존
  요청 포맷(`responseModalities: AUDIO`, `speechConfig.voiceConfig`)이 그대로
  호환됨을 검증(`audio/l16; rate=24000` 정상 수신).
- `TTS_MODEL`을 `gemini-2.5-flash-preview-tts → gemini-3.1-flash-tts-preview`로 교체.
- 다만 웹 검색으로 확인한 결과, 새 모델이 "더 넉넉한 쿼터"라는 보장은 없음
  (커뮤니티 리포트 중 `limit: 3`이 언급된 사례도 있어, 기존 2.5 모델의 관측치인
  10보다 오히려 낮을 수 있음). 별도 쿼터 버킷으로 옮겨서 "지금 당장은 다시 쓸 수 있다"는
  정도로만 확인된 상태이며, 정확한 한도는 AI Studio 대시보드
  (`https://aistudio.google.com/rate-limit`)에서 계정별로 확인 필요.

## 남은 일 / 미해결

- 실행 로그에 계속 뜨는 `PGRST205 - Could not find the table 'public.user_settings'`
  (Supabase에 해당 테이블 없음)는 이번 세션에서 다루지 않음. 쿼터 이슈와는 무관.

