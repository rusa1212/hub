import { supabase } from './supabaseClient';

async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `요청 실패 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// 로그인 상태면 Authorization 헤더를, 아니면 빈 객체를 반환 (익명 요청은 그대로 통과)
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createSession(situation) {
  return request('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ situation: situation ?? null }),
  });
}

export async function getMySessions() {
  return request('/api/sessions/mine', {
    headers: await authHeaders(),
  });
}

export async function getSessionDetail(sessionId) {
  return request(`/api/session/${sessionId}`, {
    headers: await authHeaders(),
  });
}

// 대화 종료 시 호출: 로그인 사용자에 한해 한 줄 요약을 생성해 세션에 저장
export async function summarizeSession(sessionId) {
  return request(`/api/session/${sessionId}/summary`, {
    method: 'POST',
    headers: await authHeaders(),
  });
}

export async function deleteAccount() {
  const res = await fetch('/api/account', {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `요청 실패 (${res.status})`);
  }
}

export async function deleteMySessions() {
  const res = await fetch('/api/sessions/mine', {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `요청 실패 (${res.status})`);
  }
}

export async function sendMessage(sessionId, message) {
  return request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ sessionId, message }),
  });
}

export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'input.wav');
  return request('/api/stt', { method: 'POST', headers: await authHeaders(), body: formData });
}

export async function getMySettings() {
  return request('/api/settings', {
    headers: await authHeaders(),
  });
}

export async function updateMySettings(voice) {
  return request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ voice }),
  });
}

export async function synthesizeSpeech(text, voice) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || `요청 실패 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.blob();
}
