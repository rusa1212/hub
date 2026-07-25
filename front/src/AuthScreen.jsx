import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Auth.css';

// 이메일/비밀번호 로그인·회원가입. 로그인은 선택사항이라 언제든 건너뛸 수 있음
// (docs/3rd_wk/Authplan.md 1절).
export default function AuthScreen() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        const { error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
        navigate('/');
      } else {
        const { error: signUpError } = await signUp(email, password);
        if (signUpError) throw signUpError;
        setInfo('가입 확인 이메일을 보냈어요. 확인 후 로그인해주세요.');
        setMode('signIn');
      }
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
          <span className="auth-field-icon" aria-hidden="true">✉️</span>
          <input
            className="auth-input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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

        {error && <p className="auth-message auth-message--error">⚠ {error}</p>}
        {info && <p className="auth-message auth-message--info">✓ {info}</p>}

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
