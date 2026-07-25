import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_VOICE } from './voices';

const STORAGE_KEY = 'airpodslog.settings';
const DEFAULT_SPEED = 1;
const DEFAULT_VOLUME = 1;

// 데이터보관정책: STT 텍스트/대화 기록은 로그인 사용자에 한해 서버(Supabase)에 보관되고,
// 음성 선택/속도/볼륨 같은 재생 설정은 서버에 보내지 않고 이 브라우저에만 저장됨.
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
  const stored = loadStoredSettings();
  const [voice, setVoice] = useState(stored.voice ?? DEFAULT_VOICE);
  const [speed, setSpeed] = useState(stored.speed ?? DEFAULT_SPEED);
  const [volume, setVolume] = useState(stored.volume ?? DEFAULT_VOLUME);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ voice, speed, volume }));
  }, [voice, speed, volume]);

  const value = { voice, setVoice, speed, setSpeed, volume, setVolume };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
