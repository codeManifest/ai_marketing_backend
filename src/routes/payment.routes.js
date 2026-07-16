import { Router } from 'express';
import { createOrder, createOrderHealth, verifyPayment, getAllPlans, getPlanById } from '../controllers/payment.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Order creation routes
router.post('/payments/create-order', createOrder);
router.get('/payments/create-order', createOrderHealth);

// Verification route (Requires Auth)
router.post('/payments/verify', requireAuth, verifyPayment);

// Plans routes
router.get('/plans', getAllPlans);
router.get('/plans/:id', getPlanById);

export default router;
