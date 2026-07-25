import { Router } from 'express';
import { getMySessions, deleteMySessions } from '../controllers/sessionController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/mine', requireAuth, getMySessions);
router.delete('/mine', requireAuth, deleteMySessions);

export default router;
