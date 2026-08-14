// api.synthesizeSpeech에 대한 단위 테스트: barge-in이 진행 중인 /api/tts 요청을
// AbortController로 취소할 수 있어야 하므로(docs/nth_wk/Barkeinplan.md 3-3), signal이
// fetch까지 그대로 전달되는지, 취소 시 AbortError가 그대로 전파되는지를 검증한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordInterruption, synthesizeSpeech } from './api.js';

describe('synthesizeSpeech', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 정상 케이스 ──────────────────────────────
  describe('정상 케이스', () => {
    it('N1: 응답이 성공하면 blob을 반환한다', async () => {
      const fakeBlob = new Blob(['fake-audio']);
      fetchMock.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(fakeBlob),
      });

      const result = await synthesizeSpeech('안녕', 'ko-A');
      expect(result).toBe(fakeBlob);
    });

    it('N2: signal을 넘기면 fetch 호출의 옵션에 그대로 전달된다', async () => {
      fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
      const controller = new AbortController();

      await synthesizeSpeech('안녕', 'ko-A', { signal: controller.signal });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('N3: signal을 넘기지 않으면 undefined로 전달된다 (기존 호출부와 하위 호환)', async () => {
      fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });

      await synthesizeSpeech('안녕', 'ko-A');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({ signal: undefined })
      );
    });
  });

  // ── 실패/비정상 케이스 ──────────────────────────────
  describe('실패/비정상 케이스', () => {
    it('F1: 이미 abort된 signal로 호출하면 AbortError가 그대로 전파된다', async () => {
      const controller = new AbortController();
      controller.abort();
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchMock.mockRejectedValue(abortError);

      await expect(
        synthesizeSpeech('안녕', 'ko-A', { signal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('F2: 서버가 실패 응답을 주면 status가 담긴 Error를 던진다', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ message: '사용 한도 초과' }),
      });

      await expect(synthesizeSpeech('안녕', 'ko-A')).rejects.toMatchObject({
        status: 429,
        message: '사용 한도 초과',
      });
    });
  });
});

describe('recordInterruption', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ recorded: true }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assistant 메시지 ID와 재생 경과 시간을 중단 이벤트 API로 전달한다', async () => {
    await recordInterruption('sess-1', { messageId: 'msg-7', playbackMs: 1250.4 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/session/sess-1/interruption',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'msg-7', playbackMs: 1250.4 }),
      })
    );
  });
});
