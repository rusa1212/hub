// 음성 합성(TTS) 라우트: POST /api/tts, 텍스트를 오디오(WAV)로 변환해 반환 (rate limit 적용)
import { Router } from 'express';
import { postTts } from '../controllers/ttsController.js';
import { optionalAuth } from '../middleware/auth.js';
import { ttsLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', optionalAuth, ttsLimiter, postTts);

export default router;
