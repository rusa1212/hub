# 음성 미리듣기(Voice Preview) 기능 추가 계획
 
## 개요
설정(Settings) 화면의 "음성 선택" 항목에 미리듣기 기능을 추가한다.
Week 3 백로그에 있던 "음성 선택 + 미리듣기 UI" 항목을 구현하는 작업.
 
---
 
## 1. 위치
- 신규 화면 아님. **기존 설정(Settings) 페이지 내 음성 선택 섹션**에 통합.
- 로그인/회원가입과 함께 이미 구현된 설정 기능 안에 자연스럽게 추가.
---
 
## 2. 프론트엔드 (React)
 
- 설정 페이지 컴포넌트 내 음성 목록 UI 추가
  - 드롭다운 또는 카드 리스트 형태
  - 각 음성 항목 옆에 "▶ 미리듣기" 버튼 배치
- 클릭 시 동작
  - `/api/tts` 프록시 엔드포인트를 짧은 고정 샘플 문장으로 호출
  - 기존 TTS 재생 로직(WAV 헤더 첨부 후 재생) 재사용
- 상태 관리
  - 전역 상태 불필요, 컴포넌트 로컬 state로 "현재 재생 중인 voice" 관리
- UX 주의사항
  - 미리듣기 버튼 연타 방지 (debounce 또는 로딩 상태 표시)
  - 재생 중에는 버튼을 로딩/비활성 상태로 전환
---
 
## 3. 백엔드 (Express)
 
- 기존 `/api/tts` 엔드포인트 확장
  - `voice` 파라미터를 받아 Gemini TTS(`gemini-2.5-flash-preview-tts`) 호출 시 반영
- (선택) ElevenLabs 병행 사용 시
  - provider 구분 필드 필요 (`services/tts.js` 등에서 provider별 분기 처리)
  - 한국어 지원 여부 확인 후 적용
---
 
## 4. DB (Supabase)
 
- `user_settings` 테이블에 컬럼 추가
  - 예: `selected_voice_id` (선택한 voice ID 저장)
- 기존 테이블 스키마 확장만으로 충분, 신규 테이블 불필요
---
 
## 5. 미리듣기 샘플 텍스트
 
- 매번 LLM을 거치지 않고 **고정 문구로 TTS만 즉시 호출** → 지연시간 최소화
- 예시 문구: "안녕하세요, 저는 ○○입니다."
---
 
## 6. 체크리스트
 
- [x] 설정 페이지에 음성 목록 + 미리듣기 버튼 UI 추가 (카드 리스트, `SettingsScreen.jsx`)
- [x] `/api/tts`에 voice 파라미터 반영 (기존 구현 확인, `ttsController.js` / `geminiService.js`)
- [ ] (선택) ElevenLabs provider 분기 처리 — 범위 밖, 미착수
- [x] `user_settings` 테이블에 voice 선택 컬럼 추가 (`backend/sql/003_user_settings.sql`, `/api/settings` GET·PUT)
- [x] 미리듣기용 고정 샘플 문구 정의 (`front/src/voices.js`의 `PREVIEW_TEXT`)
- [x] 버튼 연타 방지 로직 (미리듣기 중엔 모든 버튼 비활성화, `SettingsScreen.jsx`)
 