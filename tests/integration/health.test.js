import { describe, it, expect, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';
import * as dbInfra from '../../src/infra/db.js';

const app = createApp();
const request = supertest(app);

describe('Health and Docs Endpoints', () => {
  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  it('GET / returns 200 with service info', async () => {
    const res = await request.get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: 'ai-gateway',
      version: '1.0.0',
      docs: '/docs',
      health: '/health',
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health returns 200 with status ok when DB, Redis, and Schema are ready', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      schema: 'ok',
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health returns 503 with status error when DB check fails', async () => {
    const spy = vi.spyOn(dbInfra, 'checkDbHealth').mockResolvedValueOnce(false);
    const res = await request.get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'error',
      db: 'error',
      redis: 'ok',
      schema: 'ok',
    });
    expect(res.headers['x-request-id']).toBeDefined();
    spy.mockRestore();
  });

  it('GET /health returns 503 with status error when schema check fails', async () => {
    const spy = vi.spyOn(dbInfra, 'checkSchemaHealth').mockResolvedValueOnce(false);
    const res = await request.get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'error',
      db: 'ok',
      redis: 'ok',
      schema: 'error',
    });
    expect(res.headers['x-request-id']).toBeDefined();
    spy.mockRestore();
  });

  it('GET /docs returns 200 Swagger UI', async () => {
    const res = await request.get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Swagger UI');
  });
});
