# 음성 미리듣기(Voice Preview) 구현 요약

`docs/3rd_wk/voicepreviewplan.md` 계획을 기반으로 구현한 내용 정리.

---

## 1. 백엔드

### 신규
- `backend/sql/003_user_settings.sql`
  - `user_settings(user_id, selected_voice_id, updated_at)` 테이블 + RLS 정책 3개(select/insert/update, `auth.uid() = user_id`)
  - Supabase 대시보드 SQL Editor에서 **수동 실행 필요** (다른 마이그레이션 파일과 동일한 패턴, 아직 미실행)
- `backend/src/services/settingsStore.js` — `getUserSettings(userId)`, `upsertUserSettings(userId, voice)`
- `backend/src/controllers/settingsController.js` — `getSettings`, `putSettings` (voice 값을 `AVAILABLE_TTS_VOICES`로 검증)
- `backend/src/routes/settings.js` — `GET /api/settings`, `PUT /api/settings` (둘 다 `requireAuth`)

### 수정
- `backend/src/index.js` — `/api/settings` 라우터 등록

### 확인만 함 (기존에 이미 구현되어 있었음)
- `/api/tts`의 `voice` 파라미터 처리 (`ttsController.js`, `geminiService.js`)

---

## 2. 프론트엔드

### 수정
- `front/src/voices.js`
  - 미리듣기용 고정 샘플 문구 `PREVIEW_TEXT` 추가
  - 최초: `"안녕, 나는 너의 플레이리스트 친구야. 이 목소리 어때?"`
  - 사용자 피드백 반영 후: `"안녕, 오늘 하루 어땠어? 편하게 이야기해줘."` (플레이리스트 언급 제거)
- `front/src/api.js` — `getMySettings()`, `updateMySettings(voice)` 추가
- `front/src/SettingsContext.jsx`
  - 로그인 시 서버(`/api/settings`)에서 음성 설정을 불러와 반영
  - `setVoice` 호출 시 로그인 상태면 서버에도 저장 (속도/볼륨은 기존대로 로컬 전용 유지)
- `front/src/SettingsScreen.jsx`
  - 음성 선택 UI를 드롭다운 → **카드 리스트 + 미리듣기 버튼**으로 전환
  - 이후 사용자 피드백 반영: 평소엔 **현재 선택된 음성 1개만 요약 표시**, `음성 선택` 버튼을 눌러야 전체 8개 카드 리스트가 펼쳐지는 방식으로 변경 (`닫기` 링크로 취소 가능)
  - 미리듣기 버튼 클릭 시 `PREVIEW_TEXT`로 `/api/tts` 호출 후 재생, 재생/로딩 중에는 모든 미리듣기 버튼 비활성화(연타 방지)
  - 데이터 보관 정책 안내 문구를 "음성 선택은 로그인 시 서버에도 저장됨"으로 갱신
- `front/src/Settings.css` — `.settings-select` 스타일 제거, `.voice-card-list`, `.voice-card`, `.voice-preview-button`, `.voice-current-row`, `.voice-picker-toggle`, `.voice-picker-close` 스타일 추가

---

## 3. 검증

- `oxlint` — 신규 경고 없음 (기존 패턴과 동일한 경고 1건만 존재)
- `vite build` — 정상 빌드
- `vitest run` — 기존 15개 테스트 통과
- Playwright(임시 설치, 작업 후 제거)로 실제 브라우저 렌더링 확인
  - 접힌 상태(현재 음성만 표시) → `음성 선택` 클릭 시 카드 리스트 펼쳐짐 → 다른 음성(Puck) 선택 시 다시 접힌 상태로 반영되는 흐름 스크린샷으로 확인

---

## 4. 미착수 / 범위 밖

- ElevenLabs provider 분기 처리 — 계획 문서상 선택 항목, 미착수
- `003_user_settings.sql` 마이그레이션의 Supabase 실제 적용 — 코드는 완료, DB 반영은 사용자가 직접 실행 필요

---

## 5. 관련 파일 목록

```
backend/sql/003_user_settings.sql               (신규)
backend/src/services/settingsStore.js            (신규)
backend/src/controllers/settingsController.js    (신규)
backend/src/routes/settings.js                   (신규)
backend/src/index.js                              (수정)

front/src/voices.js                               (수정)
front/src/api.js                                  (수정)
front/src/SettingsContext.jsx                     (수정)
front/src/SettingsScreen.jsx                      (수정)
front/src/Settings.css                            (수정)

docs/3rd_wk/voicepreviewplan.md                   (체크리스트 갱신)
```
