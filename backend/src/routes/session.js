// 단일 세션 생성/조회/요약/barge-in 기록 라우트
import { Router } from 'express';
import {
  postSession,
  getSessionById,
  postSessionSummary,
  postSessionInterruption,
} from '../controllers/sessionController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { sessionCreateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', optionalAuth, sessionCreateLimiter, postSession);
router.get('/:id', optionalAuth, getSessionById);
router.post('/:id/summary', requireAuth, postSessionSummary);
router.post('/:id/interruption', optionalAuth, postSessionInterruption);

export default router;
