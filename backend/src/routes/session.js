import { Router } from 'express';
import { postSession, getSessionById } from '../controllers/sessionController.js';

const router = Router();

router.post('/', postSession);
router.get('/:id', getSessionById);

export default router;
