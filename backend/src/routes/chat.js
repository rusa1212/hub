import { Router } from 'express';
import { postChat } from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', optionalAuth, chatLimiter, postChat);

export default router;
