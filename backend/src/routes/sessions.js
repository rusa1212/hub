// 로그인 사용자 본인의 세션 목록 조회/전체 삭제 라우트: GET/DELETE /api/sessions/mine (둘 다 로그인 필수)
import { Router } from 'express';
import { getMySessions, deleteMySessions } from '../controllers/sessionController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/mine', requireAuth, getMySessions);
router.delete('/mine', requireAuth, deleteMySessions);

export default router;
