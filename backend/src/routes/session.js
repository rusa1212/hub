import { Router } from 'express';
import { postSession, getSessionById, postSessionSummary } from '../controllers/sessionController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { sessionCreateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', optionalAuth, sessionCreateLimiter, postSession);
router.get('/:id', optionalAuth, getSessionById);
router.post('/:id/summary', requireAuth, postSessionSummary);

export default router;
