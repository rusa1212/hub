// API/비용 남용 방지용 rate limit 미들웨어 모음 (chat/stt/tts/세션 생성 각각 별도 한도)
import rateLimit from 'express-rate-limit';

// req.user는 optionalAuth가 먼저 실행되어야 채워짐 (라우트에서 순서 지켜야 함)
const keyGenerator = (req) => req.user?.id ?? req.ip;
const handler = (req, res) =>
  res.status(429).json({ message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' });

// in-memory store: 서버 재시작 시 초기화되고 인스턴스 간 공유되지 않음.
// 개인 프로젝트 규모에서는 충분하며, Redis 등 별도 store는 과함.
export const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  keyGenerator,
  handler,
  standardHeaders: true,
  legacyHeaders: false,
});

export const sttLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  keyGenerator,
  handler,
  standardHeaders: true,
  legacyHeaders: false,
});

// 대화 응답 재생 + 설정 화면 음성 미리듣기가 합산되는 트래픽이라 chat/stt보다 여유를 둠
export const ttsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  keyGenerator,
  handler,
  standardHeaders: true,
  legacyHeaders: false,
});

export const sessionCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator,
  handler,
  standardHeaders: true,
  legacyHeaders: false,
});
