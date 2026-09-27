import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';

describe('Conversations Endpoints (/v1/conversations)', () => {
  let userAToken = '';
  let userBToken = '';
  let conv1Id = '';
  let conv2Id = '';

  const userAEmail = 'conv.usera@example.com';
  const userBEmail = 'conv.userb@example.com';
  const password = 'Password123!';

  const app = createApp();
  const request = supertest(app);

  beforeAll(async () => {
    // Clean up
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [userAEmail, userBEmail]);

    // Create users & logins
    await request.post('/v1/auth/register').send({ email: userAEmail, password });
    await request.post('/v1/auth/register').send({ email: userBEmail, password });

    const loginA = await request.post('/v1/auth/login').send({ email: userAEmail, password });
    const loginB = await request.post('/v1/auth/login').send({ email: userBEmail, password });

    userAToken = loginA.body.access_token;
    userBToken = loginB.body.access_token;

    // Get User A ID
    const userARes = await pool.query('SELECT id FROM users WHERE email = $1', [userAEmail]);
    const userAId = userARes.rows[0].id;

    // Create seed conversations for User A
    const c1 = await pool.query(
      `INSERT INTO conversations (user_id, title, created_at, updated_at)
       VALUES ($1, 'Conversation 1', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')
       RETURNING id`,
      [userAId],
    );
    conv1Id = c1.rows[0].id;

    const c2 = await pool.query(
      `INSERT INTO conversations (user_id, title, created_at, updated_at)
       VALUES ($1, 'Conversation 2', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')
       RETURNING id`,
      [userAId],
    );
    conv2Id = c2.rows[0].id;

    // Seed messages in conv1Id (user msg, assistant msg)
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES ($1, 'user', 'First question', NOW() - INTERVAL '110 minutes')`,
      [conv1Id],
    );
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES ($1, 'assistant', 'First answer', NOW() - INTERVAL '100 minutes')`,
      [conv1Id],
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2)))`,
      [userAEmail, userBEmail],
    );
    await pool.query(
      `DELETE FROM conversations WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))`,
      [userAEmail, userBEmail],
    );
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [userAEmail, userBEmail]);
    await pool.end();
    await redis.quit();
  });

  it('GET /v1/conversations lists non-archived conversations with pagination and total', async () => {
    const res = await request
      .get('/v1/conversations?limit=1&offset=0')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.items.length).toBe(1);

    // Newest updated_at first -> Conversation 2
    expect(res.body.items[0].id).toBe(conv2Id);
    expect(res.body.items[0].title).toBe('Conversation 2');
  });

  it('GET /v1/conversations/:id returns conversation details with messages in chronological order', async () => {
    const res = await request
      .get(`/v1/conversations/${conv1Id}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(conv1Id);
    expect(res.body.title).toBe('Conversation 1');
    expect(res.body.messages.length).toBe(2);

    // Chronological order: user msg first, assistant msg second
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[0].content).toBe('First question');
    expect(res.body.messages[1].role).toBe('assistant');
    expect(res.body.messages[1].content).toBe('First answer');
  });

  it("GET /v1/conversations/:id returns 404 when accessing another user's conversation", async () => {
    const res = await request
      .get(`/v1/conversations/${conv1Id}`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
