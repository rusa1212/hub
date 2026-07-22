# 에어팟 로그 (AirPods Log) 개발 로드맵

웹 구성: React (Frontend) + Express (Backend)
핵심 흐름: 사용자 입력 → STT → Gemini LLM → Voice Cloning TTS → 에어팟 음성 출력 (연속 대화)

---

## 1주차. 사전 준비 (개발 착수 전)

React와 Express를 기본 개발 환경으로 확정. 본격적인 개발은 2주차부터 시작하되, 환경은 1주차에 미리 잡아둠

Git 저장소 생성 (모노레포 구조 추천: `/client`, `/server`)
`.env` 관리 방식 결정 (API 키는 반드시 서버 쪽 `.env`에만 저장, `.gitignore` 처리)
사용할 API 키 발급
- Google AI Studio에서 Gemini API 키 발급
- Voice Cloning TTS API 키 발급 (선택한 모델에 따라)
개발 환경 통일 (Node.js 버전, 패키지 매니저 npm/yarn/pnpm 중 택1)

디렉토리 구조 조사 및 확정
- React(Vite) 프론트엔드 폴더 구조 (components, hooks, pages 등 분리 기준)
- Express 백엔드 폴더 구조 (routes, controllers, services 등 분리 기준)

필요한 라이브러리 조사 및 확정
- 프론트: 오디오 녹음/재생 관련 라이브러리, 상태관리 라이브러리 필요 여부
- 백엔드: Gemini SDK, STT/TTS 관련 SDK, 오디오 처리(`ffmpeg` 등) 라이브러리

컨벤션 및 커밋 로그 규칙 정의
- 코드 스타일 (ESLint/Prettier 설정 여부)
- 브랜치 전략 (예: main/dev/feature 분기 방식)
- 커밋 메시지 규칙 (예: `feat:`, `fix:`, `docs:` 등 태그 방식)
- 폴더/파일 네이밍 규칙

개발 착수 전 추가로 결정할 사항이 있는지 점검
- API 응답 형식(JSON 스키마) 통일 여부
- 에러 핸들링 공통 규칙
- 환경별(로컬/배포) 설정 분리 방식

위에서 정한 내용을 `CLAUDE.md` (또는 `AGENTS.md`)에 프로젝트 맥락으로 기록
- 기술 스택, 디렉토리 구조, 컨벤션, 커밋 규칙 등을 문서화하여 이후 AI 코딩 어시스턴트나 팀원이 참고할 수 있도록 정리

---

## Step 0. 개발 착수 (2주차 시작)

1주차에 정한 환경, 구조, 컨벤션을 기준으로 실제 코드 작성 시작
`CLAUDE.md`(`AGENTS.md`) 내용을 기준으로 디렉토리와 초기 파일 생성

```
airpods-log/
├── client/     # React (Vite)
└── server/     # Express
```

---

## Step 1. 백엔드 기본 골격 (Express)

`express` 프로젝트 초기화 (`npm init`, `express`, `cors`, `dotenv` 설치)
기본 서버 실행 확인 (`GET /health` 헬스체크 라우트)
라우트 구조 설계
```
/api/session       → 대화 세션 생성/조회
/api/chat          → 텍스트 입력 → Gemini 응답 (텍스트) 반환
/api/stt           → 음성 파일 → 텍스트 변환
/api/tts           → 텍스트 + 목소리 옵션 → 음성 파일 반환
```
세션별 대화 히스토리 저장 방식 결정
- MVP: 서버 메모리(간단한 객체/Map) 또는 파일 저장
- 이후 확장 시: Redis, MongoDB 등으로 교체 검토

체크포인트: Postman/Thunder Client로 `/api/chat`에 텍스트를 보내 Gemini 응답 텍스트가 정상 반환되는지 확인

---

## Step 2. Gemini API 연동

`@google/generative-ai` (또는 최신 SDK) 설치
서버에서 Gemini 텍스트 생성 함수 작성
- `responseModalities: TEXT` 설정 (음성은 Gemini가 아니라 별도 Voice Cloning TTS가 담당)
대화 맥락(히스토리) 포함해서 요청하는 로직 구현
- 매 요청마다 이전 turn들을 함께 전달하여 연속 대화 구현
페르소나/시스템 프롬프트 설계
- 사용자 상황(긴장, 무기력 등)에 따라 다른 톤으로 응답하도록 system instruction 작성
응답 지연(latency) 테스트 및 타임아웃 처리

체크포인트: 동일 세션에서 2~3턴 연속 질문을 보냈을 때 이전 맥락을 기억하고 답변하는지 확인

---

## Step 3. STT (음성 → 텍스트) 연동

음성 잡음 감지 로직 정의 (신뢰도 점수 threshold, 또는 별도 잡음 감지 모델/라이브러리)
STT API 선택 및 연동 (Web Speech API로 프론트 처리 vs 서버에서 처리하는 방식 결정)
잡음 감지 시 사용자가 지정한 목소리로 전환하는 분기 로직 구현

체크포인트: 깨끗한 음성 입력 / 잡음 섞인 입력 각각에 대해 분기가 의도대로 동작하는지 확인

---

## Step 4. Voice Cloning TTS 연동

선택한 Voice Cloning 모델 API 키/SDK 연동 (사용자가 조사 중인 모델 확정 후 진행)
목소리 등록 기능 구현
- 사용자가 녹음한 샘플 업로드 → 목소리 프로필 생성 → 프로필 ID 저장
텍스트 + 목소리 프로필 ID → 음성 파일 생성 API 연동
BGM 매칭 로직 구현 (감정 카테고리 → 사전 정의된 BGM 매핑 테이블)
TTS 음성 + BGM 믹싱 처리
- 서버에서 오디오 믹싱 (예: `ffmpeg`) 또는 프론트에서 Web Audio API로 동시 재생

체크포인트: 텍스트 입력 시 사용자가 선택한 목소리 톤으로 BGM과 함께 음성이 출력되는지 확인

---

## Step 5. 프론트엔드 (React + Vite)

프로젝트 초기화 (`npm create vite@latest`)
기본 화면 구성
- 온보딩/목소리 선택 화면 (목소리 프로필 등록 또는 프리셋 선택)
- 대화 화면 (텍스트 입력창 + 음성 녹음 버튼)
- 오디오 재생 컨트롤 (재생/일시정지, 대화 히스토리 표시는 최소화 — 화면 피로도가 컨셉이므로 UI는 심플하게)
Web Audio API로 마이크 녹음 구현
백엔드 API 연동 (`/api/chat`, `/api/stt`, `/api/tts`)
응답 오디오 스트리밍 재생 처리
로딩/대기 상태 UX 설계 (레이턴시 체감 완화용 짧은 효과음이나 애니메이션)

체크포인트: 텍스트 입력 → 음성 응답까지 전체 플로우가 화면 전환 없이 한 화면에서 끊기지 않고 진행되는지 확인

---

## Step 6. 통합 테스트

전체 플로우 E2E 테스트 (입력 → STT → Gemini → TTS → 재생)
연속 대화 시나리오 테스트 (3턴 이상 이어지는 대화)
음성 잡음 상황 테스트 (목소리 전환이 자연스러운지)
예외 처리 확인
- API 응답 지연/실패 시 폴백 메시지
- 민감한 입력(자해, 위기 상황 등) 감지 시 안전장치 동작 확인
실제 에어팟 등 무선 이어폰 환경에서 사용성 테스트

---

## Step 7. 배포

프론트엔드 배포 (Vercel, Netlify 등)
백엔드 배포 (Render, Railway, 또는 자체 서버)
환경 변수 배포 환경에 안전하게 설정
CORS, HTTPS 설정 확인 (마이크 접근은 HTTPS 필수)

---

## Step 8. 추후 고도화 (Phase 1~3 로드맵 연동)

Phase 1: 페르소나/BGM 다양화, 감정 기록 요약 리포트
Phase 2: 실시간 BGM 믹싱 고도화, 학교별 특화 콘텐츠
Phase 3: 로컬 광고 모델, 공간 기반 익명 아카이빙 (프라이버시 검토 선행)

---

## 참고: 우선순위 제안

1주차는 코딩 없이 환경/구조/컨벤션을 정하고 `CLAUDE.md`에 기록하는 데 집중합니다. 2주차부터 본격적인 개발이 시작되며, MVP 데모까지 최소 경로로 간다면 Step 0 → 1 → 2 → 5(텍스트 입력 부분만) → 4 → 3 → 6 순서를 추천합니다. 즉, 텍스트 기반 대화(Gemini)와 목소리 출력(TTS)부터 먼저 완성하고, 음성 입력(STT)과 잡음 감지는 그 다음 단계에서 추가하는 방식이 리스크를 줄일 수 있습니다.