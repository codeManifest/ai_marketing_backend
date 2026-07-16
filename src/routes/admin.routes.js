import { Router } from 'express';
import { 
  getStats, 
  getUsers, 
  updateUserStatus, 
  getWorkspaces, 
  updateWorkspaceStatus, 
  getAdminPlans, 
  updatePlan, 
  createPlan, 
  deletePlan, 
  getAiConfigs, 
  updateAiConfig 
} from '../controllers/admin.controller.js';
import { requireAuth, requireSuperAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Apply authentication and superadmin check to all admin routes
router.use(requireAuth);
router.use(requireSuperAdmin);

// Admin Stats
router.get('/stats', getStats);

// Admin User Moderation
router.get('/users', getUsers);
router.put('/users', updateUserStatus);

// Admin Workspace Moderation
router.get('/workspaces', getWorkspaces);
router.put('/workspaces', updateWorkspaceStatus);

// Admin Plan Management
router.get('/plans', getAdminPlans);
router.put('/plans', updatePlan);
router.post('/plans', createPlan);
router.delete('/plans', deletePlan);

// Admin AI Configurations
router.get('/ai-configs', getAiConfigs);
router.put('/ai-configs', updateAiConfig);

export default router;
