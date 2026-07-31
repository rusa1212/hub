import { Router } from 'express';
import multer from 'multer';
import { postStt } from '../controllers/sttController.js';
import { optionalAuth } from '../middleware/auth.js';
import { sttLimiter } from '../middleware/rateLimit.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.post('/', optionalAuth, sttLimiter, upload.single('audio'), postStt);

export default router;
