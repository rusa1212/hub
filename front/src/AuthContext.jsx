// 로그인 상태(user) 전역 컨텍스트: Supabase 세션 구독, 로그인/가입/로그아웃 함수 제공
//
// Supabase Auth는 내부적으로 이메일을 계정 식별자로 요구하므로, 아이디만으로 가입/로그인하기 위해
// 아이디를 고정된 규칙으로 가짜 이메일(username@USERNAME_EMAIL_DOMAIN)로 변환해 사용한다.
// 이 이메일은 사용자에게 노출되지 않고, 실제 메일함도 존재하지 않는다.
// (Supabase 대시보드 Authentication > Settings에서 "Confirm email"이 꺼져 있어야
//  가입 즉시 로그인 가능한 세션이 발급된다 — 가짜 이메일은 확인 메일을 받을 수 없기 때문)
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext(null);
const USERNAME_EMAIL_DOMAIN = 'users.airpodslog.local';

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    // 가입: 아이디는 raw_user_meta_data로 전달되어, DB 트리거가 profiles.username에 자동으로 채워준다
    signUp: (username, password) =>
      supabase.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: { data: { username: username.trim() } },
      }),
    signIn: (username, password) => supabase.auth.signInWithPassword({ email: usernameToEmail(username), password }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
