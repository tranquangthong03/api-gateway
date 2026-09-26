import { describe, it, expect, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';

const app = createApp();
const request = supertest(app);

describe('Error Format and Unknown Routes', () => {
  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  it('GET /unknown-route returns 404 with standardized error format', async () => {
    const res = await request.get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /unknown-route not found',
        request_id: res.headers['x-request-id'],
      },
    });
  });

  it('preserves existing X-Request-ID header if sent in request', async () => {
    const customReqId = 'req_custom_test_12345';
    const res = await request.get('/unknown-route').set('X-Request-ID', customReqId);
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe(customReqId);
    expect(res.body.error.request_id).toBe(customReqId);
  });
});
