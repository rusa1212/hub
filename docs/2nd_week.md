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
