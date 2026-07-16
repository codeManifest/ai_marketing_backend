// app/lib/queue/content-queue.js
import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../../config/redis.js';
import { AutomatedContentService } from '../automated-content-service.js';
import { prisma } from '../../config/db.js';

const QUEUE_NAME = 'content-queue';

// Check if we have a valid Redis connection
const isRedisAvailable = () => {
  return redisConnection && redisConnection.status === 'ready' || redisConnection?.status === 'connecting';
};

// Define content Queue
export let contentQueue = null;
if (isRedisAvailable()) {
  try {
    contentQueue = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });
    console.log('✅ BullMQ Content Queue initialized successfully.');
  } catch (error) {
    console.warn('⚠️ Failed to initialize BullMQ Queue. Operating in synchronous fallback mode.', error.message);
  }
}

// Helper function to dispatch jobs safely
export async function enqueueContentGeneration(contentPlanId) {
  if (contentQueue && isRedisAvailable()) {
    try {
      console.log(`📡 Enqueuing content generation job for plan ${contentPlanId} via BullMQ...`);
      await contentQueue.add('generate-posts', { contentPlanId });
      return { status: 'queued' };
    } catch (error) {
      console.warn('⚠️ BullMQ enqueue failed. Falling back to synchronous inline execution...', error.message);
    }
  }

  // Fallback to synchronous inline execution
  console.log(`⚡ Running content generation inline synchronously for plan ${contentPlanId}...`);
  const plan = await prisma.contentPlan.findUnique({
    where: { id: contentPlanId },
    include: { category: true, prompt: true, template: true }
  });
  if (plan) {
    await AutomatedContentService.generateBatchPostsForPlan(plan);
  }
  return { status: 'inline_executed' };
}

// Background worker setup (only runs if Redis connection is active and IS_WORKER flag is set)
export let contentWorker = null;
if (isRedisAvailable() && process.env.IS_WORKER === 'true') {
  try {
    contentWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { contentPlanId } = job.data;
        console.log(`👷 Worker started processing job: ${job.id} (ContentPlan: ${contentPlanId})`);
        
        // Dynamic fetch to obtain latest model data
        const plan = await prisma.contentPlan.findUnique({
          where: { id: contentPlanId },
          include: {
            category: true,
            prompt: true,
            template: true
          }
        });

        if (!plan) {
          throw new Error(`ContentPlan ${contentPlanId} not found in database`);
        }

        await AutomatedContentService.generateBatchPostsForPlan(plan);
        console.log(`👷 Worker successfully completed job: ${job.id}`);
      },
      {
        connection: redisConnection,
        concurrency: 2 // Max parallel jobs per process
      }
    );

    contentWorker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} failed:`, err.message);
    });

    console.log('✅ BullMQ Content Worker process started.');
  } catch (error) {
    console.warn('⚠️ BullMQ Worker setup failed.', error.message);
  }
}
