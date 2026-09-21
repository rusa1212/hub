// STT/TTS 하루 사용 한도 미들웨어: 호출 1건을 기록하고 한도를 넘었으면 429로 막는다.
//
// "조회 후 통과시키고 나중에 기록"이 아니라 먼저 증가시킨 뒤 판단한다. 동시 요청이 같은
// 한도를 동시에 통과하는 문제를 막을 수 있고, 실패한 Gemini 호출도 비용/쿼터를 쓰기 때문.
import { DAILY_LIMITS, recordUsage, usageKeyFor } from '../services/usageStore.js';

const LABELS = { stt: '음성 인식', tts: '음성 재생' };

export function dailyQuota(kind) {
  return async (req, res, next) => {
    let used;
    try {
      used = await recordUsage(kind, usageKeyFor(req));
    } catch (err) {
      // 집계가 실패해도(마이그레이션 미적용 등) 대화 자체는 막지 않는다. rate limit이 여전히 막아준다.
      console.warn(`[dailyQuota] ${kind} 사용량 기록 실패:`, err.message);
      return next();
    }

    const limit = DAILY_LIMITS[kind];
    res.set('X-Usage-Limit', String(limit));
    res.set('X-Usage-Remaining', String(Math.max(0, limit - used)));

    if (used > limit) {
      return res.status(429).json({
        message: `오늘 ${LABELS[kind]} 사용 가능 횟수(${limit}회)를 모두 썼어요. 내일 다시 시도해주세요.`,
      });
    }
    next();
  };
}
