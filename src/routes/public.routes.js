import { Router } from 'express';
import { 
  getPublicBlogs, 
  getPublicWidget, 
  saveTrackingEvent, 
  getPublicForm, 
  submitPublicForm 
} from '../controllers/public.controller.js';

const router = Router();

// Public Blogs
router.get('/public/blogs', getPublicBlogs);

// Floating Widget & Tracking Pixel
router.get('/public/pixel', getPublicWidget);
router.post('/public/pixel', saveTrackingEvent);

// Embedded Form Layout & Submissions
router.get('/public/forms/:formId/submit', getPublicForm);
router.post('/public/forms/:formId/submit', submitPublicForm);

export default router;
