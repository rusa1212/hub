import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPomodoroConfig,
  getPomodoroPosition,
  getMsUntilNextBoundary,
  getPomodoroAnnouncement,
  usePomodoro,
} from './pomodoro';
import { renderHookWithProps } from './testHookHarness';

const MIN = 60 * 1000;
const CONFIG = { focusMs: 25 * MIN, breakMs: 5 * MIN };

describe('getPomodoroConfig', () => {
  it('분 단위 설정을 ms로 바꾼다', () => {
    expect(getPomodoroConfig({ pomodoro: { focusMinutes: 25, breakMinutes: 5 } })).toEqual(CONFIG);
  });

  it('설정이 없거나 하나라도 형식·범위가 틀리면 null(꺼짐)', () => {
    expect(getPomodoroConfig(null)).toBeNull();
    expect(getPomodoroConfig({ pomodoro: { focusMinutes: 25 } })).toBeNull();
    expect(getPomodoroConfig({ pomodoro: { focusMinutes: 25, breakMinutes: 0 } })).toBeNull();
    expect(getPomodoroConfig({ pomodoro: { focusMinutes: 'x', breakMinutes: 5 } })).toBeNull();
  });
});

describe('getPomodoroPosition / getMsUntilNextBoundary', () => {
  it.each([
    [0, 0, 'focus', 25 * MIN],
    [25 * MIN - 1, 0, 'focus', 1],
    [25 * MIN, 1, 'break', 5 * MIN],
    [29 * MIN, 1, 'break', 1 * MIN],
    [30 * MIN, 2, 'focus', 25 * MIN],
    [55 * MIN, 3, 'break', 5 * MIN],
  ])('경과 %ims → 경계 %i번째, %s 구간, 다음 경계까지 %ims', (elapsed, index, phase, untilNext) => {
    expect(getPomodoroPosition(elapsed, CONFIG)).toEqual({ index, phase });
    expect(getMsUntilNextBoundary(elapsed, CONFIG)).toBe(untilNext);
  });
});

describe('getPomodoroAnnouncement', () => {
  it('구간에 맞는 고정 문구를 준다', () => {
    expect(getPomodoroAnnouncement('break', CONFIG)).toBe('25분 집중했어. 5분 쉬었다 하자.');
    expect(getPomodoroAnnouncement('focus', CONFIG)).toBe('쉬는 시간 끝. 다시 25분 집중해보자.');
  });
});

describe('usePomodoro', () => {
  let onAnnounce;
  let hook;
  const base = { ...CONFIG, sessionId: 's1', listeningPhase: 'waiting' };

  beforeEach(() => {
    vi.useFakeTimers();
    onAnnounce = vi.fn();
  });
  afterEach(() => {
    hook?.unmount();
    vi.useRealTimers();
  });

  const render = (props) => {
    hook = renderHookWithProps(usePomodoro, { ...base, onAnnounce, ...props });
  };
  const rerender = (props) => hook.rerender({ ...base, onAnnounce, ...props });
  const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

  it('집중·휴식 경계마다 한 번씩 알린다', () => {
    render({ conversationState: 'listening' });
    advance(25 * MIN - 1);
    expect(onAnnounce).not.toHaveBeenCalled();
    advance(1);
    expect(onAnnounce).toHaveBeenLastCalledWith('25분 집중했어. 5분 쉬었다 하자.');
    // 실제로는 알림을 말하는 동안 speaking을 거쳐 다시 대기로 돌아온다
    rerender({ conversationState: 'speaking' });
    rerender({ conversationState: 'listening' });
    advance(5 * MIN);
    expect(onAnnounce).toHaveBeenLastCalledWith('쉬는 시간 끝. 다시 25분 집중해보자.');
    expect(onAnnounce).toHaveBeenCalledTimes(2);
  });

  it('경계 시점에 말하는 중이었으면 대기로 돌아온 직후 알린다', () => {
    render({ conversationState: 'listening' });
    advance(24 * MIN);
    rerender({ conversationState: 'speaking' });
    advance(2 * MIN);
    expect(onAnnounce).not.toHaveBeenCalled();
    rerender({ conversationState: 'listening' });
    expect(onAnnounce).toHaveBeenCalledTimes(1);
  });

  it('여러 경계를 한꺼번에 지났으면 현재 구간만 한 번 알린다', () => {
    render({ conversationState: 'idle' });
    advance(56 * MIN);
    rerender({ conversationState: 'listening' });
    expect(onAnnounce).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenLastCalledWith('25분 집중했어. 5분 쉬었다 하자.');
  });

  it('텍스트 전용(idle) 상태나 기능이 꺼진 상황에선 알리지 않는다', () => {
    render({ conversationState: 'idle' });
    advance(30 * MIN);
    rerender({ conversationState: 'listening', focusMs: undefined, breakMs: undefined });
    advance(60 * MIN);
    expect(onAnnounce).not.toHaveBeenCalled();
  });

  it('새 세션이 시작되면 시작 시각부터 다시 잰다', () => {
    render({ conversationState: 'listening' });
    advance(20 * MIN);
    rerender({ conversationState: 'listening', sessionId: 's2' });
    advance(20 * MIN);
    expect(onAnnounce).not.toHaveBeenCalled();
    advance(5 * MIN);
    expect(onAnnounce).toHaveBeenCalledTimes(1);
  });
});
