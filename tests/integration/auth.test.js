import { describe, it, expect, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';

const app = createApp();
const request = supertest(app);

describe('Auth Endpoints (/v1/auth)', () => {
  const testUserEmail = 'user.auth.test@example.com';
  const testUserPassword = 'securepassword123';
  let accessToken = '';

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [testUserEmail.toLowerCase()]);
    await pool.end();
    await redis.quit();
  });

  it('POST /v1/auth/register creates user and normalizes email to lowercase', async () => {
    const res = await request.post('/v1/auth/register').send({
      email: 'USER.AUTH.TEST@EXAMPLE.COM',
      password: testUserPassword,
      full_name: 'Auth Test User',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(testUserEmail);
    expect(res.body.full_name).toBe('Auth Test User');
    expect(res.body.role).toBe('user');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('POST /v1/auth/register returns 409 CONFLICT on duplicate email', async () => {
    const res = await request.post('/v1/auth/register').send({
      email: testUserEmail,
      password: testUserPassword,
      full_name: 'Duplicate User',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('Email already registered');
  });

  it('POST /v1/auth/login succeeds with valid credentials', async () => {
    const res = await request.post('/v1/auth/login').send({
      email: testUserEmail,
      password: testUserPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(3600);

    accessToken = res.body.access_token;
  });

  it('POST /v1/auth/login returns 401 on wrong password', async () => {
    const res = await request.post('/v1/auth/login').send({
      email: testUserEmail,
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('POST /v1/auth/login returns exact same 401 message on unknown email', async () => {
    const res = await request.post('/v1/auth/login').send({
      email: 'nonexistent.user@example.com',
      password: testUserPassword,
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('GET /v1/auth/me returns caller info with auth_type "jwt"', async () => {
    const res = await request.get('/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testUserEmail);
    expect(res.body.role).toBe('user');
    expect(res.body.auth_type).toBe('jwt');
  });

  it('GET /v1/auth/me returns 401 with invalid JWT', async () => {
    const res = await request.get('/v1/auth/me').set('Authorization', 'Bearer invalid.jwt.token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
