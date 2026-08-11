# Barge-in (끼어들기) 기능 기획

## 1. 목적

TTS 응답 재생 중 사용자가 다시 말을 시작하면, 재생을 즉시 중단하고 새로운 사용자 입력을 받는다.
음성 UI에서 체감 반응성을 가장 크게 좌우하는 기능이며, "말이 끝날 때까지 기다려야 하는" 현재 흐름의 답답함을 해소하는 것이 목표.

---

## 2. 현재 파이프라인 (기준점)

```
MediaRecorder → webm/opus → WAV 변환 → /api/stt → /api/chat (세션 히스토리) → /api/tts → WAV 재생 (Web Audio API)
```

현재는 TTS 재생 중에는 마이크 입력을 받지 않는 turn-based 구조로 추정됨. Barge-in은 이 재생 구간에 마이크를 동시에 열어두는 구조로 바꾸는 작업.

---

## 3. 핵심 설계 문제

### 3-1. 에코 문제 (자기 목소리 재입력)
- 스피커로 나오는 TTS 음성이 마이크로 다시 들어와 STT가 오작동할 위험
- 브라우저 환경이므로 하드웨어 AEC(Acoustic Echo Cancellation)에 의존해야 함
  - `getUserMedia`의 `echoCancellation: true` 옵션 필수 확인
  - 에어팟 등 이어폰 사용 시에는 실제로 스피커 출력이 마이크로 되먹임되지 않으므로 리스크가 낮음 (오히려 스피커 모드 사용 시가 문제)
- 대안: 에너지 임계값(VAD, Voice Activity Detection) 기반으로 "재생 중 음성 크기가 일정 이상일 때만" 끼어들기로 인정 → 오탐 줄이기

### 3-2. 끼어들기 감지 시점
- 옵션 A: 볼륨 임계값 기반 간단 VAD (Web Audio API AnalyserNode로 이미 waveform 시각화 중이므로 재사용 가능)
- 옵션 B: 별도 STT 스트리밍으로 실시간 감지 (정확하지만 API 호출 비용/지연 증가)
- 1차 구현은 **옵션 A**로 시작 (기존 AnalyserNode 인프라 재사용 가능 → effort 낮음)

### 3-3. 중단 시 처리 범위
- TTS 재생 중단 (Web Audio API 재생 정지)
- 진행 중인 `/api/tts` fetch 요청 중단 (AbortController)
- LLM 응답이 아직 스트리밍/생성 중이라면 해당 요청도 중단할지 결정 필요
- 중단된 응답을 세션 히스토리(`messages` 테이블)에 어떻게 기록할지 (부분 응답 저장 여부)

---

## 4. 작업 범위 (Scope)

### Phase 1: 기본 감지 + 중단
- [x] TTS 재생 중 마이크 스트림 동시 오픈 (`getUserMedia` echoCancellation 옵션 점검)
  - `front/src/AirPodsLog.jsx`의 `startBargeInWatcher()` — `echoCancellation: true` 명시
- [x] 기존 AnalyserNode 기반으로 음량 임계값 감지 로직 작성 (`bargeInThreshold`, 최소 지속 시간 등 파라미터화)
  - 순수 로직은 `front/src/bargeIn.js`(`computeAmplitude`, `createBargeInDetector`, `BARGE_IN_THRESHOLD`/`BARGE_IN_SUSTAIN_MS`)로 분리해 `front/src/bargeIn.test.js`로 단위 테스트 (정상/빈값/경계값/오탐 방지 케이스 15개)
- [x] 임계값 초과 감지 시:
  - [x] 현재 TTS 재생 정지 — 실제 구현은 `AudioBufferSourceNode`가 아니라 `<audio>` 엘리먼트(`audioPlayerRef`) 기반이라 `stopTtsPlayback()`에서 `player.pause()`로 처리 (기획 문서 작성 시점엔 재생 방식을 오인했던 부분, 코드 기준으로 정정)
  - [x] 진행 중인 `/api/tts` 요청 AbortController로 취소 — `api.js`의 `synthesizeSpeech(text, voice, { signal })`에 signal 전달 추가, `api.test.js`로 검증
  - [x] 새로운 녹음(MediaRecorder) 즉시 시작 — `handleBargeIn()`에서 `startListening()` 호출

### Phase 2: 상태 관리 및 UX 피드백
- [ ] 대화 상태 머신에 `interrupted` 상태 추가 (idle → listening → thinking → speaking → interrupted → listening)
- [ ] 끼어들기 성공 시 짧은 사운드 큐 또는 웨이브폼 색상 변화로 피드백
- [ ] 오탐(잡음 등으로 오작동) 시 복구 로직 — 일정 시간 내 실제 STT 발화 없으면 원래 응답 재생 재개할지 / 그냥 새로 듣기 모드로 전환할지 결정

### Phase 3: 세션 히스토리 처리
- [ ] 중단된 TTS 응답의 텍스트를 `messages` 테이블에 어떻게 기록할지 (전체 텍스트 vs 재생된 부분까지만 vs 중단 플래그 추가)
- [ ] 중단 이벤트 자체를 로깅할지 여부 (디버깅/분석 목적)

### Phase 4: 스트리밍 TTS와의 통합 (추후)
- 현재 로드맵에 있는 "문장 단위 스트리밍 TTS"와 barge-in은 함께 설계해야 함
- 스트리밍 구조에서는 문장 단위로 TTS 청크가 재생되므로, 중단 시 "다음 문장 재생 전 체크" 방식으로 훨씬 자연스럽게 구현 가능
- **따라서 barge-in의 완성형 구현은 스트리밍 TTS 파이프라인 설계와 함께 가는 것을 권장** (Phase 1~3은 현재 구조에서도 선행 가능한 MVP)

---

## 5. 열린 질문 (결정 필요)

1. 끼어들기 감지를 음량 임계값(VAD)으로만 할지, STT 스트리밍까지 갈지 — 초기엔 임계값으로 시작 제안
2. 스피커 모드 사용 시 에코 문제를 어느 수준까지 방어할지 (에어팟 전용 시나리오로 한정할지)
3. 중단된 대화 내용을 히스토리에 어떻게 남길지 (데이터 정합성 이슈)
4. 오탐 방지를 위한 최소 발화 지속 시간 / 임계값 초기값을 어떻게 잡을지 (실험 필요 — 진단 스크립트로 먼저 테스트 권장)

---

## 6. 예상 Effort 대비 Impact

- Phase 1~2는 기존 AnalyserNode/웨이브폼 인프라를 재사용할 수 있어 상대적으로 effort가 낮음
- Impact는 음성 UI 반응성 체감에 직결되므로 높음
- Phase 4(스트리밍 통합)는 별도 아키텍처 설계가 필요한 고비용 작업이므로, 스트리밍 TTS 플랜과 통합 설계 필요