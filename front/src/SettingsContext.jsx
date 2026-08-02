// 음성/속도/볼륨 설정 전역 컨텍스트: localStorage에 항상 저장하고, 로그인 시엔 음성 선택만 서버와 동기화
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_VOICE } from './voices';
import { useAuth } from './AuthContext';
import { getMySettings, updateMySettings } from './api';

const STORAGE_KEY = 'airpodslog.settings';
const DEFAULT_SPEED = 1;
const DEFAULT_VOLUME = 1;

// 데이터보관정책: STT 텍스트/대화 기록은 로그인 사용자에 한해 서버(Supabase)에 보관됨.
// 음성 선택은 로그인 사용자에 한해 서버에도 저장되어 다른 기기에서도 유지되고,
// 속도/볼륨 같은 나머지 재생 설정은 서버로 보내지 않고 이 브라우저에만 저장됨.
function loadStoredSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const stored = loadStoredSettings();
  const [voice, setVoiceState] = useState(stored.voice ?? DEFAULT_VOICE);
  const [speed, setSpeed] = useState(stored.speed ?? DEFAULT_SPEED);
  const [volume, setVolume] = useState(stored.volume ?? DEFAULT_VOLUME);
  const syncedUserIdRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ voice, speed, volume }));
  }, [voice, speed, volume]);

  // 로그인 시 서버에 저장된 음성 설정을 한 번 불러와 반영 (다른 기기에서 고른 값 유지)
  useEffect(() => {
    if (!user || syncedUserIdRef.current === user.id) return;
    syncedUserIdRef.current = user.id;
    getMySettings()
      .then((data) => {
        if (data?.selectedVoiceId) setVoiceState(data.selectedVoiceId);
      })
      .catch((err) => console.error('음성 설정 동기화 실패:', err));
  }, [user]);

  const setVoice = (nextVoice) => {
    setVoiceState(nextVoice);
    if (user) {
      updateMySettings(nextVoice).catch((err) => console.error('음성 설정 저장 실패:', err));
    }
  };

  const value = { voice, setVoice, speed, setSpeed, volume, setVolume };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
