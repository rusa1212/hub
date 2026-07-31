import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { deleteMySessions, synthesizeSpeech } from './api';
import { VOICES, PREVIEW_TEXT } from './voices';
import './Auth.css';
import './Settings.css';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { voice, setVoice, speed, setSpeed, volume, setVolume } = useSettings();
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const previewAudioRef = useRef(null);
  const previewUrlRef = useRef(null);
  const selectedVoice = VOICES.find((v) => v.id === voice) ?? VOICES[0];

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // 미리듣기 버튼 연타 방지: 한 번에 하나의 미리듣기만 재생되도록 로딩/재생 중엔 무시
  const handlePreview = async (voiceId) => {
    if (previewingVoice) return;
    setPreviewingVoice(voiceId);
    try {
      const audioBlob = await synthesizeSpeech(PREVIEW_TEXT, voiceId);
      const url = URL.createObjectURL(audioBlob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      const audio = previewAudioRef.current ?? new Audio();
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingVoice(null);
      audio.onerror = () => setPreviewingVoice(null);
      audio.src = url;
      await audio.play();
    } catch (err) {
      console.error('음성 미리듣기 실패:', err);
      setPreviewingVoice(null);
    }
  };

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
        {!pickerOpen ? (
          <div className="voice-current-row">
            <span className="voice-current-info">
              <span className="voice-card-label">{selectedVoice.label}</span>
              <span className="voice-card-desc">{selectedVoice.description}</span>
            </span>
            <button
              type="button"
              className="voice-picker-toggle"
              onClick={() => setPickerOpen(true)}
            >
              음성 선택
            </button>
          </div>
        ) : (
          <div className="voice-card-list" role="radiogroup" aria-label="음성 선택">
            {VOICES.map((v) => {
              const selected = voice === v.id;
              const isPreviewing = previewingVoice === v.id;
              return (
                <div
                  key={v.id}
                  className={`voice-card${selected ? ' voice-card--selected' : ''}`}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => {
                    setVoice(v.id);
                    setPickerOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setVoice(v.id);
                      setPickerOpen(false);
                    }
                  }}
                >
                  <span className="voice-card-radio" aria-hidden="true" />
                  <span className="voice-card-info">
                    <span className="voice-card-label">{v.label}</span>
                    <span className="voice-card-desc">{v.description}</span>
                  </span>
                  <button
                    type="button"
                    className="voice-preview-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(v.id);
                    }}
                    disabled={previewingVoice !== null}
                    aria-label={`${v.label} 미리듣기`}
                  >
                    {isPreviewing ? '재생 중…' : '▶ 미리듣기'}
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="voice-picker-close"
              onClick={() => setPickerOpen(false)}
            >
              닫기
            </button>
          </div>
        )}
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
          음성 선택은 로그인 시 서버에도 저장되어 다른 기기에서도 유지돼요. 속도 · 볼륨 설정은 서버로 전송되지 않고 이 기기에만 저장돼요.
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
