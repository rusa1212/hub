# Barge-in Phase 2·3 구현 정리

## 1. 작업 목적

TTS 응답 재생 중 사용자가 말을 시작하면 AI 음성을 중단하고, 새 발화를 바로 인식할 수 있도록 Barge-in Phase 2와 Phase 3을 구현했다.

초기 구현 후 끼어들기 시 짧은 발화가 STT에 전달되지 않는 문제도 확인해, Barge-in 감시용 마이크를 프리롤 녹음으로 재사용하도록 개선했다.

---

## 2. Phase 2: 상태 관리 및 UX

### 2-1. `interrupted` 상태 추가

기존 대화 상태 흐름에 `interrupted`를 추가했다.

```text
idle → listening → processing → speaking
                                      ↓
                                 interrupted → listening
```

- `speaking` 중 Barge-in 감지 시 `interrupted`로 전환
- TTS 재생과 진행 중인 `/api/tts` 요청 중단
- 중단 처리 후 `listening`으로 전환
- 상태 ref를 즉시 갱신해 비동기 React state 갱신 중 중복 감지 방지

### 2-2. 시각 피드백

사운드 큐는 사용자 발화와 겹칠 수 있어 사용하지 않고 시각 피드백을 적용했다.

- 상태 점과 웨이브폼을 핑크색으로 변경
- `응답을 멈추고 들을게요` 상태 표시
- 중단된 assistant 메시지에 `음성 중단됨` 라벨 표시
- 이전 대화를 이어할 때도 중단 라벨 복원

### 2-3. 오탐 복구 정책

오탐 후 기존 TTS를 재생하지 않고 새로 듣기 모드를 유지하는 방식을 선택했다.

- 4초 내 유효한 발화가 시작되지 않으면 일반 `listening` 상태로 안정화
- STT가 빈 transcript를 반환하면 원래 응답을 재생하지 않고 다시 녹음
- 이전 TTS를 재개하면 느진 사용자 발화와 겹칠 수 있어 재생 재개는 채택하지 않음

---

## 3. Phase 3: 세션 히스토리

### 3-1. 중단된 assistant 메시지

중단된 응답은 재생된 부분만 잘라 저장하지 않고, 전체 텍스트를 유지하면서 중단 메타데이터를 추가하는 방식을 사용했다.

`messages` 테이블 추가 컬럼:

```sql
interrupted boolean not null default false
interrupted_at timestamptz null
```

- `/api/chat` 응답에 assistant `messageId` 포함
- 프런트에서 현재 TTS로 재생 중인 DB 메시지 ID 추적
- Barge-in 시 해당 메시지만 `interrupted = true`로 갱신
- Gemini에는 ID와 중단 필드를 제거한 `role`, `parts`만 전달

### 3-2. Barge-in 이벤트 로깅

분석과 디버깅을 위해 `conversation_events` 테이블을 추가했다.

저장 데이터:

- 세션 ID
- 중단된 assistant 메시지 ID
- 이벤트 종류: `barge_in`
- 실제 TTS 재생 경과 시간: `metadata.playback_ms`
- 이벤트 발생 시간

추가 API:

```text
POST /api/session/:id/interruption
```

요청 예시:

```json
{
  "messageId": "assistant-message-uuid",
  "playbackMs": 1250
}
```

---

## 4. 음성 인식 실패 개선

### 4-1. 원인

기존 Phase 1 구현은 다음 순서로 동작했다.

```text
Barge-in 감시용 마이크
→ 300ms 지속 발화 확인
→ 감시용 스트림 종료
→ 새 getUserMedia 요청
→ 새 MediaRecorder 시작
```

이 구조에서는 감지와 새 녹음 시작 사이의 음성이 버려진다. `응`, `맞아`, `아니` 같은 짧은 발화는 새 recorder가 시작되기 전에 끝나 STT에 무음이 전달될 수 있었다.

### 4-2. 프리롤 녹음

Barge-in 감시 시점부터 같은 마이크 스트림을 `MediaRecorder` 로 녹음한다.

```text
Barge-in 마이크 + 프리롤 MediaRecorder
→ 300ms 지속 발화 확인
→ TTS 중단
→ 기존 스트림·recorder·음성 청크를 listening으로 핸드오프
→ 발화 첫부분을 포함해 STT 전송
```

개선 효과:

- 새 `getUserMedia` 요청 지연 제거
- Barge-in 감지에 사용된 발화 첫부분 보존
- 감지가 완료된 발화 상태를 VAD에 승계해, 핸드오프 직후 말이 끝나도 무음으로 버리지 않음

### 4-3. 마이크 오디오 제약

일반 녹음과 Barge-in 녹음 모두에 다음 옵션을 명시했다.

```js
{
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}
```

---

## 5. DB 마이그레이션

다음 파일을 Supabase Dashboard의 SQL Editor에서 실행해야 한다.

```text
backend/sql/006_barge_in_history.sql
```

마이그레이션이 적용되지 않으면 다음과 같은 오류가 발생한다.

```text
column messages.interrupted does not exist
```

이 오류는 코드는 새 컬럼을 조회하지만 Supabase DB에 해당 컬럼이 아직 생성되지 않았다는 뜻이다.

---

## 6. 주요 변경 파일

### Frontend

- `front/src/AirPodsLog.jsx`
  - `interrupted` 상태
  - Barge-in UI 피드백
  - 현재 재생 메시지 추적
  - 프리롤 recorder 핸드오프
  - 오탐 복구
- `front/src/AirPodsLog.css`
  - 중단 상태 색상과 메시지 라벨
- `front/src/api.js`
  - 중단 이벤트 API
- `front/src/api.test.js`
  - 중단 API 요청 검증
- `front/src/AirPodsLog.bargeIn.test.jsx`
  - Barge-in 상태, TTS abort, 녹음 핸드오프, 이벤트 저장 검증

### Backend

- `backend/src/controllers/chatController.js`
  - assistant `messageId` 반환
- `backend/src/controllers/sessionController.js`
  - 중단 이벤트 엔드포인트
- `backend/src/routes/session.js`
  - `/api/session/:id/interruption` 라우트
- `backend/src/services/sessionStore.js`
  - 중단 메시지 갱신과 이벤트 저장
- `backend/src/services/geminiService.js`
  - Gemini에 전달할 히스토리 스키마 정리
- `backend/sql/006_barge_in_history.sql`
  - 중단 컬럼과 이벤트 테이블 생성

---

## 7. 검증 결과

- Frontend Vitest: 4개 파일, 38개 테스트 통과
- Frontend lint: 통과
  - 작업과 무관한 기존 warning 3개 존재
- Vite production build: 성공
- Backend 변경 파일 Node.js 문법 검사: 통과
- `git diff --check`: 통과

실제 물리 마이크 테스트는 브라우저 세션에 연결되지 않아 수행하지 못했다. 개발 서버 재시작 후 AI 발화 중 `응`, `맞아`, `아니` 같은 짧은 문장으로 최종 장치 테스트가 필요하다.

---

## 8. 실패 문구별 확인 포인트

음성 인식이 계속 실패할 경우 화면 문구로 단계를 구분할 수 있다.

| 화면 문구 | 실패 단계 | 우선 확인 대상 |
|---|---|---|
| `소리가 잘 안 들렸어요` | Frontend VAD에서 발화를 확인하지 못함 | 마이크 권한, 입력 장치, VAD 임계값 |
| `음성을 알아듣지 못했어요` | 녹음과 STT 요청은 완료됐지만 transcript가 빈 문자열 | 녹음 품질, 발화 유실, STT 응답 |
| `지금은 응답을 받아올 수 없어요` | WAV 변환, 네트워크, STT API 오류 | 브라우저 console, `/api/stt` 응답 코드, backend log |

