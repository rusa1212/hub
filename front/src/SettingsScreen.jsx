import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { deleteMySessions } from './api';
import { VOICES } from './voices';
import './Auth.css';
import './Settings.css';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { voice, setVoice, speed, setSpeed, volume, setVolume } = useSettings();
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteHistory = async () => {
    if (!window.confirm('저장된 모든 대화 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
    setDeleting(true);
    setDeleteMessage('');
    setDeleteError('');
    try {
      await deleteMySessions();
      setDeleteMessage('대화 기록을 모두 삭제했어요.');
    } catch (err) {
      setDeleteError(err.message || '대화 기록 삭제에 실패했어요.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="settings-screen">
      <header className="history-header">
        <button className="history-back-btn" type="button" onClick={() => navigate(-1)} aria-label="뒤로">
          ←
        </button>
        <h2 className="auth-title">설정</h2>
        <span className="history-header-spacer" aria-hidden="true" />
      </header>

      <section className="settings-section">
        <h3 className="settings-section-title">음성 선택</h3>
        <select
          className="settings-select"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} · {v.description}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <div className="settings-row-label">
          <h3 className="settings-section-title">AI 목소리 속도</h3>
          <span className="settings-value">{speed.toFixed(2)}x</span>
        </div>
        <input
          className="settings-slider"
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        />
      </section>

      <section className="settings-section">
        <div className="settings-row-label">
          <h3 className="settings-section-title">음성 볼륨</h3>
          <span className="settings-value">{Math.round(volume * 100)}%</span>
        </div>
        <input
          className="settings-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">데이터 보관 정책</h3>
        <p className="settings-policy-text">
          음성 원본은 저장하지 않고, 인식된 텍스트와 대화 내용만 보관해요.
          <br />
          대화 기록은 로그인한 경우에만 서버에 저장되며, 로그인 전 대화는 어디에도 기록되지 않아요.
          <br />
          위의 음성 선택 · 속도 · 볼륨 설정은 서버로 전송되지 않고 이 기기에만 저장돼요.
        </p>
      </section>

      {user && (
        <section className="settings-section">
          <h3 className="settings-section-title">세션 기록 삭제</h3>
          <p className="settings-hint-text">저장된 모든 대화 기록을 이 기기가 아닌 서버에서 영구히 삭제해요.</p>
          {deleteMessage && <p className="auth-message auth-message--info">✓ {deleteMessage}</p>}
          {deleteError && <p className="auth-message auth-message--error">⚠ {deleteError}</p>}
          <button
            className="account-delete-button"
            type="button"
            onClick={handleDeleteHistory}
            disabled={deleting}
          >
            {deleting ? '삭제 중...' : '🗑 세션 기록 삭제'}
          </button>
        </section>
      )}

      <div className="settings-footer">
        {user ? (
          <button className="settings-logout-button" type="button" onClick={handleSignOut}>
            로그아웃
          </button>
        ) : (
          <p className="settings-hint-text">로그인하면 대화 기록 삭제·로그아웃을 이용할 수 있어요.</p>
        )}
      </div>
    </div>
  );
}
