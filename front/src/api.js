async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `요청 실패 (${res.status})`);
  }
  return data;
}

export function createSession() {
  return request('/api/session', { method: 'POST' });
}

export function sendMessage(sessionId, message) {
  return request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });
}
