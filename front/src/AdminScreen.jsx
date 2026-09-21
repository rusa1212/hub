// 관리자 전용 화면: 프로젝트 전체 쿼터 잔여량(실제 Gemini 한도)과 사용자별 사용량,
// 최근 7일 추이를 보여준다. 관리자가 아닌 계정으로 열면 백엔드가 403을 주므로 안내만 보여준다.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getAdminUsage } from './api';
import './Auth.css';
import './Admin.css';

const KINDS = [
  { id: 'stt', emoji: '🎙️', label: '음성 인식 (STT)' },
  { id: 'tts', emoji: '🔊', label: '음성 재생 (TTS)' },
];

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// 남은 비율에 따라 색을 바꿔, 한도에 가까워진 쪽이 눈에 띄게 한다. 한도를 모르면 중립색.
function levelOf(used, limit) {
  if (limit == null) return 'unknown';
  const ratio = limit > 0 ? used / limit : 0;
  if (ratio >= 1) return 'danger';
  if (ratio >= 0.7) return 'warn';
  return 'ok';
}

export default function AdminScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    getAdminUsage()
      .then(setData)
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(err.message || '사용량을 불러오지 못했어요.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading || !user) return;
    load();
    // user가 바뀔 때만 다시 불러오면 되고, load는 매 렌더 새로 만들어지므로 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  if (!authLoading && !user) {
    return (
      <div className="auth-screen">
        <button className="auth-close" type="button" onClick={() => navigate('/')} aria-label="닫기">
          ✕
        </button>
        <div className="auth-badge">🔒</div>
        <h2 className="auth-title">관리자</h2>
        <p className="auth-subtitle">관리자 계정으로 로그인해야 볼 수 있어요.</p>
        <button className="btn-primary auth-submit" onClick={() => navigate('/login')}>
          로그인하러 가기
        </button>
        <button className="auth-back" type="button" onClick={() => navigate('/')}>
          홈으로
        </button>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="auth-screen">
        <div className="auth-badge">⛔</div>
        <h2 className="auth-title">관리자 전용</h2>
        <p className="auth-subtitle">이 계정에는 관리자 권한이 없어요.</p>
        <button className="auth-back" type="button" onClick={() => navigate('/')}>
          홈으로
        </button>
      </div>
    );
  }

  const maxTrend = data ? Math.max(1, ...data.trend.map((d) => d.stt + d.tts)) : 1;

  return (
    <div className="history-screen">
      <header className="history-header">
        <button className="history-back-btn" type="button" onClick={() => navigate('/')} aria-label="홈으로">
          ←
        </button>
        <h2 className="auth-title">관리자</h2>
        <button className="history-back-btn" type="button" onClick={load} aria-label="새로고침" disabled={loading}>
          ↻
        </button>
      </header>

      {loading && (
        <div className="history-status-row">
          <span className="auth-spinner" aria-hidden="true" /> 불러오는 중...
        </div>
      )}
      {error && <p className="auth-message auth-message--error">⚠ {error}</p>}

      {data && !loading && (
        <>
          <p className="admin-meta">
            {data.date} 기준 ({data.timezone}) · 가입 {data.registeredUserCount}명 · 오늘 사용{' '}
            {data.activeUserCount}명
          </p>

          <h3 className="admin-section-title">오늘 남은 호출 (서비스 전체)</h3>
          <div className="admin-card-row">
            {KINDS.map((kind) => {
              const stat = data.project[kind.id];
              const level = levelOf(stat.used, stat.quota);
              return (
                <div key={kind.id} className={`admin-card admin-usage-row--${level}`}>
                  <span className="admin-card-label">
                    <span aria-hidden="true">{kind.emoji}</span> {kind.label}
                  </span>
                  <span className="admin-card-value">
                    {stat.remaining == null ? `${stat.used}회 사용` : `${stat.remaining}회 남음`}
                  </span>
                  <span className="admin-usage-bar">
                    <span
                      className="admin-usage-bar-fill"
                      style={{ width: stat.quota ? `${Math.min(100, (stat.used / stat.quota) * 100)}%` : '0%' }}
                    />
                  </span>
                  <span className="admin-card-sub">
                    {stat.quota == null
                      ? '하루 쿼터 미설정 — 사용량만 집계 중'
                      : `오늘 ${stat.used}회 사용 / 하루 ${stat.quota}회`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="admin-note">
            ⓘ Gemini 무료 티어 쿼터는 사용자별이 아니라 <strong>API 키(프로젝트) 전체</strong> 기준이에요. 정확한
            한도는 AI Studio의 Rate limits 페이지에서 확인해 <code>backend/.env</code>의{' '}
            <code>STT_PROJECT_DAILY_QUOTA</code> / <code>TTS_PROJECT_DAILY_QUOTA</code>에 넣으면 이 숫자에 반영돼요.
          </p>

          <h3 className="admin-section-title">사용자별 사용량 (1인 상한 기준)</h3>
          {data.users.length === 0 ? (
            <p className="auth-subtitle">오늘은 아직 STT/TTS 호출이 없어요.</p>
          ) : (
            <ul className="admin-user-list">
              {data.users.map((u) => (
                <li key={u.key} className="admin-user">
                  <div className="admin-user-head">
                    <span className="admin-user-name">
                      {u.isAnonymous ? '비로그인 사용자' : u.username ?? '(이름 없음)'}
                      {u.isAdmin && <span className="admin-user-tag">관리자</span>}
                    </span>
                    <span className="admin-user-time">{formatTime(u.updatedAt)}</span>
                  </div>
                  {KINDS.map((kind) => {
                    const stat = u.usage[kind.id];
                    return (
                      <div
                        key={kind.id}
                        className={`admin-usage-row admin-usage-row--${levelOf(stat.used, stat.limit)}`}
                      >
                        <span className="admin-usage-kind" aria-hidden="true">
                          {kind.emoji}
                        </span>
                        <span className="admin-usage-bar">
                          <span
                            className="admin-usage-bar-fill"
                            style={{ width: stat.limit ? `${Math.min(100, (stat.used / stat.limit) * 100)}%` : '0%' }}
                          />
                        </span>
                        <span className="admin-usage-num">
                          {stat.used}회
                          <span className="admin-usage-den">{stat.limit == null ? '' : ` / ${stat.limit}`}</span>
                        </span>
                      </div>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}

          <h3 className="admin-section-title">최근 7일 호출량</h3>
          <ul className="admin-trend">
            {data.trend.map((day) => (
              <li key={day.date} className="admin-trend-row">
                <span className="admin-trend-date">{day.date.slice(5)}</span>
                <span className="admin-trend-bar">
                  <span
                    className="admin-trend-bar-fill admin-trend-bar-fill--stt"
                    style={{ width: `${(day.stt / maxTrend) * 100}%` }}
                  />
                  <span
                    className="admin-trend-bar-fill admin-trend-bar-fill--tts"
                    style={{ width: `${(day.tts / maxTrend) * 100}%` }}
                  />
                </span>
                <span className="admin-trend-num">
                  STT {day.stt} · TTS {day.tts}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
