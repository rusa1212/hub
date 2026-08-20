// 로그인 사용자의 대화 기록 목록/상세 조회 화면. 연속 대화일(스트릭) 계산, 계정 삭제도 여기서 처리
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getMySessions, getSessionDetail, deleteAccount, deleteSession, deleteMySessions } from './api';
import { SITUATIONS, SITUATION_META_BY_ID } from './situations';
import './Auth.css';

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 세션들의 last_active_at을 로컬 날짜별로 모아, 오늘(또는 어제까지)부터 거슬러 며칠 연속으로
// 대화했는지 계산. last_active_at === created_at인 세션(메시지 한 번도 없이 끝남)은 제외.
function computeStreak(sessions) {
  const activeDates = new Set(
    sessions
      .filter((s) => s.last_active_at !== s.created_at)
      .map((s) => toDateKey(new Date(s.last_active_at)))
  );
  if (activeDates.size === 0) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!activeDates.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1); // 오늘 아직 대화 안 했어도 어제까지 연속이면 스트릭 유지
  }

  let streak = 0;
  while (activeDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// 로그인 사용자가 본인의 과거 세션 목록/상세를 조회하는 화면.
// docs/3rd_wk/Authplan.md 7절: 익명 세션은 로그인 후에도 소급해서 보이지 않는다는 점을 명시.
export default function HistoryScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    if (authLoading || !user) return;
    getMySessions()
      .then(({ sessions: list }) => setSessions(list))
      .catch((err) => setError(err.message || '기록을 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const handleSelect = async (id) => {
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setDetail(null);
    setDetailError('');
    try {
      const data = await getSessionDetail(id);
      setDetail(data);
    } catch (err) {
      setDetailError(err.message || '대화 내용을 불러오지 못했어요.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('정말 계정을 삭제할까요? 저장된 모든 대화 기록도 함께 삭제되고, 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await deleteAccount();
      await signOut();
      navigate('/');
    } catch (err) {
      setError(err.message || '계정 삭제에 실패했어요.');
    }
  };

  const handleDeleteSession = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('이 대화 기록을 삭제할까요? 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      setError(err.message || '기록 삭제에 실패했어요.');
    }
  };

  const handleDeleteAllSessions = async () => {
    if (!window.confirm('대화 기록을 전부 삭제할까요? 계정은 유지되고 대화 기록만 지워지며, 되돌릴 수 없어요.')) {
      return;
    }
    try {
      await deleteMySessions();
      setSessions([]);
      setSelectedId(null);
      setDetail(null);
    } catch (err) {
      setError(err.message || '기록 삭제에 실패했어요.');
    }
  };

  const streak = computeStreak(sessions);
  const filterOptions = [{ id: 'all', emoji: '🗂️', label: '전체' }, ...SITUATIONS.map((s) => ({ id: s.id ?? 'default', emoji: s.emoji, label: s.label }))];
  const filteredSessions =
    activeFilter === 'all' ? sessions : sessions.filter((s) => (s.persona_id ?? 'default') === activeFilter);

  if (!authLoading && !user) {
    return (
      <div className="auth-screen">
        <button className="auth-close" type="button" onClick={() => navigate('/')} aria-label="닫기">
          ✕
        </button>
        <div className="auth-badge">🔒</div>
        <h2 className="auth-title">기록 보기</h2>
        <p className="auth-subtitle">로그인하면 지금까지의 대화 기록을 다시 볼 수 있어요.</p>
        <button className="btn-primary auth-submit" onClick={() => navigate('/login')}>
          로그인하러 가기
        </button>
        <button className="auth-back" type="button" onClick={() => navigate('/')}>
          홈으로
        </button>
      </div>
    );
  }

  return (
    <div className="history-screen">
      <header className="history-header">
        <button className="history-back-btn" type="button" onClick={() => navigate('/')} aria-label="홈으로">
          ←
        </button>
        <h2 className="auth-title">내 대화 기록</h2>
        <span className="history-header-spacer" aria-hidden="true" />
      </header>
      {!loading && streak > 0 && (
        <div className="streak-badge">
          <span aria-hidden="true">🔥</span> {streak}일 연속 대화 중
        </div>
      )}
      <p className="history-notice">🔒 로그인 전에 나눈 대화는 기록되지 않아요. 이 화면에는 로그인 이후의 세션만 보여요.</p>

      {!loading && sessions.length > 0 && (
        <div className="history-filter-row" role="group" aria-label="상황별 필터">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`history-filter-chip ${activeFilter === opt.id ? 'history-filter-chip--active' : ''}`}
              onClick={() => setActiveFilter(opt.id)}
            >
              <span aria-hidden="true">{opt.emoji}</span> {opt.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="history-status-row">
          <span className="auth-spinner" aria-hidden="true" /> 불러오는 중...
        </div>
      )}
      {error && <p className="auth-message auth-message--error">⚠ {error}</p>}

      {!loading && sessions.length === 0 && !error && (
        <div className="history-empty">
          <div className="history-empty-icon">🗒️</div>
          <p className="auth-subtitle">
            아직 로그인 상태로 나눈 대화가 없어요.
            <br />
            대화를 시작하면 여기에 기록돼요.
          </p>
        </div>
      )}

      {!loading && sessions.length > 0 && filteredSessions.length === 0 && (
        <div className="history-empty">
          <p className="auth-subtitle">이 카테고리에는 대화 기록이 없어요.</p>
        </div>
      )}

      <ul className="history-list">
        {filteredSessions.map((s) => {
          const meta = SITUATION_META_BY_ID[s.persona_id ?? 'default'] ?? { emoji: '💬', label: '대화' };
          const isActive = selectedId === s.id;
          return (
            <li key={s.id} className="history-list-item">
              <div className="history-item-row">
                <button
                  className={`history-item ${isActive ? 'history-item--active' : ''}`}
                  onClick={() => handleSelect(s.id)}
                >
                  <span className="history-item-emoji" aria-hidden="true">{meta.emoji}</span>
                  <span className="history-item-body">
                    <span className="history-item-label">{meta.label}</span>
                    {s.summary && <span className="history-item-summary">{s.summary}</span>}
                    <span className="history-item-date">{formatDate(s.last_active_at)}</span>
                  </span>
                  <span className={`history-item-chevron ${isActive ? 'history-item-chevron--open' : ''}`} aria-hidden="true">
                    ⌄
                  </span>
                </button>
                <button
                  type="button"
                  className="history-item-delete"
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  aria-label="이 대화 기록 삭제"
                >
                  🗑
                </button>
              </div>
              {isActive && (
                <div className="history-detail">
                  {detailError && <p className="auth-message auth-message--error">⚠ {detailError}</p>}
                  {!detailError && !detail && (
                    <div className="history-status-row">
                      <span className="auth-spinner" aria-hidden="true" /> 불러오는 중...
                    </div>
                  )}
                  {detail && detail.history?.length === 0 && !detailError && (
                    <p className="auth-subtitle">주고받은 메시지가 없어요.</p>
                  )}
                  {detail?.history?.map((msg, i) => (
                    <div key={i} className={`msg-row ${msg.role === 'user' ? 'msg-row--user' : 'msg-row--agent'}`}>
                      {msg.role !== 'user' && <div className="agent-avatar">AI</div>}
                      <div className={`bubble ${msg.role === 'user' ? 'bubble--user' : 'bubble--agent'}`}>
                        {msg.parts?.[0]?.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="history-danger-zone">
        {sessions.length > 0 && (
          <button className="history-clear-button" type="button" onClick={handleDeleteAllSessions}>
            🗑 기록 전체 삭제
          </button>
        )}
        <button className="account-delete-button" type="button" onClick={handleDeleteAccount}>
          🗑 계정 삭제
        </button>
      </div>
    </div>
  );
}
