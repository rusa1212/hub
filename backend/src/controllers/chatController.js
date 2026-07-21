import { getSession, appendTurn } from '../services/sessionStore.js';
import { generateReply } from '../services/geminiService.js';

export async function postChat(req, res, next) {
  const { sessionId, message } = req.body;

  if (!sessionId || !message?.trim()) {
    return res.status(400).json({ message: 'sessionId와 message는 필수입니다.' });
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다. /api/session으로 먼저 세션을 생성하세요.' });
    }

    await appendTurn(sessionId, 'user', message);
    const history = [...session.history, { role: 'user', parts: [{ text: message }] }];
    const reply = await generateReply(history, session.situation);
    await appendTurn(sessionId, 'model', reply);
    res.json({ reply });
  } catch (err) {
    next(err);
  }
}
