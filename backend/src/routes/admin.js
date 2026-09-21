// 관리자 라우트: GET /api/admin/me (로그인 필요), GET /api/admin/usage (관리자만)
import { Router } from 'express';
import { getAdminMe, getAdminUsage } from '../controllers/adminController.js';
import { attachAdminFlag, requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, attachAdminFlag, getAdminMe);
router.get('/usage', requireAuth, requireAdmin, getAdminUsage);

export default router;
