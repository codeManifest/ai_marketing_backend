import { Router } from 'express';
import authRoutes from './auth.routes.js';
import paymentRoutes from './payment.routes.js';
import adminRoutes from './admin.routes.js';
import userRoutes from './user.routes.js';
import socialRoutes from './social.routes.js';
import uploadRoutes from './upload.routes.js';
import publicRoutes from './public.routes.js';
import cronRoutes from './cron.routes.js';
import aiRoutes from './ai.routes.js';
import workspaceRoutes from './workspace.routes.js';

const router = Router();

// Register sub-routers
router.use('/auth', authRoutes);
router.use('/', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/', userRoutes);
router.use('/', socialRoutes);
router.use('/', uploadRoutes);
router.use('/', publicRoutes);
router.use('/', cronRoutes);
router.use('/', aiRoutes);
router.use('/', workspaceRoutes); // handles /workspaces at root level

export default router;
