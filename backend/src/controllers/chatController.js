// 대화 메시지 처리 컨트롤러: 세션 소유자 확인 후 Gemini에 메시지를 보내고 응답을 히스토리에 저장
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
    // 로그인 세션(user_id 있음)은 본인만 대화 가능. 익명 세션(user_id NULL)은 그대로 열어둠.
    if (session.userId && session.userId !== req.user?.id) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
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
