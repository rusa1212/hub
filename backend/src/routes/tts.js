import { Router } from 'express';
import { postTts } from '../controllers/ttsController.js';

const router = Router();

router.post('/', postTts);

export default router;
