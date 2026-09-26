import { defineConfig } from 'vitest/config';
import fs from 'node:fs';

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  throw new Error('TEST_DATABASE_URL environment variable is required to run tests.');
}

const dbName = testDbUrl.split('/').pop().split('?')[0];
if (!dbName.endsWith('_test')) {
  throw new Error(`TEST_DATABASE_URL database name "${dbName}" must end with "_test" for safety.`);
}

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/helpers/global-setup.js',
    testTimeout: 10000,
  },
});
