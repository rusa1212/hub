import { Router } from 'express';
import { postTts } from '../controllers/ttsController.js';
import { optionalAuth } from '../middleware/auth.js';
import { ttsLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', optionalAuth, ttsLimiter, postTts);

export default router;
