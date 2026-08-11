// Barge-in(끼어들기): TTS 재생 중 사용자가 다시 말하기 시작하면 재생을 즉시 중단하고
// 다시 듣기 상태로 전환하기 위한 순수 로직. AnalyserNode/AudioContext 등 브라우저 API는
// AirPodsLog.jsx에서 다루고, 이 파일은 그 값을 입력받아 판단만 하는 부분만 분리해
// (docs/nth_wk/Barkeinplan.md 참고) 단위 테스트가 가능하게 한다.

// 끼어들기로 인정할 최소 음량 (0~128). SILENCE_THRESHOLD(무음 판정, AirPodsLog.jsx)와는
// 목적이 달라 별도 상수로 둔다 — 이쪽은 "재생 중인 소리에도 불구하고 사용자가 말했다"를
// 판단해야 하므로 다소 보수적으로(오탐 방지 위해) 높게 잡는다.
export const BARGE_IN_THRESHOLD = 15;
// 임계값을 넘는 소리가 이만큼(ms) 이상 지속돼야 실제 발화로 인정한다. 너무 짧으면 스피커
// 잡음/순간적인 배경 소음에도 오탐하고, 너무 길면 끼어들기 반응이 굼떠 보인다.
export const BARGE_IN_SUSTAIN_MS = 300;

// AnalyserNode.getByteTimeDomainData()로 채운 dataArray(0~255, 무음일 때 128)로부터
// 평균 진폭(0~128)을 계산한다. AirPodsLog.jsx의 startSilenceWatcher/checkVoice와 동일한
// 공식이라 두 곳(무음 감지, 끼어들기 감지)에서 공유한다.
export function computeAmplitude(dataArray) {
  if (!dataArray || dataArray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += Math.abs(dataArray[i] - 128);
  }
  return sum / dataArray.length;
}

// 매 프레임의 진폭(amplitude)과 현재 시각(now, performance.now() 등)을 넣어주면,
// 임계값(threshold)을 sustainMs 이상 연속으로 넘겼을 때 한 번만 true를 반환하는
// 상태 유지형 감지기를 만든다. rAF 루프 안에서 feed(amplitude, now)로 매 프레임 호출.
//
// 한 번 true를 반환한 뒤에는 호출자가 감지기를 버리고(끼어들기 처리 후 watcher 자체를
// 정지) 새로 만들 것을 기대하므로, 별도의 "재무장(rearm)" 로직은 두지 않는다.
export function createBargeInDetector({
  threshold = BARGE_IN_THRESHOLD,
  sustainMs = BARGE_IN_SUSTAIN_MS,
} = {}) {
  let aboveSince = null;

  return function feed(amplitude, now) {
    if (amplitude > threshold) {
      if (aboveSince === null) {
        aboveSince = now;
      }
      return now - aboveSince >= sustainMs;
    }
    aboveSince = null;
    return false;
  };
}
