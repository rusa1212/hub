import { Router } from 'express';

const router = Router();

// Step 4에서 구현 예정: 텍스트 + 목소리 옵션 -> 음성 파일
router.post('/', (req, res) => {
  res.status(501).json({ message: 'TTS는 아직 구현되지 않았습니다.' });
});

export default router;
