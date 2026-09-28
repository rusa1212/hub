// 상황(페르소나) 목록 조회 컨트롤러: 선택 화면·기록·리캡 화면이 쓰는 라벨/이모지/인사말을 내려준다
import { listPersonas } from '../services/personaStore.js';

export async function getSituations(req, res, next) {
  try {
    const personas = await listPersonas();
    // prompt/ttsStyle/maxSentences는 서버 내부용(시스템 프롬프트·TTS 지시)이라 응답에서 제외한다.
    const situations = personas.map(({ id, label, emoji, greeting, description, isActive, silenceThreshold, silenceDurationMs, features }) => ({
      id,
      label,
      emoji,
      greeting,
      description,
      isActive,
      silenceThreshold,
      silenceDurationMs,
      features,
    }));
    res.json({ situations });
  } catch (err) {
    next(err);
  }
}
