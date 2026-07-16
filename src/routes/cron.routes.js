import { Router } from 'express';
import { generateScheduledContent, runAutopilotCron } from '../controllers/cron.controller.js';

const router = Router();

// Cron routes
router.get('/cron/generate-scheduled-content', generateScheduledContent);
router.get('/cron/autopilot', runAutopilotCron);

export default router;
