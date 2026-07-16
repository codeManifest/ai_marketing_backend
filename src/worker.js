import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Explicitly set worker flag to start the BullMQ worker
process.env.IS_WORKER = 'true';

// Import content-queue to initialize connection and worker
import { contentWorker } from './services/queue/content-queue.js';

console.log('👷 PostlyAI Background Worker process started successfully.');

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n👷 Worker received ${signal}. Shutting down gracefully...`);
  if (contentWorker) {
    try {
      await contentWorker.close();
      console.log('✅ BullMQ worker closed successfully.');
    } catch (err) {
      console.error('❌ Error closing BullMQ worker:', err.message);
    }
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('🔥 Worker Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Worker Unhandled Rejection at:', promise, 'reason:', reason);
});
