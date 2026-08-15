// AirPodsLog의 barge-in(끼어들기) 통합 동작 테스트 (docs/nth_wk/Barkeinplan.md Phase 1).
// bargeIn.test.js/api.test.js가 개별 조각(감지 로직, fetch 취소 배선)을 검증한다면, 이 파일은
// 실제 컴포넌트를 렌더링해 "TTS 생성/재생 중 사용자가 다시 말하면 재생·요청이 즉시 끊기고
// 새 녹음이 시작된다"는 전체 흐름이 실제로 이어붙는지 확인한다.
//
// jsdom에는 MediaRecorder/AudioContext/HTMLMediaElement.play/getUserMedia가 없으므로 아래에서
// 최소한으로 흉내만 낸다. requestAnimationFrame/performance.now는 테스트가 직접 제어하는
// 가짜 클럭으로 바꿔, "발화가 sustainMs 이상 지속돼야 끼어들기로 인정" 판정을 프레임 단위로
// 정확히 재현한다.
//
// 렌더링은 @testing-library/react의 render() 대신 react-dom/client + act를 직접 사용한다.
// 이 리포는 front/와 리포 루트에 각각 별도의 node_modules(별도 package.json)가 있어 react가
// 두 벌 설치되어 있는데, @testing-library/react(루트에 설치됨)가 내부적으로 참조하는
// react-dom은 루트 사본이라 front 사본으로 렌더링되는 이 앱과 섞이면 "Invalid hook call"이
// 난다. 쿼리(screen/waitFor)는 React에 의존하지 않는 @testing-library/dom에서 가져와 이 문제를
// 피한다 — @testing-library/react의 render()가 내부적으로 하는 일과 동일하다.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { MemoryRouter } from 'react-router-dom';
import AirPodsLog from './AirPodsLog.jsx';

// @testing-library/react가 render() 안에서 자동으로 해주는 설정. render() 대신 이 파일이
// 직접 react-dom/client를 쓰므로(위 주석 참고) 여기서도 켜줘야 act() 경고가 안 뜬다.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderApp(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => act(() => root.unmount()),
  };
}

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));
vi.mock('./SettingsContext', () => ({
  useSettings: () => ({ voice: 'ko-A', speed: 1, volume: 1, setVoice: vi.fn(), setSpeed: vi.fn(), setVolume: vi.fn() }),
}));
// api.js의 authHeaders()가 내부적으로 참조하는 실제 supabase 클라이언트를 걷어내
// 네트워크/환경변수에 의존하지 않게 한다 (이 테스트는 오디오 파이프라인만 검증하면 됨).
vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));

// ── requestAnimationFrame/performance.now를 테스트가 직접 구동하는 가짜 클럭으로 대체 ──
// 파형 그리기 루프, 무음 감지(checkVoice), barge-in 감지(check) 모두 이 큐를 공유한다.
// stepFrame()을 부르면 그 시점까지 등록된 모든 rAF 콜백을 한 번씩 실행하고 클럭을 전진시킨다.
let rafCallbacks;
let rafId;
let clock;

function stepFrame(advanceMs = 100) {
  clock += advanceMs;
  const callbacks = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  callbacks.forEach((cb) => cb());
}

class FakeAnalyser {
  constructor() {
    this.fftSize = 256;
    this.frequencyBinCount = 128;
    this.amplitude = 0; // 테스트가 직접 조절: 이 값만큼 128에서 벗어난 값으로 채워짐
  }
  connect() {}
  getByteTimeDomainData(arr) {
    arr.fill(128 + this.amplitude);
  }
}

class FakeAudioContext {
  constructor() {
    this.destination = {};
  }
  createMediaStreamSource() {
    return { connect: () => {} };
  }
  createMediaElementSource() {
    return { connect: () => {} };
  }
  createAnalyser() {
    const analyser = new FakeAnalyser();
    createdAnalysers.push(analyser);
    return analyser;
  }
  resume() {
    return Promise.resolve();
  }
  close() {}
}

class FakeMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    this.mimeType = 'audio/webm';
  }
  start() {
    this.state = 'recording';
    createdRecorders.push(this);
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

let createdAnalysers;
let createdRecorders;
let fetchMock;
let ttsAbortSignal;
let getUserMediaMock;

beforeEach(() => {
  window.localStorage.clear();
  rafCallbacks = new Map();
  rafId = 0;
  clock = 0;
  createdAnalysers = [];
  createdRecorders = [];
  ttsAbortSignal = null;

  vi.stubGlobal('requestAnimationFrame', (cb) => {
    rafId += 1;
    rafCallbacks.set(rafId, cb);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    rafCallbacks.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);

  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
  });
  vi.stubGlobal('URL', class extends URL {});
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();

  // 실제 브라우저의 getUserMedia는 마이크 권한 확인 때문에 항상 최소 한 틱 이상 걸린다.
  // 여기서 Promise.resolve()(마이크로태스크)로 즉시 resolve하면 conversationStateRef를
  // 최신값으로 동기화하는 useEffect(패시브 이펙트, 매크로태스크 성격)보다 먼저 실행돼
  // startBargeInWatcher가 아직 'speaking'으로 안 바뀐 stale ref를 보고 조기 종료해버리는
  // 테스트 한정 레이스가 생긴다 — setTimeout으로 한 틱 늦춰 실제 타이밍에 더 가깝게 만든다.
  getUserMediaMock = vi.fn(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ getTracks: () => [{ stop: vi.fn() }] }), 20);
      })
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
  });

  // /api/session은 즉시 성공 응답. /api/tts는 barge-in이 "생성 중"에도 끼어들 수 있어야 한다는
  // 기획(3-3)을 검증하기 위해 일부러 정상적으로는 resolve하지 않고, signal이 abort될 때만
  // AbortError로 reject한다 — 진행 중인 fetch 자체가 실제로 취소되는지를 확인하기 위함.
  fetchMock = vi.fn((url, options = {}) => {
    if (url === '/api/session') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionId: 'sess-1' }) });
    }
    if (url === '/api/tts') {
      ttsAbortSignal = options.signal;
      return new Promise((_resolve, reject) => {
        if (ttsAbortSignal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        ttsAbortSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    if (url === '/api/session/sess-1/interruption') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ recorded: true }) });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});

let mountedApp;

afterEach(() => {
  mountedApp?.unmount();
  mountedApp?.container.remove();
  mountedApp = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAtChat() {
  mountedApp = renderApp(
    <MemoryRouter initialEntries={['/situation']}>
      <AirPodsLog />
    </MemoryRouter>
  );
  return mountedApp;
}

describe('barge-in 통합 동작 (docs/nth_wk/Barkeinplan.md Phase 1)', () => {
  it('TTS 생성 중 사용자가 일정 시간 이상 말하면 재생을 중단하고 새 녹음을 시작한다', async () => {
    renderAtChat();

    // "그냥 대화"(situationId: null) 선택 → 세션 생성 → 인사말을 TTS로 재생 시도
    await act(async () => {
      screen.getByText('그냥 대화').click();
    });

    // speaking 상태 진입까지 대기 (TTS 응답 자체는 아직 오지 않은 상태 — 기획 3-3: 생성 중에도 끼어들기 가능해야 함)
    await screen.findByText('말하는 중...');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tts', expect.anything()));
    // barge-in 감시용 마이크(getUserMedia)까지 열렸는지 대기 — TTS 분석기(1) + barge-in 분석기(2)
    await waitFor(() => expect(createdAnalysers.length).toBeGreaterThanOrEqual(2));

    expect(ttsAbortSignal).toBeTruthy();
    expect(ttsAbortSignal.aborted).toBe(false);

    const bargeInAnalyser = createdAnalysers[createdAnalysers.length - 1];

    // 아직 조용함 → 몇 프레임이 지나도 끼어들기로 인정되지 않아야 함
    await act(async () => {
      stepFrame(100);
      stepFrame(100);
    });
    expect(screen.getByText('말하는 중...')).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();

    // 사용자가 말하기 시작 (BARGE_IN_THRESHOLD=15를 넘는 진폭을 BARGE_IN_SUSTAIN_MS=300ms 이상 유지).
    // clock은 테스트 전체에서 공유되는 누적 타이머라 여기서부터 0ms가 아니라(위 조용한
    // 프레임들로 이미 200ms 지난 상태) 300ms를 마저 채우려면 프레임이 하나 더 필요하다.
    bargeInAnalyser.amplitude = 50;
    await act(async () => {
      stepFrame(100); // aboveSince 설정 (0ms 경과), 아직 미달
      stepFrame(100); // 100ms 경과, 아직 미달
      stepFrame(100); // 200ms 경과, 아직 미달
      stepFrame(100); // 300ms 경과 → 끼어들기 감지
    });

    // 1) 진행 중이던 /api/tts 요청이 실제로 취소됨
    expect(ttsAbortSignal.aborted).toBe(true);
    // 2) 재생이 중단됨 (오디오 엘리먼트 pause)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    // 3) 대화 상태가 다시 듣기 상태로 전환됨
    await waitFor(() => {
      expect(screen.queryByText('말하는 중...')).not.toBeInTheDocument();
    });
    await screen.findByText(/편하게 말씀해주세요|듣는 중/);
    // 4) 새 녹음이 실제로 시작됨
    await waitFor(() => expect(createdRecorders.length).toBeGreaterThanOrEqual(1));
    expect(createdRecorders[createdRecorders.length - 1].state).toBe('recording');
    // 감시용 스트림을 그대로 녹음에 재사용해 새 getUserMedia 지연으로 발화 첫부분이 유실되지 않음
    expect(getUserMediaMock).toHaveBeenCalledTimes(2); // 최초 권한 확인 + barge-in 감시
    // Phase 2/3: 사용자에게 중단 여부를 남기고, 세션 이벤트도 서버에 기록한다.
    expect(screen.getByText('음성 중단됨')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/sess-1/interruption',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('짧은 스파이크(소음)만으로는 끼어들기가 발동하지 않는다 (오탐 방지)', async () => {
    renderAtChat();

    await act(async () => {
      screen.getByText('그냥 대화').click();
    });

    await screen.findByText('말하는 중...');
    await waitFor(() => expect(createdAnalysers.length).toBeGreaterThanOrEqual(2));
    const bargeInAnalyser = createdAnalysers[createdAnalysers.length - 1];

    // 임계값을 순간적으로만 넘기고 바로 조용해짐 → sustainMs를 채우지 못해 끼어들기로 인정되면 안 됨
    bargeInAnalyser.amplitude = 50;
    await act(async () => {
      stepFrame(10);
    });
    bargeInAnalyser.amplitude = 0;
    await act(async () => {
      stepFrame(1000); // 충분히 긴 시간이 지나도, 이미 조용해졌으므로 감지되면 안 됨
    });

    expect(screen.getByText('말하는 중...')).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    expect(ttsAbortSignal.aborted).toBe(false);
  });
});

describe('요청 오류 복구', () => {
  it('채팅 요청이 503이면 원인을 안내하고 같은 메시지를 다시 시도한다', async () => {
    window.localStorage.setItem('airpodslog.voiceDisabledUntil', String(Date.now() + 60_000));
    let chatAttempts = 0;
    fetchMock.mockImplementation((url) => {
      if (url === '/api/session') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionId: 'sess-1' }) });
      }
      if (url === '/api/chat') {
        chatAttempts += 1;
        if (chatAttempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: () => Promise.resolve({ message: 'AI 서비스가 일시적으로 요청을 처리할 수 없습니다.' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reply: '다시 연결됐어. 계속 이야기해보자.', messageId: 'msg-2' }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    renderAtChat();
    await act(async () => {
      screen.getByText('그냥 대화').click();
    });

    const input = await screen.findByPlaceholderText('메시지 입력...');
    fireEvent.change(input, { target: { value: '오늘 너무 힘들었어' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    expect(await screen.findByText('AI가 잠시 바빠요')).toBeTruthy();
    expect(screen.getByText(/서비스가 일시적으로 요청을 처리하지 못하고 있어요/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('다시 연결됐어. 계속 이야기해보자.')).toBeTruthy();
    expect(chatAttempts).toBe(2);
    expect(screen.getAllByText('오늘 너무 힘들었어')).toHaveLength(1);
  });
});
