import { Router } from 'express';
import { getUserSubscription } from '../controllers/user.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Enforce authentication on all user endpoints
router.use(requireAuth);

router.get('/user/subscription', getUserSubscription);

export default router;
