import { Router } from 'express';
import { getSettings, putSettings } from '../controllers/settingsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getSettings);
router.put('/', requireAuth, putSettings);

export default router;
