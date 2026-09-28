// 대화 메시지 처리 컨트롤러: 세션 소유자 확인 후 Gemini에 메시지를 보내고 응답을 히스토리에 저장
import { getSession, appendTurn, setSessionPersona } from '../services/sessionStore.js';
import { generateReply } from '../services/geminiService.js';
import { getPersona, listPersonas } from '../services/personaStore.js';

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
    // 세션 도중 상황이 숨김(is_active=false) 처리돼도 이미 시작한 대화는 원래 상황 프롬프트를 유지한다.
    const persona = await getPersona(session.situation);
    // 대화 중 전환할 수 있는 상황: 선택 화면에 노출 중인 상황 중 현재 상황을 뺀 것 ('그냥 대화'로는 전환하지 않음)
    const switchTargets = (await listPersonas()).filter((p) => p.isActive && p.id !== session.situation);
    const { text: reply, switchedTo } = await generateReply(history, persona, { switchTargets });
    // 전환을 요청한 사용자 발화는 이전 상황으로, 전환 후 답변부터 새 상황으로 기록되게 순서를 둔다.
    await appendTurn(sessionId, 'user', message);
    if (switchedTo) await setSessionPersona(sessionId, switchedTo.id);
    const messageId = await appendTurn(sessionId, 'model', reply);
    // situation은 전환이 일어났을 때만 포함한다 (프런트는 이 키가 있으면 상황 설정을 교체).
    res.json({ reply, messageId, ...(switchedTo && { situation: switchedTo.id }) });
  } catch (err) {
    next(err);
  }
}
