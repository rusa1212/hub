import { Router } from 'express';

const router = Router();

// Step 3에서 구현 예정: 음성 파일 -> 텍스트 변환
router.post('/', (req, res) => {
  res.status(501).json({ message: 'STT는 아직 구현되지 않았습니다.' });
});

export default router;
