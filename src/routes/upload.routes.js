import { Router } from 'express';
import { uploadFile } from '../controllers/upload.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Upload requires authentication
router.post('/upload', requireAuth, uploadFile);

export default router;
