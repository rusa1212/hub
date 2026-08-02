// 로그인 사용자의 음성 설정(selectedVoiceId) 조회/저장 라우트: GET/PUT /api/settings (로그인 필수)
import { Router } from 'express';
import { getSettings, putSettings } from '../controllers/settingsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getSettings);
router.put('/', requireAuth, putSettings);

export default router;
