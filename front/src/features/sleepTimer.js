// 수면 타이머('자기 전' 상황 전용, SituationEnhancementPlan.md 3-3): 사용자가 idleMinutes 동안
// 말하지 않으면 작별 인사 후 대화를 자동 종료한다. 판단 로직은 순수 함수로 분리해 단위 테스트하고,
// AirPodsLog.jsx는 useSleepTimer 훅에 대화 상태만 넘겨주면 된다.
import { useEffect, useRef } from 'react';

export const SLEEP_TIMER_FAREWELL = '푹 자, 내일 또 얘기하자.';

const MIN_IDLE_MINUTES = 1;
const MAX_IDLE_MINUTES = 120;

// personas.features에서 수면 타이머 설정을 꺼낸다. 없거나 형식이 틀리면 null(기능 꺼짐).
export function getSleepTimerIdleMs(features) {
  const idleMinutes = features?.sleepTimer?.idleMinutes;
  if (!Number.isFinite(idleMinutes) || idleMinutes < MIN_IDLE_MINUTES || idleMinutes > MAX_IDLE_MINUTES) {
    return null;
  }
  return idleMinutes * 60 * 1000;
}

// 마지막 활동 시각(lastActivityAt) 이후 남은 시간. 이미 지났으면 0.
export function getSleepTimerRemainingMs(lastActivityAt, now, idleMs) {
  return Math.max(0, idleMs - (now - lastActivityAt));
}

// "활동"은 대화가 한 번 오간 것(listening이 아닌 상태를 거쳐 다시 listening으로 들어온 시점)으로 본다.
// 잡음으로 발화 감지(active)만 됐다가 "소리가 안 들렸어요"로 끝나는 경우는 상태가 listening에
// 머물러 있으므로 활동으로 치지 않는다 — 뒤척이는 소리 때문에 타이머가 계속 늘어나지 않게 하기 위함.
// 타이머는 발화 대기(listening + waiting) 중에만 돌고, 그 외 상태에선 멈췄다가 대기로 돌아오면
// 마지막 활동 시각 기준으로 남은 시간만큼 다시 건다.
// sessionKey가 바뀌면(새 세션 시작, 대화 중 상황 전환) 처음부터 다시 잰다. null이면 꺼짐.
export function useSleepTimer({ idleMs, sessionKey, conversationState, listeningPhase, onExpire }) {
  const lastActivityRef = useRef(Date.now());
  const prevStateRef = useRef(conversationState);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [sessionKey]);

  useEffect(() => {
    if (conversationState === 'listening' && prevStateRef.current !== 'listening') {
      lastActivityRef.current = Date.now();
    }
    prevStateRef.current = conversationState;
  }, [conversationState]);

  const waiting = conversationState === 'listening' && listeningPhase === 'waiting';

  useEffect(() => {
    if (!idleMs || !sessionKey || !waiting) return undefined;
    const remaining = getSleepTimerRemainingMs(lastActivityRef.current, Date.now(), idleMs);
    const timer = setTimeout(() => onExpireRef.current?.(), remaining);
    return () => clearTimeout(timer);
  }, [idleMs, sessionKey, waiting]);
}
