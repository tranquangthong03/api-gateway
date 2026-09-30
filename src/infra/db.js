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

export const checkSchemaHealth = async (timeoutMs = 2000) => {
  try {
    const checkPromise = (async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const migrationsDir = path.resolve(process.cwd(), 'migrations');
      const files = await fs.readdir(migrationsDir);
      const migrationFiles = files.filter((f) => !f.startsWith('.'));

      const res = await pool.query('SELECT COUNT(*)::int AS count FROM pgmigrations');
      const appliedCount = res.rows[0]?.count ?? -1;

      return appliedCount === migrationFiles.length && migrationFiles.length > 0;
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Schema health check timeout')), timeoutMs),
    );

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (err) {
    logger.error({ err: err.message }, 'Schema health check failed');
    return false;
  }
};
