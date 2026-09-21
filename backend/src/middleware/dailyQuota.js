// STT/TTS 하루 사용 한도 미들웨어: 호출 1건을 기록하고 한도를 넘었으면 429로 막는다.
//
// "조회 후 통과시키고 나중에 기록"이 아니라 먼저 증가시킨 뒤 판단한다. 동시 요청이 같은
// 한도를 동시에 통과하는 문제를 막을 수 있고, 실패한 Gemini 호출도 비용/쿼터를 쓰기 때문.
import { PER_USER_LIMITS, PROJECT_QUOTAS, recordUsage, usageKeyFor } from '../services/usageStore.js';

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

    const label = LABELS[kind];
    const projectQuota = PROJECT_QUOTAS[kind];
    const userLimit = PER_USER_LIMITS[kind];

    // 잔여 헤더는 더 빡빡한 쪽(먼저 바닥나는 쪽)을 기준으로 알려준다.
    const remainders = [
      projectQuota == null || used.project == null ? null : projectQuota - used.project,
      userLimit == null ? null : userLimit - used.user,
    ].filter((v) => v != null);
    if (remainders.length > 0) {
      res.set('X-Usage-Remaining', String(Math.max(0, Math.min(...remainders))));
    }

    // 프로젝트 쿼터가 실제 Gemini 한도라 더 근본적이므로 먼저 본다.
    if (projectQuota != null && used.project != null && used.project > projectQuota) {
      return res.status(429).json({
        message: `오늘 서비스 전체의 ${label} 한도(${projectQuota}회)를 모두 썼어요. 내일 다시 시도해주세요.`,
      });
    }

    if (userLimit != null && used.user > userLimit) {
      return res.status(429).json({
        message: `오늘 ${label} 사용 가능 횟수(${userLimit}회)를 모두 썼어요. 내일 다시 시도해주세요.`,
      });
    }

    next();
  };
}
