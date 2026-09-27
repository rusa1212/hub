// 상황(페르소나) 목록 라우트: GET /api/situations (로그인 불필요, 공개 정보)
import { Router } from 'express';
import { getSituations } from '../controllers/situationController.js';

const router = Router();

router.get('/', getSituations);

export default router;
