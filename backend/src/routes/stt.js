import { Router } from 'express';
import multer from 'multer';
import { postStt } from '../controllers/sttController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.post('/', upload.single('audio'), postStt);

export default router;
