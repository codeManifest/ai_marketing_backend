import { Router } from 'express';
import { connectSocial, callbackSocial, verifyWebhook, processWebhook } from '../controllers/social.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Social Connection routes
router.get('/social/connect', requireAuth, connectSocial);
router.get('/social/callback', callbackSocial); // No Auth on direct redirect (state holds user ID validation)

// Webhooks verification & processing (No auth, Meta verified token checks validation)
router.get('/webhooks/social', verifyWebhook);
router.post('/webhooks/social', processWebhook);

export default router;
