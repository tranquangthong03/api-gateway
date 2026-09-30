import { Router } from 'express';
import { checkDbHealth, checkSchemaHealth } from '../infra/db.js';
import { checkRedisHealth } from '../infra/redis.js';
import { healthResponseSchema, rootResponseSchema } from '../schemas/health.schema.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const payload = rootResponseSchema.parse({
    name: 'ai-gateway',
    version: '1.0.0',
    docs: '/docs',
    health: '/health',
  });
  res.status(200).json(payload);
});

healthRouter.get('/health', async (_req, res, next) => {
  try {
    const [dbOk, redisOk, schemaOk] = await Promise.all([
      checkDbHealth(),
      checkRedisHealth(),
      checkSchemaHealth(),
    ]);

    const isHealthy = dbOk && redisOk && schemaOk;
    const statusCode = isHealthy ? 200 : 503;

    const payload = healthResponseSchema.parse({
      status: isHealthy ? 'ok' : 'error',
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      schema: schemaOk ? 'ok' : 'error',
    });

    res.status(statusCode).json(payload);
  } catch (err) {
    next(err);
  }
});
