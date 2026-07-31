# 에어팟 로그 — Web Audio API 활용 계획

## 배경 및 목적
음성 파형 시각화(waveform visualization)를 구현하기 위해 Web Audio API를 도입.
용도는 **UX 개선(시각적 피드백)** 이며, STT/LLM/TTS 파이프라인의 응답 속도 자체를
개선하는 것과는 무관함. 스트리밍 파이프라인 작업(지연시간 개선)이 우선순위상 먼저이며,
파형 시각화는 그 다음 단계로 진행.

Web Audio API가 필요한 지점은 두 곳이며, 오디오 소스가 다르므로 구현 방식도 분리됨:
1. 사용자 발화 파형 (마이크 입력, 녹음 중)
2. AI 응답 파형 (TTS 재생 중)

---

## 1. 사용자 발화 파형 — 마이크 입력

기존 STT용 오디오 녹음(MediaRecorder)과 동일한 `getUserMedia` 스트림을 그대로 분기하여
AnalyserNode에 병렬로 연결하는 구조.

```javascript
const audioContext = new AudioContext();
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = audioContext.createMediaStreamSource(stream);

const analyser = audioContext.createAnalyser();
analyser.fftSize = 256; // 파형 해상도, 값이 클수록 세밀하지만 무거움
source.connect(analyser);

const dataArray = new Uint8Array(analyser.frequencyBinCount);

function draw() {
  analyser.getByteTimeDomainData(dataArray); // 파형(waveform)용
  // 또는 analyser.getByteFrequencyData(dataArray); // 주파수 바 그래프용

  // dataArray를 canvas에 그리기
  requestAnimationFrame(draw);
}
draw();
```

**주의사항**
- `source`를 `analyser`에만 연결하고 `audioContext.destination`에는 연결하지 않을 것.
  연결 시 마이크 소리가 스피커로 그대로 나가 하울링 발생.
- 하나의 `getUserMedia` 스트림을 MediaRecorder(전송용)와 AnalyserNode(시각화용)에
  동시에 물리는 구조로 설계.

---

## 2. AI 응답 파형 — TTS 재생

기존 `wav.js`로 WAV 헤더를 붙인 PCM을 재생하는 경로에 AnalyserNode를 추가로 연결.

```javascript
const audioContext = new AudioContext();
const audioElement = new Audio(); // 또는 기존 재생 로직의 audio 엘리먼트
audioElement.src = wavBlobUrl;

const source = audioContext.createMediaElementSource(audioElement);
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;

source.connect(analyser);
analyser.connect(audioContext.destination); // 스피커로 출력해야 하므로 연결

audioElement.play();
// draw() 루프는 위와 동일하게 getByteTimeDomainData 사용
```

**주의사항**
- `createMediaElementSource`는 하나의 audio 엘리먼트당 한 번만 호출 가능.
  재생마다 새 Audio 인스턴스를 만들거나 소스 노드를 재사용하는 구조로 설계할 것.

---

## 렌더링 방식: Canvas vs SVG

매 프레임 다시 그려야 하므로 **Canvas 2D** 사용을 권장.
- SVG는 DOM 노드를 매 프레임 재생성/업데이트해야 하므로 성능 저하 발생.
- React 환경에서는 canvas ref를 잡고 `useEffect` 내에서 `requestAnimationFrame` 루프를
  실행, 언마운트 시 `cancelAnimationFrame`으로 정리하는 패턴 사용.

---

## 핵심 원칙 (재확인)
- Web Audio API는 순수 시각화/재생 도구이며 **생성 지연시간을 줄이지 않음**.
- 파형은 "TTS 응답이 도착한 뒤 재생되는 동안"의 시각적 피드백일 뿐, STT→LLM→TTS
  파이프라인 자체의 체감 속도와는 별개 문제.
- 스트리밍 파이프라인 작업(응답 속도 개선)을 먼저 진행하고, 파형 시각화(UX 개선)는
  그 다음 단계로 진행할 것. 두 작업을 동시에 진행하면 "파형은 예쁜데 여전히 오래
  기다린다"는 결과가 나올 수 있음.

---

## 구현 체크리스트
- [x] 마이크 입력 스트림에 AnalyserNode 분기 (MediaRecorder와 병렬 연결)
      → `AirPodsLog.jsx`의 `startSilenceWatcher`. 무음 감지(VAD)용으로 이미 만들어둔
      AnalyserNode(`micAnalyserRef`)를 파형 그리기와 공유.
- [x] 파형 그리기용 Canvas 컴포넌트 작성 (requestAnimationFrame 루프)
      → `waveform-canvas` + 전용 `useEffect`(draw 루프). 라우트가 `/chat`으로 바뀔 때마다
      canvas가 새로 mount되므로 `location.pathname`을 의존성으로 둬서 루프를 재부착.
- [x] TTS 재생 경로에 AnalyserNode 추가 (audio 엘리먼트 재사용 이슈 처리)
      → `ensureTtsAnalyser`: 앱 전체에서 재사용하는 단일 `<audio>` 엘리먼트에 대해
      `createMediaElementSource`를 최초 1회만 호출하고 이후 응답부터는 재사용.
- [x] 사용자 발화 파형 / AI 응답 파형 UI 상태 분리 (녹음 중 vs 재생 중)
      → draw 루프에서 `conversationState`가 `listening`이면 마이크 파형(teal),
      `speaking`이면 TTS 파형(gold), 그 외엔 중앙 직선으로 분리 렌더링.
- [x] 언마운트/재생 종료 시 AudioContext 및 애니메이션 루프 정리
      → 마이크 쪽은 `stopSilenceWatcher`(매 LISTENING 종료 시), TTS/파형 쪽은 컴포넌트
      언마운트 시 `ttsAudioContextRef`/`waveformRafRef` 정리.

파형 시각화가 구현됨에 따라, fixPlan.md의 이슈 2/3 체크리스트에 남아있던
"파형 시각화 파이프라인과 통합" 항목도 함께 완료됨.