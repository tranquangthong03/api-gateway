import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';

describe('Usage Analytics Endpoints (/v1/usage)', () => {
  let userAToken = '';
  let adminToken = '';
  let userAId = '';
  let userBId = '';

  const userAEmail = 'usage.usera@example.com';
  const userBEmail = 'usage.userb@example.com';
  const adminEmail = 'usage.admin@example.com';
  const password = 'Password123!';

  const timeFrom = '2026-01-15T00:00:00.000Z';
  const timeTo = '2026-01-15T23:59:59.000Z';
  const testRangeQuery = `from=${encodeURIComponent(timeFrom)}&to=${encodeURIComponent(timeTo)}`;

  const app = createApp();
  const request = supertest(app);

  beforeAll(async () => {
    // Cleanup existing users
    await pool.query('DELETE FROM users WHERE email IN ($1, $2, $3)', [
      userAEmail,
      userBEmail,
      adminEmail,
    ]);

    // Register Users
    await request.post('/v1/auth/register').send({ email: userAEmail, password });
    await request.post('/v1/auth/register').send({ email: userBEmail, password });
    await request.post('/v1/auth/register').send({ email: adminEmail, password });

    // Set admin role for adminEmail in DB
    await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [adminEmail]);

    // Login
    const loginA = await request.post('/v1/auth/login').send({ email: userAEmail, password });
    await request.post('/v1/auth/login').send({ email: userBEmail, password });
    const loginAdmin = await request.post('/v1/auth/login').send({ email: adminEmail, password });

    userAToken = loginA.body.access_token;
    adminToken = loginAdmin.body.access_token;

    // Fetch user IDs
    const resA = await pool.query('SELECT id FROM users WHERE email = $1', [userAEmail]);
    const resB = await pool.query('SELECT id FROM users WHERE email = $1', [userBEmail]);
    userAId = resA.rows[0].id;
    userBId = resB.rows[0].id;

    // Seed ai_requests for User A at fixed historical timestamp
    await pool.query(
      `INSERT INTO ai_requests (
        user_id, request_id, endpoint, provider, model, is_fallback, is_cached,
        input_tokens, output_tokens, cost_usd, latency_ms, retry_count, status, error_code, created_at
       ) VALUES
       ($1, 'req-uA-1', 'chat', 'gemini', 'gemini-2.5-flash', false, false, 100, 200, 0.001500, 1000, 0, 'success', NULL, '2026-01-15T10:00:00.000Z'),
       ($1, 'req-uA-2', 'analyze', 'gemini', 'gemini-2.5-flash', false, true, 0, 0, 0.000000, 50, 0, 'success', NULL, '2026-01-15T10:30:00.000Z'),
       ($1, 'req-uA-3', 'chat', 'groq', 'llama-3.3-70b', true, false, 50, 50, 0.000500, 2000, 1, 'error', 'provider_error', '2026-01-15T11:00:00.000Z')`,
      [userAId],
    );

    // Seed ai_requests for User B at fixed historical timestamp
    await pool.query(
      `INSERT INTO ai_requests (
        user_id, request_id, endpoint, provider, model, is_fallback, is_cached,
        input_tokens, output_tokens, cost_usd, latency_ms, retry_count, status, error_code, created_at
       ) VALUES
       ($1, 'req-uB-1', 'chat', 'gemini', 'gemini-2.5-flash', false, false, 500, 500, 0.005000, 800, 0, 'success', NULL, '2026-01-15T12:00:00.000Z')`,
      [userBId],
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM ai_requests WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2, $3))`,
      [userAEmail, userBEmail, adminEmail],
    );
    await pool.query('DELETE FROM users WHERE email IN ($1, $2, $3)', [
      userAEmail,
      userBEmail,
      adminEmail,
    ]);
    await pool.end();
    await redis.quit();
  });

  it('GET /v1/usage for non-admin with no user_id sees ONLY their own rows', async () => {
    const res = await request
      .get(`/v1/usage?${testRangeQuery}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toBe(3); // User A has 3 requests in target window
    expect(res.body.tokens).toBe(400); // 300 + 0 + 100 = 400
    expect(typeof res.body.requests).toBe('number');
    expect(typeof res.body.tokens).toBe('number');
    expect(typeof res.body.average_latency_ms).toBe('number');
    expect(typeof res.body.error_rate).toBe('number');
    expect(typeof res.body.estimated_cost_usd).toBe('number');

    // 1 error out of 3 -> 0.3333 error rate
    expect(res.body.error_rate).toBe(0.3333);
    // Cost: 0.0015 + 0 + 0.0005 = 0.002
    expect(res.body.estimated_cost_usd).toBe(0.002);
  });

  it('GET /v1/usage for admin without user_id sees system-wide rows for all users', async () => {
    const res = await request
      .get(`/v1/usage?${testRangeQuery}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toBe(4); // User A (3) + User B (1) = 4
    expect(res.body.tokens).toBe(1400); // 400 + 1000 = 1400
  });

  it('GET /v1/usage for admin with user_id filter sees only target user rows', async () => {
    const res = await request
      .get(`/v1/usage?${testRangeQuery}&user_id=${userBId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toBe(1);
    expect(res.body.tokens).toBe(1000);
  });

  it('GET /v1/usage returns 403 when non-admin supplies user_id filter', async () => {
    const res = await request
      .get(`/v1/usage?${testRangeQuery}&user_id=${userBId}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /v1/usage returns 400 when from >= to', async () => {
    const res = await request
      .get('/v1/usage?from=2026-09-27T12:00:00.000Z&to=2026-09-27T10:00:00.000Z')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /v1/usage for empty period returns zeros and empty array for by_model', async () => {
    const res = await request
      .get('/v1/usage?from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toBe(0);
    expect(res.body.tokens).toBe(0);
    expect(res.body.average_latency_ms).toBe(0);
    expect(res.body.error_rate).toBe(0);
    expect(res.body.estimated_cost_usd).toBe(0);
    expect(res.body.by_model).toEqual([]);
  });
});
