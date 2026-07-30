import { Router } from 'express';
import { postSession, getSessionById, postSessionSummary } from '../controllers/sessionController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', optionalAuth, postSession);
router.get('/:id', optionalAuth, getSessionById);
router.post('/:id/summary', requireAuth, postSessionSummary);

export default router;
