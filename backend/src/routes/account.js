// 계정 삭제 라우트: DELETE /api/account (로그인 필수)
import { Router } from 'express';
import { deleteAccount } from '../controllers/accountController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.delete('/', requireAuth, deleteAccount);

export default router;
