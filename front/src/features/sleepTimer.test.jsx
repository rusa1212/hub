import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSleepTimerIdleMs, getSleepTimerRemainingMs, useSleepTimer } from './sleepTimer';
import { renderHookWithProps } from './testHookHarness';

const MIN = 60 * 1000;

describe('getSleepTimerIdleMs', () => {
  it('idleMinutes를 ms로 바꾼다', () => {
    expect(getSleepTimerIdleMs({ sleepTimer: { idleMinutes: 10 } })).toBe(10 * MIN);
  });

  it('설정이 없거나 형식·범위가 틀리면 null(꺼짐)', () => {
    expect(getSleepTimerIdleMs(undefined)).toBeNull();
    expect(getSleepTimerIdleMs({})).toBeNull();
    expect(getSleepTimerIdleMs({ sleepTimer: {} })).toBeNull();
    expect(getSleepTimerIdleMs({ sleepTimer: { idleMinutes: '10' } })).toBeNull();
    expect(getSleepTimerIdleMs({ sleepTimer: { idleMinutes: 0 } })).toBeNull();
    expect(getSleepTimerIdleMs({ sleepTimer: { idleMinutes: 121 } })).toBeNull();
  });
});

describe('getSleepTimerRemainingMs', () => {
  it('마지막 활동 이후 남은 시간을 주고, 지났으면 0', () => {
    expect(getSleepTimerRemainingMs(1000, 4000, 10000)).toBe(7000);
    expect(getSleepTimerRemainingMs(1000, 20000, 10000)).toBe(0);
  });
});

describe('useSleepTimer', () => {
  let onExpire;
  let hook;
  const base = { idleMs: 10 * MIN, sessionKey: 's1', listeningPhase: 'waiting' };

  beforeEach(() => {
    vi.useFakeTimers();
    onExpire = vi.fn();
  });
  afterEach(() => {
    hook?.unmount();
    vi.useRealTimers();
  });

  const render = (props) => {
    hook = renderHookWithProps(useSleepTimer, { ...base, onExpire, ...props });
  };
  const rerender = (props) => hook.rerender({ ...base, onExpire, ...props });
  const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

  it('발화 대기 상태로 idleMs가 지나면 한 번 호출된다', () => {
    render({ conversationState: 'listening' });
    advance(10 * MIN - 1);
    expect(onExpire).not.toHaveBeenCalled();
    advance(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('기능이 꺼져 있거나 세션이 없으면 동작하지 않는다', () => {
    render({ conversationState: 'listening', idleMs: null });
    advance(60 * MIN);
    rerender({ conversationState: 'listening', sessionKey: null });
    advance(60 * MIN);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('응답을 말하는 동안은 멈추고, 대화가 한 번 오가면 처음부터 다시 잰다', () => {
    render({ conversationState: 'listening' });
    advance(8 * MIN);
    rerender({ conversationState: 'processing' });
    rerender({ conversationState: 'speaking' });
    advance(5 * MIN);
    expect(onExpire).not.toHaveBeenCalled();
    rerender({ conversationState: 'listening' });
    advance(10 * MIN - 1);
    expect(onExpire).not.toHaveBeenCalled();
    advance(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('잡음으로 발화 감지만 됐다 대기로 돌아오면 남은 시간만 이어서 잰다', () => {
    render({ conversationState: 'listening' });
    advance(6 * MIN);
    rerender({ conversationState: 'listening', listeningPhase: 'active' });
    advance(1 * MIN);
    expect(onExpire).not.toHaveBeenCalled();
    rerender({ conversationState: 'listening', listeningPhase: 'waiting' });
    advance(3 * MIN);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('발화 중(active)에 시간이 다 되면 대기로 돌아오는 즉시 호출된다', () => {
    render({ conversationState: 'listening' });
    advance(9 * MIN);
    rerender({ conversationState: 'listening', listeningPhase: 'active' });
    advance(2 * MIN);
    expect(onExpire).not.toHaveBeenCalled();
    rerender({ conversationState: 'listening', listeningPhase: 'waiting' });
    advance(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
