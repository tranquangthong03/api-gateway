import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { pool } from './infra/db.js';
import { redis } from './infra/redis.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'AI Gateway HTTP server listening');
});

const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Received termination signal. Starting graceful shutdown...');

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
    } else {
      logger.info('HTTP server closed');
    }

    try {
      await pool.end();
      logger.info('PostgreSQL pool closed');
    } catch (dbErr) {
      logger.error({ dbErr }, 'Error closing PostgreSQL pool');
    }

    try {
      await redis.quit();
      logger.info('Redis client disconnected');
    } catch (redisErr) {
      logger.error({ redisErr }, 'Error disconnecting Redis client');
    }

    process.exit(err ? 1 : 0);
  });

  // Force shutdown after 10s timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
