import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';

const app = createApp();
const request = supertest(app);

describe('API Key Endpoints (/v1/api-keys)', () => {
  const userAEmail = 'usera.apikeys@example.com';
  const userBEmail = 'userb.apikeys@example.com';
  const password = 'password123';
  let tokenA = '';
  let tokenB = '';
  let createdKeyId = '';
  let rawApiKey = '';

  beforeAll(async () => {
    // Clean any leftover user rows first
    await pool.query(
      'DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))',
      [userAEmail, userBEmail],
    );
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [userAEmail, userBEmail]);

    // Register User A & User B
    await request.post('/v1/auth/register').send({ email: userAEmail, password });
    await request.post('/v1/auth/register').send({ email: userBEmail, password });

    // Login User A & User B
    const loginA = await request.post('/v1/auth/login').send({ email: userAEmail, password });
    const loginB = await request.post('/v1/auth/login').send({ email: userBEmail, password });

    tokenA = loginA.body.access_token;
    tokenB = loginB.body.access_token;
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))',
      [userAEmail, userBEmail],
    );
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [userAEmail, userBEmail]);
    await pool.end();
    await redis.quit();
  });

  it('POST /v1/api-keys creates a new key and returns raw key once', async () => {
    const res = await request
      .post('/v1/api-keys')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Test Key A' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Test Key A');
    expect(res.body.key).toMatch(/^gw_/);
    expect(res.body.key_prefix).toBe(res.body.key.slice(0, 12));
    expect(res.body.warning).toBeDefined();

    createdKeyId = res.body.id;
    rawApiKey = res.body.key;
  });

  it('GET /v1/api-keys lists keys without returning raw key or key_hash', async () => {
    const res = await request.get('/v1/api-keys').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const keyItem = res.body.find((k) => k.id === createdKeyId);
    expect(keyItem).toBeDefined();
    expect(keyItem.key).toBeUndefined();
    expect(keyItem.key_hash).toBeUndefined();
  });

  it('GET /v1/auth/me with X-API-Key authenticates caller with auth_type "api_key"', async () => {
    const res = await request.get('/v1/auth/me').set('X-API-Key', rawApiKey);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(userAEmail);
    expect(res.body.auth_type).toBe('api_key');
  });

  it('POST /v1/api-keys with X-API-Key returns 403 FORBIDDEN', async () => {
    const res = await request
      .post('/v1/api-keys')
      .set('X-API-Key', rawApiKey)
      .send({ name: 'Sub Key' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('API keys cannot manage API keys');
  });

  it('DELETE /v1/api-keys/:id by another user returns 404 NOT_FOUND', async () => {
    const res = await request
      .delete(`/v1/api-keys/${createdKeyId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /v1/api-keys/:id by owner revokes key (204 No Content)', async () => {
    const res = await request
      .delete(`/v1/api-keys/${createdKeyId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(204);
  });

  it('GET /v1/auth/me with revoked X-API-Key returns 401 UNAUTHORIZED', async () => {
    const res = await request.get('/v1/auth/me').set('X-API-Key', rawApiKey);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
