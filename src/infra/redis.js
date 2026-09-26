import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

export const checkRedisHealth = async (timeoutMs = 2000) => {
  try {
    const healthPromise = (async () => {
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect();
      }
      const ping = await redis.ping();
      return ping === 'PONG';
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis health check timeout')), timeoutMs),
    );

    return await Promise.race([healthPromise, timeoutPromise]);
  } catch (err) {
    logger.error({ err: err.message }, 'Redis health check failed');
    return false;
  }
};
