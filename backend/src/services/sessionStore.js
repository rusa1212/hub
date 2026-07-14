import { randomUUID } from 'node:crypto';

// MVP: 세션 히스토리를 서버 메모리에 보관 (agent.md Step 1 권장안)
const sessions = new Map();

export function createSession() {
  const sessionId = randomUUID();
  sessions.set(sessionId, { history: [] });
  return sessionId;
}

export function getSession(sessionId) {
  return sessions.get(sessionId);
}

export function appendTurn(sessionId, role, text) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.history.push({ role, parts: [{ text }] });
  return session;
}
