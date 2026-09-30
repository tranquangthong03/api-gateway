import { describe, it, expect, afterAll, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';
import { logger } from '../../src/core/logger.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { AppError } from '../../src/core/errors.js';

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

  it('logs 5xx errors at error level with top-level request_id, code, method, path, and stack trace', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const errorApp = express();
    errorApp.use(requestIdMiddleware);
    errorApp.get('/test-500', (_req, _res, _next) => {
      throw new Error('Database connection crashed unexpectedly');
    });
    errorApp.get('/test-app-502', (_req, _res, _next) => {
      throw new AppError('PROVIDER_ERROR', 'Provider failed', 502);
    });
    errorApp.use(errorHandler);

    const testReq = supertest(errorApp);

    const res500 = await testReq.get('/test-500').set('X-Request-ID', 'req_test_500_id');
    expect(res500.status).toBe(500);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'req_test_500_id',
        code: 'INTERNAL_ERROR',
        method: 'GET',
        path: '/test-500',
        err: expect.any(Error),
      }),
      'Unhandled application error',
    );

    const res502 = await testReq.get('/test-app-502').set('X-Request-ID', 'req_test_502_id');
    expect(res502.status).toBe(502);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'req_test_502_id',
        code: 'PROVIDER_ERROR',
        method: 'GET',
        path: '/test-app-502',
        err: expect.any(AppError),
      }),
      '5xx Application Error: Provider failed',
    );

    loggerSpy.mockRestore();
  });
});
