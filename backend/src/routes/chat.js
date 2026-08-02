// 대화 메시지 전송 라우트: POST /api/chat (로그인/익명 모두 가능, 세션 소유자 확인 + rate limit 적용)
import { Router } from 'express';
import { postChat } from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', optionalAuth, chatLimiter, postChat);

export default router;
