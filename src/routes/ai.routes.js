import { Router } from 'express';
import { 
  generateContent, 
  getAiCredits, 
  updateAiSettings, 
  performAiOperation, 
  deleteAiCacheOrSettings 
} from '../controllers/ai.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Enforce authentication on all AI routes
router.use(requireAuth);

router.post('/ai/generate-content', generateContent);
router.get('/ai/generate-content', getAiCredits);
router.put('/ai/generate-content', updateAiSettings);
router.patch('/ai/generate-content', performAiOperation);
router.delete('/ai/generate-content', deleteAiCacheOrSettings);

export default router;
