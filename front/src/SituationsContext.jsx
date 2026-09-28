// 상황(페르소나) 목록 전역 컨텍스트: 백엔드 GET /api/situations(personas 테이블)가 단일 출처.
// '그냥 대화'(persona_id = null)는 DB 행이 없는 화면 전용 선택지라 여기서만 정의한다.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSituations } from './api';

export const GENERAL_CHAT = {
  id: null,
  emoji: '💬',
  label: '그냥 대화',
  greeting: '안녕, 오늘 하루는 어땠어?',
  description: '추천 없이 이야기만 나눠요',
  isActive: true,
};

// 목록에 없는 persona_id(삭제된 상황 등)를 표시할 때 쓰는 기본값
const UNKNOWN_SITUATION = { emoji: '💬', label: '대화' };

function buildValue(dbSituations, loading, error) {
  const all = [...dbSituations, GENERAL_CHAT];
  const byId = Object.fromEntries(dbSituations.map((s) => [s.id, s]));
  return {
    // 선택 화면·기록 필터에 노출할 상황 (숨김 처리된 상황 제외, '그냥 대화'는 항상 마지막)
    situations: all.filter((s) => s.isActive),
    // 세션의 persona_id로 메타(이모지/라벨/인사말) 조회. null은 '그냥 대화'.
    getSituationMeta: (personaId) => (personaId == null ? GENERAL_CHAT : byId[personaId] ?? UNKNOWN_SITUATION),
    loading,
    error,
  };
}

// Provider 밖(단위 테스트 등)에서는 '그냥 대화'만 있는 목록으로 동작한다.
const SituationsContext = createContext(buildValue([], false, null));

export function SituationsProvider({ children }) {
  const [dbSituations, setDbSituations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSituations()
      .then((data) => {
        if (!cancelled) setDbSituations(data.situations ?? []);
      })
      .catch((err) => {
        // 실패해도 '그냥 대화'로는 계속 쓸 수 있게 목록만 비워둔다.
        console.error('상황 목록 불러오기 실패:', err);
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => buildValue(dbSituations, loading, error), [dbSituations, loading, error]);
  return <SituationsContext.Provider value={value}>{children}</SituationsContext.Provider>;
}

export function useSituations() {
  return useContext(SituationsContext);
}
