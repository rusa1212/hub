// 음성 인식(STT) 라우트: POST /api/stt, multipart 오디오 파일을 받아 텍스트로 변환 (rate limit + 하루 사용 한도 적용)
import { Router } from 'express';
import multer from 'multer';
import { postStt } from '../controllers/sttController.js';
import { optionalAuth } from '../middleware/auth.js';
import { sttLimiter } from '../middleware/rateLimit.js';
import { dailyQuota } from '../middleware/dailyQuota.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.post('/', optionalAuth, sttLimiter, dailyQuota('stt'), upload.single('audio'), postStt);

export default router;
