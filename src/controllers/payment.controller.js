import  Razorpay from 'razorpay';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { getPlans, verifyAndActivateSubscription } from '../services/subscription-service.js';

// Initialize Razorpay with config key check
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_AU8tfL8OJ8Q6Nd';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'yqNJdZbvQzfInsJPAjObQwQ3';

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Cache for plan details to reduce database queries
const planCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Input validation schema
const validateInput = (amount, currency, planId) => {
  const errors = [];
  if (!planId) errors.push('Plan ID is required');
  if (amount && amount < 0) errors.push('Amount cannot be negative');
  if (currency && currency.length !== 3) errors.push('Invalid currency code');
  return errors;
};

// Rate limiting store
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

const checkRateLimit = (identifier) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, []);
  }
  
  const requests = rateLimitStore.get(identifier).filter(time => time > windowStart);
  rateLimitStore.set(identifier, requests);
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  requests.push(now);
  return true;
};

// Clean up old cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of planCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      planCache.delete(key);
    }
  }
  
  // Clean rate limit store
  const windowStart = now - RATE_LIMIT_WINDOW;
  for (const [key, requests] of rateLimitStore.entries()) {
    const filtered = requests.filter(time => time > windowStart);
    if (filtered.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, filtered);
    }
  }
}, 60000); // Run every minute

/**
 * Creates a Razorpay Order for a plan.
 */
export async function createOrder(req, res) {
  const startTime = Date.now();
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  
  // Rate limiting check
  if (!checkRateLimit(clientIP)) {
    console.warn(`Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({ 
      success: false, 
      error: 'Too many requests. Please try again later.' 
    });
  }

  try {
    const { amount, currency, planId } = req.body;

    // Input validation
    const validationErrors = validateInput(amount, currency, planId);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: validationErrors.join(', ') 
      });
    }

    // Check cache first
    let plan;
    const cacheKey = `plan_${planId}`;
    
    if (planCache.has(cacheKey)) {
      const cached = planCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        plan = cached.data;
        console.log(`Cache hit for plan: ${planId}`);
      } else {
        planCache.delete(cacheKey);
      }
    }

    // Fetch from database if not in cache
    if (!plan) {
      plan = await prisma.plan.findUnique({
        where: { id: planId },
        select: {
          id: true,
          name: true,
          price: true,
          currency: true,
          features: true
        }
      });

      if (plan) {
        planCache.set(cacheKey, {
          data: plan,
          timestamp: Date.now()
        });
      }
    }

    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    // Enhanced free plan detection
    const isFreePlan = 
      plan.price === 0 || 
      plan.price === "0" || 
      plan.price === null || 
      plan.price === undefined ||
      plan.name?.toLowerCase().includes('free') ||
      plan.name?.toLowerCase().includes('trial');

    console.log(`Plan: ${plan.name}, Price: ${plan.price}, Is Free: ${isFreePlan}`);

    // Handle free plans - no Razorpay interaction needed
    if (isFreePlan) {
      const freeOrder = {
        id: `free_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: 0,
        currency: plan.currency || 'INR',
        status: 'created',
        receipt: `free_receipt_${Date.now()}`,
        notes: {
          planId: plan.id,
          planName: plan.name,
          type: 'free_subscription'
        }
      };

      console.log(`Free plan order created: ${freeOrder.id}`);

      return res.json({
        success: true,
        order: freeOrder,
        message: 'Free plan - no payment required',
        isFree: true
      });
    }

    // Handle paid plans with enhanced validation
    const finalAmount = amount || plan.price;
    const finalCurrency = currency || plan.currency || 'INR';

    // Convert amount to paise for INR, or smallest unit for other currencies
    let amountInSmallestUnit;
    if (finalCurrency === 'INR') {
      amountInSmallestUnit = Math.round(finalAmount * 100); // Convert to paise
    } else {
      amountInSmallestUnit = Math.round(finalAmount * 100); // Default to cents-like units
    }

    // Validate amount for paid plans
    if (!finalAmount || finalAmount <= 0 || amountInSmallestUnit <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid positive amount is required for paid plans',
        details: {
          providedAmount: finalAmount,
          calculatedAmount: amountInSmallestUnit,
          currency: finalCurrency
        }
      });
    }

    // Razorpay order creation with timeout
    const orderOptions = {
      amount: amountInSmallestUnit,
      currency: finalCurrency,
      receipt: `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      notes: {
        planId: plan.id,
        planName: plan.name,
        type: 'subscription',
        timestamp: new Date().toISOString()
      },
      payment_capture: 1 // Auto capture payment
    };

    // Create Razorpay order with timeout
    const razorpayPromise = razorpay.orders.create(orderOptions);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Razorpay API timeout')), 10000); // 10 second timeout
    });

    const order = await Promise.race([razorpayPromise, timeoutPromise]);
    const responseTime = Date.now() - startTime;
    console.log(`Order created successfully in ${responseTime}ms:`, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.name
    });

    return res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },
      isFree: false,
      responseTime
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Error creating payment order:', {
      error: error.message,
      clientIP,
      responseTime,
      timestamp: new Date().toISOString()
    });

    if (error.message.includes('timeout')) {
      return res.status(504).json({ 
        success: false, 
        error: 'Payment service timeout. Please try again.' 
      });
    }

    if (error.error?.code === 'BAD_REQUEST_ERROR') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid payment request',
        details: error.error.description 
      });
    }

    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create payment order',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

/**
 * Health check endpoint for payments.
 */
export async function createOrderHealth(req, res) {
  return res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      rateLimiting: true,
      caching: true,
      freePlanSupport: true
    }
  });
}

/**
 * Verifies Razorpay signature and activates subscription.
 */
export async function verifyPayment(req, res) {
  try {
    const { paymentId, orderId, signature, workspaceId, planId } = req.body;

    console.log('Payment verification request:', { 
      paymentId, 
      orderId, 
      workspaceId, 
      planId,
      signatureLength: signature?.length 
    });

    // Validate required fields
    if (!paymentId || !orderId || !signature || !workspaceId || !planId) {
      console.error('Missing required fields:', { paymentId, orderId, signature, workspaceId, planId });
      return res.status(400).json({ error: "Missing required payment verification fields" });
    }

    const subscription = await verifyAndActivateSubscription(
      paymentId,
      orderId,
      signature,
      workspaceId,
      planId
    );

    console.log('Payment verified successfully for workspace:', workspaceId);

    return res.json({ 
      success: true,
      message: "Payment verified successfully",
      subscription 
    });

  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(400).json({ 
      error: error.message || "Payment verification failed",
      details: "Please contact support if this issue persists"
    });
  }
}

/**
 * Get all available plans.
 */
export async function getAllPlans(req, res) {
  try {
    const plans = await getPlans();
    return res.json({ plans });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Get specific plan details by ID.
 */
export async function getPlanById(req, res) {
  try {
    const { id } = req.params;
    const plan = await prisma.plan.findUnique({
      where: { id }
    });
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    return res.json(plan);
  } catch (error) {
    console.error('Error fetching plan:', error);
    return res.status(500).json({ error: 'Failed to fetch plan' });
  }
}
