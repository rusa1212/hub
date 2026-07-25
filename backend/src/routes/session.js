import { Router } from 'express';
import { postSession, getSessionById } from '../controllers/sessionController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', optionalAuth, postSession);
router.get('/:id', optionalAuth, getSessionById);

export default router;
