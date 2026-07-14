import { createSession, getSession } from '../services/sessionStore.js';

export function postSession(req, res) {
  const sessionId = createSession();
  res.status(201).json({ sessionId });
}

export function getSessionById(req, res) {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
  }
  res.json({ sessionId: req.params.id, history: session.history });
}
