import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { prisma } from './config/db.js';

import apiRouter from './routes/index.js';

const app = express();

// CORS Config
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Simple API Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`
      ================================
      🌐 [API] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)
      ================================`);
  });
  next();
});

// Central API Routes
app.use('/api', apiRouter);

// Health Check Route
app.get('/health', async (req, res) => {
  try {
    // Simple query to verify database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'success',
      message: 'PostlyAI Server is healthy',
      database: 'connected',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      database: 'disconnected',
      error: error.message
    });
  }
});

// 404 Route Not Found handler
app.use((req, res, next) => {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.originalUrl}`,
      status: 404
    }
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

const port = config.port;
app.listen(port, () => {
  console.log(`🚀 PostlyAI Backend Server running on port ${port} (Frontend URL: ${config.frontendUrl})`);
  console.log(`🔑 Google OAuth Redirect URI: ${config.google.redirectUri}`);
});
