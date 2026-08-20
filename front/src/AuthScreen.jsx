// 로그인/회원가입 화면 (아이디/비밀번호). 이메일은 내부적으로만 쓰이고 사용자에게는 노출되지 않는다.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Auth.css';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export default function AuthScreen() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'signUp') {
      if (!USERNAME_PATTERN.test(username)) {
        setError('아이디는 영문/숫자/밑줄로 3~20자로 입력해주세요.');
        return;
      }
      if (password !== passwordConfirm) {
        setError('비밀번호가 일치하지 않아요.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        const { error: signInError } = await signIn(username, password);
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await signUp(username, password);
        if (signUpError) throw signUpError;
        if (!data.session) {
          throw new Error(
            '이메일 확인이 필요하게 설정되어 있어 가입이 완료되지 않았어요. Supabase 대시보드 Authentication 설정에서 "Confirm email"을 꺼주세요.'
          );
        }
      }
      navigate('/');
    } catch (err) {
      setError(err.message || '요청 중 오류가 발생했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <button className="auth-close" type="button" onClick={() => navigate('/')} aria-label="닫기">
        ✕
      </button>

      <div className="auth-badge">🎧</div>
      <h2 className="auth-title">{mode === 'signIn' ? '다시 오셨네요' : '함께 시작해요'}</h2>
      <p className="auth-subtitle">
        로그인하면 대화 기록을 다시 볼 수 있어요.
        <br />
        로그인 없이도 모든 대화 기능은 그대로 사용할 수 있어요.
      </p>

      <div className="auth-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'signIn'}
          className={`auth-tab ${mode === 'signIn' ? 'auth-tab--active' : ''}`}
          type="button"
          onClick={() => switchMode('signIn')}
        >
          로그인
        </button>
        <button
          role="tab"
          aria-selected={mode === 'signUp'}
          className={`auth-tab ${mode === 'signUp' ? 'auth-tab--active' : ''}`}
          type="button"
          onClick={() => switchMode('signUp')}
        >
          회원가입
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span className="auth-field-icon" aria-hidden="true">👤</span>
          <input
            className="auth-input"
            type="text"
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
        </label>
        <label className="auth-field">
          <span className="auth-field-icon" aria-hidden="true">🔒</span>
          <input
            className="auth-input"
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>
        {mode === 'signUp' && (
          <label className="auth-field">
            <span className="auth-field-icon" aria-hidden="true">🔒</span>
            <input
              className="auth-input"
              type="password"
              placeholder="비밀번호 확인"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
        )}

        {error && <p className="auth-message auth-message--error">⚠ {error}</p>}

        <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? (
            <span className="auth-spinner" aria-hidden="true" />
          ) : mode === 'signIn' ? (
            '로그인'
          ) : (
            '가입하기'
          )}
        </button>
      </form>

      <button className="auth-back" type="button" onClick={() => navigate('/')}>
        로그인 없이 계속하기 →
      </button>
    </div>
  );
}
