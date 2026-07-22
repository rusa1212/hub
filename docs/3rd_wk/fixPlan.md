# 에어팟 로그 — 수정 사항 정리

## 이슈 1. 페르소나가 대화 끝마다 음악을 추천함

### 문제
의도한 것과 다르게 모든 페르소나가 대화 마지막에 음악 추천으로 마무리하는 패턴이
반복됨. 사용자 입력의 문맥에 맞춰 계속 대화가 이어져야 함.

### 추정 원인
시스템 프롬프트(페르소나 정의) 안에 음악 추천 관련 지시문이나 예시가 있어 모델이
이를 대화 종료 패턴으로 과학습하듯 반복하고 있을 가능성이 높음. 혹은 페르소나
프롬프트에 "대화를 마무리할 때"에 대한 명확한 지침이 없어 모델이 임의로 학습된
패턴(음악 추천 멘트)으로 수렴하고 있을 수 있음.

### 확인할 것
- [x] 현재 페르소나 시스템 프롬프트에 음악/노래 관련 언급이 있는지 전수 확인
      → `geminiService.js`의 `SYSTEM_INSTRUCTION`에서 "음악을 깊이 아는 친구" 정의와
      고정 예시 멘트("이건 집중해야 할 때 딱이야" 등)를 확인, 원인으로 특정함.
- [x] `maxOutputTokens` 등 응답 길이 제한이 "대화 마무리 멘트"를 유도하는지 확인
      → 해당 옵션 자체가 코드에 없어 이 경로는 원인이 아님을 확인.
- [x] 최근 대화 히스토리(슬라이딩 윈도우) 안에 음악 추천 예시가 포함되어 반복
      학습되고 있는지 확인 → `chatController.js`는 세션 히스토리를 자르지 않고
      전체를 그대로 넘기고 있어 슬라이딩 윈도우 자체가 없음을 확인.

### 수정 방향
1. 시스템 프롬프트에서 음악 추천 관련 지시/예시 제거
2. 페르소나 프롬프트에 명시적으로 추가:
   - "대화를 인위적으로 마무리하려 하지 말 것"
   - "사용자가 말한 주제와 맥락을 유지하며 자연스럽게 이어갈 것"
   - 특정 화제(음악 등)로 대화를 유도하지 않기
3. 위 확인 항목에서 원인이 특정된 후, 해당 부분만 수정 (프롬프트 전체를 갈아엎지
   않고 최소 변경으로 검증)
4. 수정 후 다양한 입력으로 반복 테스트하여 음악 추천 패턴이 실제로 사라지는지 확인

---

## 이슈 2. 음성 입력 자동 종료 (무음 감지)

### 문제
현재는 사용자가 "녹음 시작"/"녹음 중지" 버튼을 직접 눌러야만 음성 입력이 종료됨.
사용자가 말을 멈추면 자동으로 녹음이 종료되어야 함 (VAD, Voice Activity Detection).

### 구현 방향
이미 계획된 Web Audio API 파형 시각화와 같은 오디오 파이프라인을 공유할 수 있음.
마이크 스트림에 연결한 AnalyserNode의 볼륨 데이터를 파형 그리기뿐 아니라
무음 감지 로직에도 함께 사용.

```javascript
const audioContext = new AudioContext();
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = audioContext.createMediaStreamSource(stream);

const analyser = audioContext.createAnalyser();
analyser.fftSize = 512;
source.connect(analyser);

const dataArray = new Uint8Array(analyser.frequencyBinCount);

const SILENCE_THRESHOLD = 10;   // 볼륨 임계값 (환경/마이크에 따라 튜닝 필요)
const SILENCE_DURATION_MS = 1500; // 무음 지속 시간 (예: 1.5초)

let silenceStart = null;

function checkSilence() {
  analyser.getByteTimeDomainData(dataArray);

  // 평균 진폭 계산 (128을 기준으로 편차 측정)
  const avgAmplitude = dataArray.reduce(
    (sum, v) => sum + Math.abs(v - 128), 0
  ) / dataArray.length;

  if (avgAmplitude < SILENCE_THRESHOLD) {
    if (silenceStart === null) {
      silenceStart = performance.now();
    } else if (performance.now() - silenceStart > SILENCE_DURATION_MS) {
      stopRecording(); // 녹음 종료 트리거
      return;
    }
  } else {
    silenceStart = null; // 소리 감지되면 타이머 리셋
  }

  requestAnimationFrame(checkSilence);
}

checkSilence();
```

### 고려 사항
- **임계값(threshold) 튜닝**: 주변 소음 환경에 따라 오작동 가능. 너무 낮으면
  숨소리에도 반응, 너무 높으면 실제 무음도 감지 못함. 실사용 환경(대학생, 카페/
  기숙사 등 배경 소음)에서 실측 후 조정 필요.
- **최소 발화 시간 보장**: 녹음 시작 직후 바로 무음 판정되지 않도록 최소 녹음
  시간(예: 500ms~1초) 이후부터 무음 감지 로직 활성화.
- **오탐 방지**: 문장 중간의 짧은 정적(생각하는 시간)과 발화 종료를 구분하기
  위해 무음 지속 시간(SILENCE_DURATION_MS)을 충분히 확보 (1~2초 권장, 추후
  사용자 테스트로 조정).
- **수동 중지 버튼은 유지**: 자동 종료가 오작동하거나 사용자가 더 말하고 싶을
  때를 대비해 수동 중지 버튼은 폴백(fallback)으로 남겨둘 것.
- **파형 시각화와 통합**: 동일한 AnalyserNode/dataArray를 파형 그리기와 무음
  감지에 함께 사용하면 별도의 AudioContext를 만들 필요 없이 하나의 파이프라인
  으로 처리 가능.

### 구현 체크리스트
- [x] AnalyserNode 기반 볼륨 측정 로직 작성 (`AirPodsLog.jsx`의 `startSilenceWatcher`)
- [x] 무음 임계값 및 지속 시간 상수 정의 (`SILENCE_THRESHOLD`, `SILENCE_DURATION_MS` — 실사용 환경 테스트 후 추가 튜닝 필요)
- [x] 최소 발화 시간 가드 추가 → 이슈 3의 발화 대기(waiting)/발화 중(active) 서브 상태로
      대체 구현 (녹음 시작 직후 무한정 대기했다가 발화가 감지된 뒤부터만 무음 타이머 시작)
- [x] 무음 감지 시 기존 "녹음 중지" 로직과 동일한 흐름으로 연결 (`stopListeningAndProcess`가
      `mediaRecorderRef.current.stop()` 재사용)
- [x] 수동 중지 버튼 폴백 유지 (LISTENING 중 마이크 버튼 클릭 시 동일한 `stopListeningAndProcess` 호출)
- [x] 파형 시각화 파이프라인과 통합 (AnalyserNode 공유) → docs/3rd_wk/web_audio.md 구현 완료.
      VAD용 `micAnalyserRef`를 파형 그리기(`waveform-canvas`)와 그대로 공유.

---

## 이슈 3. AI 응답 이후 녹음 버튼 없이 자동으로 다시 듣기

### 문제
AI 응답 재생이 끝난 후 사용자가 다시 말하려면 녹음 버튼을 다시 눌러야 함.
버튼 조작 없이 대화가 하나의 루프처럼 자연스럽게 이어져야 함.

### 상태 설계
전체 대화를 하나의 상태 머신으로 관리:

```
IDLE (대화 시작 전)
  ↓ 사용자가 "대화 시작" 버튼 클릭 (최초 1회, 마이크 권한 필요)
LISTENING (듣는 중)
  ↓ 무음 감지 → 녹음 종료
PROCESSING (STT → LLM → TTS 처리 중)
  ↓ TTS 오디오 준비 완료
SPEAKING (AI 응답 재생 중)
  ↓ 재생 종료(오디오 onended)
LISTENING (자동으로 다시 듣기 시작)
```

"대화 시작" 버튼은 최초 1회만 필요함 (브라우저가 `getUserMedia`/`AudioContext`
시작에 사용자 제스처를 요구하기 때문에 완전히 없앨 수는 없음). 이후
SPEAKING → LISTENING 전환은 자동으로 일어나므로 사용자는 버튼을 다시 누를
필요가 없음.

### LISTENING 상태를 두 서브 단계로 분리
기존 무음 감지 로직을 그대로 쓰면 녹음 시작 직후 "아직 말 안 함 = 무음"으로
오인해 바로 종료되는 문제가 발생. LISTENING을 두 단계로 나눠 처리:

1. **발화 대기(waiting for speech)**: 볼륨이 임계값을 넘을 때까지 무한정 대기
2. **발화 중(speech active)**: 볼륨이 한 번이라도 임계값을 넘으면 전환,
   이후부터 기존 무음 지속시간 로직(이슈 2) 적용

```javascript
const STATE = { WAITING_FOR_SPEECH: 'waiting', SPEECH_ACTIVE: 'active' };
let listeningSubState = STATE.WAITING_FOR_SPEECH;
let silenceStart = null;

function checkVoice() {
  analyser.getByteTimeDomainData(dataArray);
  const avgAmplitude = dataArray.reduce((s, v) => s + Math.abs(v - 128), 0) / dataArray.length;

  if (listeningSubState === STATE.WAITING_FOR_SPEECH) {
    if (avgAmplitude > SILENCE_THRESHOLD) {
      listeningSubState = STATE.SPEECH_ACTIVE; // 발화 시작 감지
    }
  } else {
    if (avgAmplitude < SILENCE_THRESHOLD) {
      if (silenceStart === null) silenceStart = performance.now();
      else if (performance.now() - silenceStart > SILENCE_DURATION_MS) {
        stopRecordingAndProcess(); // PROCESSING으로 전환
        return;
      }
    } else {
      silenceStart = null;
    }
  }
  requestAnimationFrame(checkVoice);
}
```

### SPEAKING → LISTENING 자동 전환

```javascript
audioElement.onended = () => {
  setAppState('LISTENING');
  listeningSubState = STATE.WAITING_FOR_SPEECH;
  silenceStart = null;
  startRecording(); // 마이크 다시 활성화, checkVoice() 루프 재시작
};
```

### 놓치기 쉬운 지점
- **재생 중 마이크 비활성화**: SPEAKING 상태에서는 마이크 스트림을 비활성화
  하거나 무시할 것. 에어팟(이어폰) 사용이 기본 시나리오라 스피커 소리가
  마이크로 재입력될 위험은 적으나, 노트북 스피커 테스트 상황을 대비해
  안전장치로 막아둘 것.
- **항상 보이는 수동 종료 버튼**: 자동 루프 오작동이나 사용자가 대화를 완전히
  끝내고 싶을 때를 위해 "대화 종료" 버튼은 상태와 무관하게 항상 눌러
  IDLE로 복귀 가능해야 함.
- **에러 처리**: STT/LLM/TTS 중 하나라도 실패하면 SPEAKING으로 전환되지 못하고
  PROCESSING에 무한정 머무를 수 있음. 타임아웃을 걸어 실패 시 LISTENING
  복귀 또는 에러 안내 후 IDLE 폴백 처리 필요.
- **UI 상태 피드백**: 버튼 조작이 없으므로 사용자가 현재 상태(듣는 중/처리
  중/말하는 중)를 인지하기 어려움. 계획된 파형 시각화가 상태 표시 역할을
  겸하도록 설계 (LISTENING엔 마이크 파형, SPEAKING엔 재생 파형, PROCESSING엔
  로딩 인디케이터).

### 구현 체크리스트
- [x] 대화 전체 상태 머신 정의 (IDLE/LISTENING/PROCESSING/SPEAKING)
      → `AirPodsLog.jsx`의 `conversationState` (`idle|listening|processing|speaking`)
- [x] LISTENING 서브 상태 분리 (발화 대기 / 발화 중)
      → `listeningPhase` (`waiting|active`), `startSilenceWatcher`의 `checkVoice`에서 처리
- [x] TTS 재생 종료(onended) 시 자동으로 LISTENING 재진입
      → `playReply`의 `player.onended` → `speakThenContinue` → `startListening`
- [x] SPEAKING 중 마이크 비활성화 처리
      → 구조적으로 보장됨: LISTENING을 벗어나는 순간 `recorder.onstop`에서 스트림 트랙을
      전부 stop()하므로 PROCESSING/SPEAKING 동안에는 애초에 마이크 스트림이 존재하지 않음
- [x] 항상 노출되는 수동 "대화 종료" 버튼 추가
      → `chat-header`의 "종료" 버튼 (`handleEndConversation`), 상태와 무관하게 항상 렌더링
- [x] STT/LLM/TTS 실패 시 타임아웃 및 폴백 처리
      → `withTimeout` (20초) + `sessionAliveRef`/`conversationActiveRef` 가드로 처리 중 종료를
      눌러도 뒤늦은 응답이 화면/오디오에 반영되지 않도록 처리
- [x] 파형/로딩 인디케이터로 현재 상태 UI 피드백 제공
      → docs/3rd_wk/web_audio.md 구현 완료로 실제 파형이 표시됨: LISTENING엔 마이크
      파형(teal), SPEAKING엔 TTS 응답 파형(gold), 그 외엔 중앙 직선. 텍스트 상태 표시
      (`statusText`)와 "분석 중.../🔊 말하는 중..." 인디케이터도 함께 유지.