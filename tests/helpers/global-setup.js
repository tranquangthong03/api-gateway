import pg from 'pg';
import { runner } from 'node-pg-migrate';
import fs from 'node:fs';

const { Client } = pg;

export default async function globalSetup() {
  if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    throw new Error('TEST_DATABASE_URL environment variable is required');
  }

  const urlObj = new URL(testDbUrl);
  const testDbName = urlObj.pathname.slice(1);

  if (!testDbName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL database name "${testDbName}" must end with "_test"`);
  }

  // Build maintenance database URL pointing to 'postgres'
  const maintenanceUrlObj = new URL(testDbUrl);
  maintenanceUrlObj.pathname = '/postgres';

  const client = new Client({ connectionString: maintenanceUrlObj.toString() });

  try {
    await client.connect();
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);

    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${testDbName}"`);
      console.log(`Created test database: ${testDbName}`);
    }
  } finally {
    await client.end();
  }

  // Run migrations on the test database programmatically
  await runner({
    databaseUrl: testDbUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}
