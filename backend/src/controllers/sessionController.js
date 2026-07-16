import { createSession, getSession } from '../services/sessionStore.js';
import { SITUATION_LABELS } from '../services/geminiService.js';

export function postSession(req, res) {
  const { situation } = req.body ?? {};
  if (situation && !SITUATION_LABELS[situation]) {
    return res.status(400).json({ message: `situation은 ${Object.keys(SITUATION_LABELS).join(', ')} 중 하나여야 합니다.` });
  }
  const sessionId = createSession(situation ?? null);
  res.status(201).json({ sessionId });
}

export function getSessionById(req, res) {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
  }
  res.json({ sessionId: req.params.id, history: session.history });
}
