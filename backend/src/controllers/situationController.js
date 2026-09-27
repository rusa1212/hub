// 상황(페르소나) 목록 조회 컨트롤러: 선택 화면·기록·리캡 화면이 쓰는 라벨/이모지/인사말을 내려준다
import { listPersonas } from '../services/personaStore.js';

export async function getSituations(req, res, next) {
  try {
    const personas = await listPersonas();
    // prompt는 서버 내부용(시스템 프롬프트)이라 응답에서 제외한다.
    const situations = personas.map(({ id, label, emoji, greeting, isActive }) => ({ id, label, emoji, greeting, isActive }));
    res.json({ situations });
  } catch (err) {
    next(err);
  }
}
