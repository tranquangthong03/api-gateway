import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';
import { createRateLimitMiddleware } from '../../src/middleware/rate-limit.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { getRetryAfterSeconds } from '../../src/core/time.js';

describe('Rate Limiter Middleware', () => {
  const userEmail = 'ratelimit.user@example.com';
  const password = 'Password123!';
  let jwtToken = '';

  beforeAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [userEmail]);
    const app = createApp();
    const req = supertest(app);

    await req.post('/v1/auth/register').send({ email: userEmail, password });
    const login = await req.post('/v1/auth/login').send({ email: userEmail, password });
    jwtToken = login.body.access_token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [userEmail]);
    await pool.end();
    await redis.quit();
  });

  it('calculates Retry-After seconds correctly based on current epoch minute seconds', () => {
    // 12:00:15 PM -> 45 seconds remaining in current minute
    const nowMs = new Date('2026-09-27T12:00:15.000Z').getTime();
    expect(getRetryAfterSeconds(nowMs)).toBe(45);

    // 12:00:59 PM -> 1 second remaining
    const nowMs59 = new Date('2026-09-27T12:00:59.000Z').getTime();
    expect(getRetryAfterSeconds(nowMs59)).toBe(1);
  });

  it('returns 429 and rate limit headers when quota is exceeded', async () => {
    // Custom clock fixed at 12:00:30
    const fixedNowMs = new Date('2026-09-27T12:00:30.000Z').getTime();
    const customRateLimiter = createRateLimitMiddleware({
      clockFn: () => fixedNowMs,
    });

    const testApp = express();
    testApp.use(express.json());
    testApp.use((req, res, next) => {
      req.user = { id: 'user-rl-1', role: 'user' };
      req.authType = 'jwt';
      next();
    });
    testApp.use('/v1/mock-rl', customRateLimiter, (req, res) => res.status(200).json({ ok: true }));
    testApp.use(errorHandler);

    const request = supertest(testApp);

    const key = `rl:user-rl-1:${Math.floor(fixedNowMs / 60000)}`;
    await redis.set(key, 60);

    const res = await request.get('/v1/mock-rl').set('Authorization', `Bearer ${jwtToken}`);

    expect(res.status).toBe(429);
    expect(res.headers['x-ratelimit-limit']).toBe('60');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.headers['retry-after']).toBe('30'); // 60 - 30 = 30s
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('fails open (allows request) when Redis fails', async () => {
    const brokenRedis = {
      eval: () => Promise.reject(new Error('Redis connection lost')),
    };
    const failOpenLimiter = createRateLimitMiddleware({
      redisClient: brokenRedis,
    });

    let calledNext = false;
    const req = { authType: 'jwt', user: { id: 'u1' } };
    const res = { setHeader: () => {} };
    const next = () => {
      calledNext = true;
    };

    await failOpenLimiter(req, res, next);
    expect(calledNext).toBe(true);
  });
});
