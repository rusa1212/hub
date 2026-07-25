import { createSession, getSession, getSessionsByUser, deleteSessionsByUser } from '../services/sessionStore.js';
import { SITUATION_LABELS } from '../services/geminiService.js';

export async function postSession(req, res, next) {
  const { situation } = req.body ?? {};
  if (situation && !SITUATION_LABELS[situation]) {
    return res.status(400).json({ message: `situation은 ${Object.keys(SITUATION_LABELS).join(', ')} 중 하나여야 합니다.` });
  }
  try {
    const sessionId = await createSession(situation ?? null, req.user?.id ?? null);
    res.status(201).json({ sessionId });
  } catch (err) {
    next(err);
  }
}

export async function getSessionById(req, res, next) {
  try {
    const session = await getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    // 로그인 세션(user_id 있음)은 본인만 상세 조회 가능. 익명 세션(user_id NULL)은 그대로 열람 가능.
    if (session.userId && session.userId !== req.user?.id) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    res.json({ sessionId: req.params.id, situation: session.situation, history: session.history });
  } catch (err) {
    next(err);
  }
}

export async function getMySessions(req, res, next) {
  try {
    const sessions = await getSessionsByUser(req.user.id);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

export async function deleteMySessions(req, res, next) {
  try {
    await deleteSessionsByUser(req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
