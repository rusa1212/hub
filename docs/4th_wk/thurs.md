# 에어팟 로그 — 작업 로그 (목요일)

## 1. Gemini 응답 길이 제한 제거

- `backend/src/services/geminiService.js`의 `generateReply`에 있던 `maxOutputTokens: 800`
  (전날 300 → 800으로 완화했던 값) 자체를 제거. 레이턴시보다 응답이 중간에
  부자연스럽게 끊기는 문제를 우선시하기로 함.

## 2. STT/TTS 사용 한도(429) 초과 시 텍스트 전용 폴백

- `front/src/api.js`: `request()`와 `synthesizeSpeech()`가 실패 시 던지는 에러에
  HTTP 상태 코드(`err.status`)를 담도록 수정 (기존엔 메시지 텍스트뿐이라 429인지
  구분 불가했음).
- `front/src/AirPodsLog.jsx`: STT(`processVoiceMessage`) 또는 TTS(`playReply`) 호출이
  429로 실패하면 `disableVoice()`가 발동 →
  - 마이크 루프 정지(`conversationActiveRef = false`), "🔇 음성 사용 한도를 다 써서
    지금은 텍스트로만 대화할 수 있어요" 안내를 1회만 표시.
  - `localStorage`(`airpodslog.voiceDisabledUntil`)에 30분 쿨다운을 저장해, 새로고침해도
    바로 재시도해서 또 걸리는 일이 없게 함.
  - 쿨다운 동안은 `startListening`/`speakThenContinue`/`handleSelectSituation`이 모두
    이 플래그를 확인해 마이크 권한 요청·STT·TTS 자체를 시도하지 않고 곧장 텍스트 대화
    (`idle` 상태)로 유지.
  - 상태 표시줄/마이크 버튼 툴팁에도 "음성 사용 한도 초과" 문구 반영.
- 참고로 Gemini 429는 RPD(일일 한도)와 RPM(분당 한도) 모두 같은 코드로 오므로, 정확히
  어느 쪽인지는 백엔드 `errorHandler.js`의 `console.error(err)` 로그에 찍히는
  `quotaId`(`...PerDay...` vs `...PerMinute...`)와 `retryDelay`로 구분해야 함 — 코드 상
  둘을 구분하지 않고 동일한 30분 쿨다운으로 처리.

## 3. Supabase `user_settings` 테이블 부재(PGRST205) 진단/해결

- 터미널에 `Could not find the table 'public.user_settings'` 확인. 원인은
  `backend/sql/003_user_settings.sql` 마이그레이션이 실제 Supabase 프로젝트에는
  아직 실행되지 않았던 것(001, 002는 이미 실행됨).
- 사용자가 Supabase 대시보드 SQL Editor에서 직접 실행 → 로그인 사용자의 음성 선택이
  서버에 정상 저장/동기화되기 시작함 (`front/src/SettingsContext.jsx`).

## 4. 좌측 슬라이드 사이드바 도입

- 로그인/회원가입, 설정, 기록 보기를 홈 화면 상단에 흩어져 있던 버튼들 대신 좌측에서
  슬라이드로 열리는 사이드바로 통합 (사용자가 "슬라이드 드로어" 방식 선택).
- `front/src/AirPodsLog.jsx`: `sidebarOpen` 상태 + `Sidebar` 컴포넌트 추가(로그인 상태/
  기록 보기/설정/로그아웃), 라우트 변경 시 자동으로 닫힘. 햄버거(☰) 버튼을 홈 화면,
  `/situation` 화면, 채팅 화면 헤더 세 곳 모두에 배치.
- `front/src/AirPodsLog.css`: `.hamburger-button`, `.sidebar`, `.sidebar-backdrop` 등
  추가, `.app-window`에 `position: relative` 부여(사이드바 anchor 기준).
- 이제 안 쓰는 `.auth-status-bar`/`.auth-status-login`(Auth.css), `.settings-button`
  (Settings.css) 규칙 정리.

## 5. UI 디자인 폴리시 ("심심하다"는 피드백 반영)

- `index.html` / `index.css`: Google Fonts로 `Space Grotesk`(헤딩), `JetBrains Mono`
  (라벨) 추가. 한글 글리프가 없는 라틴 전용 폰트라 한글 텍스트는 자동으로 기존 시스템
  고딕으로 폴백되고, "AirPods Log" 같은 라틴 타이틀/숫자에만 적용됨.
- 홈 화면 🎧 이모지 아이콘을 5개 막대가 서로 다른 위상으로 움직이는 커스텀 파형 SVG
  (틸/골드 배색)로 교체 (`.wave-bar`, `@keyframes wave-bounce`).
- 홈/상황 선택 화면에만 있던 은은한 글로우 연출(`home-glow-pulse`)을 채팅 화면
  `.messages-area`까지 확장.
- 채팅 메시지 버블에 등장 애니메이션(`msg-pop-in`) 추가. `prefers-reduced-motion`
  사용자는 모든 신규 애니메이션이 자동으로 꺼지도록 처리.

## 6. 대화 한 줄 요약 (신규 기능)

- `backend/sql/004_session_summary.sql`(신규): `sessions` 테이블에 `summary` 컬럼 추가.
  사용자가 Supabase 대시보드에서 직접 실행 완료.
- `backend/src/services/geminiService.js`: `summarizeSession(history)` 추가 — 세션
  히스토리 + "한국어 한 문장으로 요약해줘" 지시문을 붙여 별도 `generateContent` 호출.
- `backend/src/services/sessionStore.js`: `setSessionSummary`, `getSessionsByUser`
  select에 `summary` 포함.
- `backend/src/controllers/sessionController.js` / `routes/session.js`:
  `POST /api/session/:id/summary` (requireAuth, 본인 세션만) 추가. 히스토리가
  비어있으면(메시지 한 번도 없이 종료) 204로 스킵.
- `front/src/api.js`: `summarizeSession(sessionId)` 추가.
- `front/src/AirPodsLog.jsx`: `handleEndConversation`에서 로그인 사용자에 한해
  백그라운드로 호출(화면 전환은 막지 않음, 실패해도 조용히 무시).
- `front/src/HistoryScreen.jsx` / `Auth.css`: 기록 목록에 요약 한 줄 표시
  (`.history-item-summary`).

## 7. 지난 대화 이어하기 (신규 기능)

- `front/src/situations.js`: `SITUATION_META_BY_ID`를 공용 export로 분리
  (기존 `HistoryScreen.jsx`에 중복 정의돼 있던 것을 재사용하도록 정리).
- `front/src/AirPodsLog.jsx`:
  - 홈 화면 진입 시(`location.pathname === '/'`, 로그인 상태) `getMySessions()`로
    조회해 `last_active_at !== created_at`(=메시지가 실제로 오간 적 있는) 세션 중
    가장 최근 것을 `lastSession`으로 저장.
  - 홈 화면 CTA 버튼 아래에 "'○○' 대화 이어하기" 카드(`.resume-card`) 표시, 요약이
    있으면 미리보기로 같이 노출.
  - `handleResumeSession`: 새 세션을 만들지 않고 `getSessionDetail`로 기존 히스토리를
    불러와 화면에 복원. 과거 메시지는 TTS로 다시 읽어주지 않고(음성 quota 절약)
    텍스트로만 복원한 뒤 바로 LISTENING(또는 텍스트 폴백)으로 진입.
- DB 스키마 변경 없음(별도 SQL 실행 불필요).

## 8. 연속 사용일 스트릭 (신규 기능)

- `front/src/HistoryScreen.jsx`: `computeStreak(sessions)` 추가 — `last_active_at !==
  created_at`(메시지가 실제로 오간) 세션들의 `last_active_at`을 로컬 날짜(YYYY-MM-DD)
  집합으로 모은 뒤, 오늘부터(오늘 대화 안 했으면 어제부터) 거슬러 연속으로 존재하는
  날짜 수를 셈. DB 스키마 변경이나 추가 API 호출 없이 이미 불러온 세션 목록만으로 계산.
- 기록 보기 화면 헤더 아래에 "🔥 N일 연속 대화 중" 배지(`.streak-badge`)로 표시,
  스트릭이 0이면 표시 안 함.

## 남은 일 / 미해결

- STT/TTS 429가 RPD/RPM 중 어느 쪽인지 코드에서 자동 구분하진 않음(현재는 둘 다
  동일하게 30분 쿨다운 처리).
- 스트릭은 세션의 `last_active_at` 하루 단위로만 판단 — 자정을 걸쳐 이어진 대화 등
  엣지 케이스는 정밀하게 다루지 않음(메시지별 타임스탬프까지는 조회하지 않음).
