import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RecapScreen from './RecapScreen.jsx';
import { getSessionDetail, summarizeSession } from './api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./api', () => ({
  getSessionDetail: vi.fn(),
  summarizeSession: vi.fn(),
}));

function renderRecap(onContinue = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/recap/session-1']}>
        <Routes>
          <Route path="/recap/:sessionId" element={<RecapScreen onContinue={onContinue} />} />
          <Route path="/" element={<p>홈 화면</p>} />
        </Routes>
      </MemoryRouter>
    );
  });
  return { container, root };
}

let mounted;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (mounted) {
    act(() => mounted.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
});

describe('대화 종료 리캡', () => {
  it('요약과 상황, 대화 통계를 보여주고 기존 세션을 이어간다', async () => {
    summarizeSession.mockResolvedValue({
      sessionId: 'session-1',
      situation: 'commuting',
      summary: '발표를 앞두고 느끼는 긴장과 준비 과정에 관해 이야기했어요.',
      messageCount: 6,
      userMessageCount: 3,
      createdAt: '2026-08-15T10:00:00.000Z',
      endedAt: '2026-08-15T10:07:00.000Z',
    });
    const onContinue = vi.fn().mockResolvedValue(undefined);

    mounted = renderRecap(onContinue);

    expect(await screen.findByText(/발표를 앞두고/)).toBeTruthy();
    expect(screen.getByText('이동 중')).toBeTruthy();
    expect(screen.getByText('약 7분 · 내가 건넨 말 3회')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '이어서 대화하기' }));
    await waitFor(() => {
      expect(onContinue).toHaveBeenCalledWith({ id: 'session-1', persona_id: 'commuting' });
    });
  });

  it('사용자 발화가 없는 세션은 빈 대화 안내를 보여준다', async () => {
    summarizeSession.mockResolvedValue({
      sessionId: 'session-1',
      situation: null,
      summary: null,
      messageCount: 0,
      userMessageCount: 0,
      createdAt: '2026-08-15T10:00:00.000Z',
      endedAt: '2026-08-15T10:00:00.000Z',
    });

    mounted = renderRecap();

    expect(await screen.findByText(/아직 정리할 대화가 없어요/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '이어서 대화하기' })).toBeNull();
  });

  it('요약 생성 실패 시 세션 상세로 기본 정보를 복구하고 재시도를 제공한다', async () => {
    summarizeSession.mockRejectedValue(new Error('요약 실패'));
    getSessionDetail.mockResolvedValue({
      situation: 'studying',
      history: [
        { role: 'user', parts: [{ text: '집중이 안 돼' }] },
        { role: 'model', parts: [{ text: '잠깐 쉬어볼까?' }] },
      ],
    });

    mounted = renderRecap();

    expect(await screen.findByRole('alert')).toHaveTextContent('대화 요약을 만들지 못했어요');
    expect(screen.getByText('집중 모드')).toBeTruthy();
    expect(screen.getByText('내가 건넨 말 1회')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });
});
