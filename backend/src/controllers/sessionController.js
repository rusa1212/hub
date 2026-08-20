// 세션 생성/조회/목록/삭제/요약 컨트롤러
import {
  createSession,
  getSession,
  getSessionsByUser,
  deleteSession,
  deleteSessionsByUser,
  setSessionSummary,
  recordInterruption,
} from '../services/sessionStore.js';
import { SITUATION_LABELS, summarizeSession } from '../services/geminiService.js';

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

// 대화 종료 시 프론트에서 호출: 로그인 사용자 본인 세션에 한해 한 줄 요약을 생성/저장
export async function postSessionSummary(req, res, next) {
  try {
    const session = await getSession(req.params.id);
    if (!session || (session.userId && session.userId !== req.user?.id)) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }

    let summary = session.summary;
    if (!summary && session.history.length > 0) {
      summary = await summarizeSession(session.history);
      await setSessionSummary(req.params.id, summary);
    }

    const userMessageCount = session.history.filter((message) => message.role === 'user').length;
    res.json({
      sessionId: req.params.id,
      situation: session.situation,
      summary: summary || null,
      messageCount: session.history.length,
      userMessageCount,
      createdAt: session.createdAt,
      endedAt: session.lastActiveAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function postSessionInterruption(req, res, next) {
  try {
    const session = await getSession(req.params.id);
    if (!session || (session.userId && session.userId !== req.user?.id)) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    const { messageId = null, playbackMs = null } = req.body ?? {};
    if (playbackMs !== null && (!Number.isFinite(playbackMs) || playbackMs < 0)) {
      return res.status(400).json({ message: 'playbackMs는 0 이상의 숫자여야 합니다.' });
    }
    const recorded = await recordInterruption(req.params.id, { messageId, playbackMs });
    if (!recorded) {
      return res.status(404).json({ message: '중단할 assistant 메시지를 찾을 수 없습니다.' });
    }
    res.status(201).json({ recorded: true });
  } catch (err) {
    next(err);
  }
}

// 로그인 사용자 본인 세션 개별 삭제. 본인 소유가 아니면 getSessionById와 동일하게 404로 응답.
export async function deleteSessionById(req, res, next) {
  try {
    const session = await getSession(req.params.id);
    if (!session || session.userId !== req.user.id) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    await deleteSession(req.params.id);
    res.status(204).send();
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
