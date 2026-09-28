// 뽀모도로('집중 모드' 상황 전용, SituationEnhancementPlan.md 3-4): 세션 시작 시각 기준으로
// 집중/휴식 경계마다 고정 문구로 짧게 알려준다 (LLM 호출 없이 TTS 1회만 소모).
// 탭이 백그라운드로 가면 setTimeout이 늦게 실행될 수 있으므로 경과 시간은 항상 Date.now() 차이로 계산한다.
import { useEffect, useRef, useState } from 'react';

const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

function isValidMinutes(value) {
  return Number.isFinite(value) && value >= MIN_MINUTES && value <= MAX_MINUTES;
}

// personas.features에서 뽀모도로 설정을 꺼낸다. 없거나 형식이 틀리면 null(기능 꺼짐).
export function getPomodoroConfig(features) {
  const focusMinutes = features?.pomodoro?.focusMinutes;
  const breakMinutes = features?.pomodoro?.breakMinutes;
  if (!isValidMinutes(focusMinutes) || !isValidMinutes(breakMinutes)) return null;
  return { focusMs: focusMinutes * 60 * 1000, breakMs: breakMinutes * 60 * 1000 };
}

// 경과 시간(elapsedMs)이 몇 번째 경계를 지났고(index, 0 = 아직 첫 집중 중) 지금 어느 구간인지.
export function getPomodoroPosition(elapsedMs, { focusMs, breakMs }) {
  const cycleMs = focusMs + breakMs;
  const inCycle = elapsedMs % cycleMs;
  const onBreak = inCycle >= focusMs;
  return {
    index: Math.floor(elapsedMs / cycleMs) * 2 + (onBreak ? 1 : 0),
    phase: onBreak ? 'break' : 'focus',
  };
}

// 다음 경계까지 남은 시간
export function getMsUntilNextBoundary(elapsedMs, { focusMs, breakMs }) {
  const inCycle = elapsedMs % (focusMs + breakMs);
  return inCycle < focusMs ? focusMs - inCycle : focusMs + breakMs - inCycle;
}

// 새로 들어간 구간(phase)을 알리는 고정 문구
export function getPomodoroAnnouncement(phase, { focusMs, breakMs }) {
  const focusMinutes = Math.round(focusMs / 60000);
  const breakMinutes = Math.round(breakMs / 60000);
  return phase === 'break'
    ? `${focusMinutes}분 집중했어. ${breakMinutes}분 쉬었다 하자.`
    : `쉬는 시간 끝. 다시 ${focusMinutes}분 집중해보자.`;
}

// 알림은 발화 대기(listening + waiting) 중에만 한다. 경계 시점에 응답을 말하거나 처리 중이었다면
// 대기로 돌아온 직후에 알리고, 그 사이 경계를 여러 번 지났다면(백그라운드 등) 현재 구간만 한 번 알린다.
// 음성이 꺼진 상태(voiceDisabled)에선 conversationState가 idle이라 자연히 알림도 건너뛴다.
export function usePomodoro({ focusMs, breakMs, sessionId, conversationState, listeningPhase, onAnnounce }) {
  const startedAtRef = useRef(Date.now());
  const announcedIndexRef = useRef(0);
  const onAnnounceRef = useRef(onAnnounce);
  // 다음 경계 시각에 effect를 다시 돌리기 위한 카운터
  const [tick, setTick] = useState(0);

  useEffect(() => {
    onAnnounceRef.current = onAnnounce;
  });

  useEffect(() => {
    startedAtRef.current = Date.now();
    announcedIndexRef.current = 0;
  }, [sessionId]);

  const waiting = conversationState === 'listening' && listeningPhase === 'waiting';

  useEffect(() => {
    if (!focusMs || !breakMs || !sessionId || !waiting) return undefined;
    const config = { focusMs, breakMs };
    const elapsed = Date.now() - startedAtRef.current;
    const { index, phase } = getPomodoroPosition(elapsed, config);
    if (index > announcedIndexRef.current) {
      announcedIndexRef.current = index;
      onAnnounceRef.current?.(getPomodoroAnnouncement(phase, config));
      return undefined;
    }
    const timer = setTimeout(() => setTick((n) => n + 1), getMsUntilNextBoundary(elapsed, config));
    return () => clearTimeout(timer);
  }, [focusMs, breakMs, sessionId, waiting, tick]);
}
