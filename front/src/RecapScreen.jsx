import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSessionDetail, summarizeSession } from './api';
import { SITUATION_META_BY_ID } from './situations';
import './RecapScreen.css';

function formatDuration(createdAt, endedAt) {
  const start = new Date(createdAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return `약 ${minutes}분`;
}

export default function RecapScreen({ onContinue }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [continuing, setContinuing] = useState(false);
  const requestedSessionRef = useRef(null);

  const loadRecap = async () => {
    setLoading(true);
    setError('');
    try {
      setRecap(await summarizeSession(sessionId));
    } catch (err) {
      console.error('대화 리캡 생성 실패:', err);
      setError('대화 요약을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
      try {
        const detail = await getSessionDetail(sessionId);
        setRecap({
          sessionId,
          situation: detail.situation,
          summary: null,
          messageCount: detail.history?.length ?? 0,
          userMessageCount: detail.history?.filter((message) => message.role === 'user').length ?? 0,
        });
      } catch {
        setRecap(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (requestedSessionRef.current === sessionId) return;
    requestedSessionRef.current = sessionId;
    loadRecap();
    // sessionId가 바뀔 때만 새 리캡을 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const situationMeta = SITUATION_META_BY_ID[recap?.situation ?? 'default'] ?? SITUATION_META_BY_ID.default;
  const duration = recap ? formatDuration(recap.createdAt, recap.endedAt) : null;
  const hasConversation = (recap?.userMessageCount ?? 0) > 0;
  const statText = [duration, hasConversation ? `내가 건넨 말 ${recap.userMessageCount}회` : null]
    .filter(Boolean)
    .join(' · ');

  const handleContinue = async () => {
    if (!recap || continuing) return;
    setContinuing(true);
    await onContinue({ id: sessionId, persona_id: recap.situation });
  };

  return (
    <main className="recap-screen">
      <p className="recap-eyebrow">Conversation Recap</p>
      <h2 className="recap-title">오늘의 대화</h2>

      <section className="recap-card" aria-live="polite">
        <div className="recap-situation-icon" aria-hidden="true">{situationMeta.emoji}</div>
        <p className="recap-situation-label">{situationMeta.label}</p>

        {loading ? (
          <div className="recap-loading">
            <span className="recap-spinner" aria-hidden="true" />
            <p>오늘 나눈 이야기를 정리하고 있어요…</p>
          </div>
        ) : !hasConversation ? (
          <p className="recap-summary">아직 정리할 대화가 없어요.<br />다음에는 편하게 한마디 건네보세요.</p>
        ) : recap?.summary ? (
          <p className="recap-summary">“{recap.summary}”</p>
        ) : (
          <p className="recap-summary recap-summary--muted">대화 내용은 저장되었지만 지금은 요약을 표시할 수 없어요.</p>
        )}

        {!loading && statText && <p className="recap-stats">{statText}</p>}
      </section>

      {error && !loading && (
        <div className="recap-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadRecap}>다시 시도</button>
        </div>
      )}

      <div className="recap-actions">
        {hasConversation && (
          <button className="btn-primary" type="button" onClick={handleContinue} disabled={loading || continuing}>
            {continuing ? '대화 불러오는 중…' : '이어서 대화하기'}
          </button>
        )}
        <button className="recap-home-button" type="button" onClick={() => navigate('/')}>
          홈으로
        </button>
      </div>
    </main>
  );
}
