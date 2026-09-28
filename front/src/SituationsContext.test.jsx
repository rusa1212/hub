// SituationsContext: /api/situations 응답을 선택지 목록과 persona_id → 메타 조회로 바꿔주는지 검증
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import { GENERAL_CHAT, SituationsProvider, useSituations } from './SituationsContext.jsx';
import { getSituations } from './api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./api', () => ({
  getSituations: vi.fn(),
}));

function Probe() {
  const { situations, hiddenSituations, getSituationMeta, loading } = useSituations();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p data-testid="labels">{situations.map((s) => s.label).join(',')}</p>
      <p data-testid="hidden-labels">{hiddenSituations.map((s) => s.label).join(',')}</p>
      <p data-testid="hidden-meta">{getSituationMeta('hidden').label}</p>
      <p data-testid="null-meta">{getSituationMeta(null).label}</p>
      <p data-testid="unknown-meta">{getSituationMeta('removed').label}</p>
    </div>
  );
}

let mounted;

function render(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  mounted = { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => mounted.root.unmount());
  mounted.container.remove();
  vi.restoreAllMocks();
});

describe('SituationsContext', () => {
  it('노출 중인 상황만 서버 순서대로 보여주고 "그냥 대화"를 마지막에 붙인다', async () => {
    getSituations.mockResolvedValue({
      situations: [
        { id: 'exercising', label: '운동 중', emoji: '🏃', greeting: '운동!', isActive: true },
        { id: 'hidden', label: '숨긴 상황', emoji: '🙈', greeting: '...', isActive: false },
        { id: 'sleeping', label: '자기 전', emoji: '🌙', greeting: '잘 자', isActive: true },
      ],
    });

    render(<SituationsProvider><Probe /></SituationsProvider>);

    expect((await screen.findByTestId('labels')).textContent).toBe('운동 중,자기 전,그냥 대화');
    // 숨긴 상황은 관리자 내부 테스트용 목록으로 따로 제공 ('그냥 대화'는 포함하지 않음)
    expect(screen.getByTestId('hidden-labels').textContent).toBe('숨긴 상황');
    // 숨긴 상황도 과거 기록 표시용 조회는 가능해야 함
    expect(screen.getByTestId('hidden-meta').textContent).toBe('숨긴 상황');
    expect(screen.getByTestId('null-meta').textContent).toBe(GENERAL_CHAT.label);
    expect(screen.getByTestId('unknown-meta').textContent).toBe('대화');
  });

  it('목록을 못 불러와도 "그냥 대화"로는 계속 쓸 수 있다', async () => {
    getSituations.mockRejectedValue(new Error('network'));

    render(<SituationsProvider><Probe /></SituationsProvider>);

    expect((await screen.findByTestId('labels')).textContent).toBe('그냥 대화');
  });
});
