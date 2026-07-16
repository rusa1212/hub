## 2주차

### 화요일 (7/14)

React(front) + Express(backend) 개발 착수. agent.md 로드맵 기준 Step 0~2, Step 5 텍스트 부분까지 진행.

**구조**
- 기존 루트에 있던 Vite React 앱을 `front/`로 이동, `backend/` 신설 (모노레포처럼 `hub` 밑에 두 폴더로 분리)
- `backend/`: Express + ESM 골격 — `routes/controllers/services/middleware` 구조

**백엔드**
- `GET /health`, `POST /api/session`, `POST /api/chat` 구현
- `/api/stt`, `/api/tts`는 501 스텁만 (Step 3, 4에서 구현 예정)
- 세션별 대화 히스토리는 메모리(Map)에 저장하는 MVP 방식
- `@google/genai`로 Gemini 연동, 오디오 전용 에이전트 페르소나 system instruction 작성
- `gemini-2.5-flash`가 신규 계정에 막혀 있어서(404) 항상 최신 권장 flash 모델을 가리키는 `gemini-flash-latest`로 교체
- 실제 키로 2턴 이상 연속 대화 테스트 → 맥락 유지 확인 완료

**프론트엔드**
- `vite.config.js`에 `/api` → `localhost:3001` dev proxy 추가
- `src/api.js`(`createSession`, `sendMessage`) 신설, `AirPodsLog.jsx`의 `setTimeout` 가짜 응답 로직을 실제 백엔드 호출로 교체 (텍스트 응답만, 오디오 재생 연출은 제거)
- `docs/design.md`의 다크 + 틸/골드 액센트 디자인 토큰을 `index.css`에 도입하고, `AirPodsLog.jsx`를 인라인 style에서 `AirPodsLog.css` 클래스 기반으로 전환 (사용자=틸, 에이전트=골드로 의미 구분). 미사용 `App.css`는 삭제
- `.env`는 `backend/.env`에만 두고 루트 `.gitignore`에 추가해 커밋 방지

**다음 할 일**: STT(음성 입력), TTS(음성 응답), Voice Cloning 목소리 선택 (Step 3, 4)

### 수요일 (7/15)

STT/TTS 구현 (Step 3, 4). 텍스트 전용이던 대화 흐름에 음성 입력·출력을 붙임.

**백엔드**
- `routes/stt.js`, `routes/tts.js`의 501 스텁을 실제 로직으로 교체, `controllers/sttController.js` / `ttsController.js` 신설 (라우터는 얇게 유지)
- STT: `multer`(메모리 스토리지, 10MB 제한)로 업로드받은 오디오를 base64 인라인 데이터로 Gemini(`gemini-flash-latest`)에 전달, 받아쓰기 전용 프롬프트로 텍스트만 추출
- TTS: `gemini-2.5-flash-preview-tts` 모델에 `responseModalities: AUDIO` + `voiceConfig`(기본 보이스 `Kore`, `.env`의 `GEMINI_TTS_VOICE`로 교체 가능)로 요청
- Gemini TTS는 헤더 없는 raw PCM(16bit mono)만 주기 때문에, 브라우저 `<audio>`가 재생 가능하도록 `utils/wav.js`에서 WAV 헤더를 직접 붙여 반환

**프론트엔드**
- `audioUtils.js` 신설: `MediaRecorder`가 만드는 webm/opus는 Gemini STT가 지원하지 않아서, `AudioContext.decodeAudioData`로 디코딩 후 WAV(PCM)로 재인코딩해서 서버로 전송
- `api.js`에 `transcribeAudio`(FormData POST `/api/stt`), `synthesizeSpeech`(POST `/api/tts`, blob 응답) 추가
- `AirPodsLog.jsx`: 마이크 버튼에 `MediaRecorder` 녹음 로직 연결 → 녹음 종료 시 WAV 변환 → STT → 채팅 전송 → 응답 텍스트를 TTS로 재생까지 한 흐름으로 처리 (`handleMicClick` → `handleVoiceMessage` → `playReply`)
- 텍스트로 보낸 메시지의 에이전트 응답도 동일하게 `playReply`로 TTS 재생 (텍스트/음성 입력 모두 음성 응답)
- 상태 표시: 녹음 중 / 상황 분석 중 / 답변(음성) 준비 중을 상태 점 색상과 헤더 텍스트로 구분, 마이크 버튼 펄스 애니메이션과 "말하는 중..." 말풍선 인디케이터 추가
- 세션 생성 실패, 세션 없이 전송 시도, 마이크 권한 거부 등 실패 케이스에 안내 메시지 폴백 추가

**다음 할 일**: Voice Cloning 목소리 선택 UI, 녹음/재생 관련 QA (긴 발화·잡음 환경 테스트)

### 목요일 (7/16)

`subplan.md` 우선순위 ①~③(페르소나·상황 인식, 온보딩) 진행. 상황 인식 방식은 처음에 대화 문맥 추론으로 구현했다가, "화면에 선택 옵션이 있어야 한다"는 피드백을 받고 UI 선택 방식으로 다시 구현. 화면 전환 시 주소가 바뀌지 않는다는 지적도 받아 라우팅을 추가.

**백엔드**
- `geminiService.js`의 `SYSTEM_INSTRUCTION`을 페르소나("음악을 깊이 아는 친구") · 상황 인식(공부 중/운동 중/자기 전) · 응답 형식(1~3문장) 3개 섹션으로 재작성
- 상황 인식을 대화 텍스트 추론이 아니라 세션 단위로 고정하도록 변경: `sessionStore.createSession(situation)`으로 세션에 저장, `SITUATION_LABELS` + `buildSystemInstruction(situation)`으로 매 응답에 반영
- `POST /api/session`이 `situation`(`studying`/`exercising`/`sleeping`/`null`)을 받아 유효성 검사 후 세션 생성, `chatController`가 매 턴 `session.situation`을 `generateReply`에 전달

**프론트엔드**
- 홈과 채팅 화면 사이에 **상황 선택 화면** 추가 — 📚 공부 중 / 🏃 운동 중 / 🌙 자기 전 / 💬 그냥 대화 4개 버튼. 선택한 상황으로 세션을 생성하고, 상황별 인사말을 채팅에 표시 + TTS로 자동 재생 (온보딩)
- `react-router-dom` 도입 (`BrowserRouter`, `Routes`/`Route`). 홈(`/`) · 상황 선택(`/situation`) · 채팅(`/chat`) 화면에 실제 URL을 부여해 주소가 화면마다 구분되도록 수정. 세션이 없는 상태로 `/chat`에 직접 진입(새로고침 등)하면 홈으로 리다이렉트

**검증**
- 백엔드 직접 호출로 공부 중/운동 중/자기 전 상황 각각 "안녕"만 보내도(문맥 언급 없이) 상황에 맞는 톤·추천이 나오는 것을 확인
- Playwright 헤드리스 브라우저로 홈 → 상황 선택 → 채팅 화면 전환 시 주소창(`/`, `/situation`, `/chat`)이 실제로 바뀌는지, `/chat` 직접 새로고침 시 홈으로 리다이렉트되는지 확인

**발견한 이슈**
- `/api/tts`가 텍스트 내용과 무관하게 500 에러("Model tried to generate text, but it should only be used for TTS") 발생. 같은 시간대 `/api/chat`에서도 503 "high demand" 에러가 한 번 있었던 걸 보면 코드 문제가 아니라 Gemini API 쪽이 불안정했던 것으로 추정 — 온보딩 TTS 자동 재생은 재확인 필요

**다음 할 일**: TTS 안정성 재확인, 목소리 선택 + 미리듣기(subplan 3-1/3-2), 오디오 파형 시각화(2-1)
