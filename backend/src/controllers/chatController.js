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

    // AI가 503 등으로 답변 생성에 실패한 경우 사용자의 같은 메시지가 DB에 먼저 저장되어
    // 재시도 때 중복되는 일을 줄이기 위해, 답변 생성 성공 후 한 턴을 저장한다.
    const history = [...session.history, { role: 'user', parts: [{ text: message }] }];
    const reply = await generateReply(history, session.situation);
    await appendTurn(sessionId, 'user', message);
    const messageId = await appendTurn(sessionId, 'model', reply);
    res.json({ reply, messageId });
  } catch (err) {
    next(err);
  }
}
