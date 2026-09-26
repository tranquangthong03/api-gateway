import { Router } from 'express';
import { checkDbHealth } from '../infra/db.js';
import { checkRedisHealth } from '../infra/redis.js';
import { healthResponseSchema } from '../schemas/health.schema.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res, next) => {
  try {
    const [dbOk, redisOk] = await Promise.all([checkDbHealth(), checkRedisHealth()]);

    const isHealthy = dbOk && redisOk;
    const statusCode = isHealthy ? 200 : 503;

    const payload = healthResponseSchema.parse({
      status: isHealthy ? 'ok' : 'error',
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    });

    res.status(statusCode).json(payload);
  } catch (err) {
    next(err);
  }
});
