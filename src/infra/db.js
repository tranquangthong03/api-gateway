import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

export const checkDbHealth = async (timeoutMs = 2000) => {
  try {
    const queryPromise = pool.query('SELECT 1 AS ok');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB health check timeout')), timeoutMs),
    );
    const res = await Promise.race([queryPromise, timeoutPromise]);
    return res.rows[0]?.ok === 1;
  } catch (err) {
    logger.error({ err: err.message }, 'DB health check failed');
    return false;
  }
};
