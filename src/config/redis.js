import Redis from 'ioredis';
import { config } from './env.js';

const getRedisConnection = () => {
  try {
    const connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      connectTimeout: 5000,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    });

    connection.on('error', (err) => {
      console.warn('⚠️ Redis connection error. BullMQ is operating in offline fallback mode.', err.message);
    });

    return connection;
  } catch (error) {
    console.warn('⚠️ Failed to initialize Redis. BullMQ is operating in offline fallback mode.');
    return null;
  }
};

export const redisConnection = getRedisConnection();
