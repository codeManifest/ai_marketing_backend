import { Router } from 'express';
import { signup, login, logout, me, googleLogin, googleCallback, checkWorkspaces } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Email / Password authentication routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);

// Session checking route
router.get('/me', requireAuth, me);
router.get('/check-workspaces', requireAuth, checkWorkspaces);

// Google OAuth routes
router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);

export default router;
