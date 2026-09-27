import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';
import { LLMOrchestrator } from '../../src/llm/orchestrator.js';
import { FakeProvider } from '../helpers/fake-provider.js';

describe('Analyze Cache Caching (/v1/ai/analyze)', () => {
  let userToken = '';
  let fakeGemini;
  let orchestrator;
  let app;
  let request;

  const userEmail = 'cache.user@example.com';
  const password = 'Password123!';

  beforeAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [userEmail]);
    const tempApp = createApp();
    const tempReq = supertest(tempApp);

    await tempReq.post('/v1/auth/register').send({ email: userEmail, password });
    const login = await tempReq.post('/v1/auth/login').send({ email: userEmail, password });
    userToken = login.body.access_token;
  });

  beforeEach(async () => {
    // Flush Redis cache before each test
    await redis.flushdb();

    fakeGemini = new FakeProvider({ name: 'gemini', defaultModel: 'gemini-2.5-flash' });
    orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      sleepFn: () => Promise.resolve(),
    });

    app = createApp({ orchestrator });
    request = supertest(app);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM ai_requests WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [userEmail],
    );
    await pool.query('DELETE FROM users WHERE email = $1', [userEmail]);
    await pool.end();
    await redis.quit();
  });

  it('second identical analyze request hits Redis cache, skips provider, and logs is_cached row', async () => {
    fakeGemini.responses = [
      {
        text: JSON.stringify({
          sentiment: 'positive',
          confidence: 0.9,
          aspects: [{ aspect: 'speed', sentiment: 'positive' }],
        }),
        usage: { input_tokens: 50, output_tokens: 50 },
      },
    ];

    const analyzeBody = {
      task: 'sentiment',
      text: 'Fast and responsive caching test',
    };

    // 1st request (Cache Miss)
    const res1 = await request
      .post('/v1/ai/analyze')
      .set('Authorization', `Bearer ${userToken}`)
      .send(analyzeBody);

    expect(res1.status).toBe(200);
    expect(res1.body.is_cached).toBe(false);
    expect(fakeGemini.callCount).toBe(1);

    // 2nd identical request (Cache Hit)
    const res2 = await request
      .post('/v1/ai/analyze')
      .set('Authorization', `Bearer ${userToken}`)
      .send(analyzeBody);

    expect(res2.status).toBe(200);
    expect(res2.body.is_cached).toBe(true);
    expect(res2.body.usage.input_tokens).toBe(0);
    expect(res2.body.usage.output_tokens).toBe(0);
    expect(res2.body.usage.cost_usd).toBe(0);
    expect(fakeGemini.callCount).toBe(1); // Call count remains 1!

    // Verify exactly two ai_requests rows logged in DB (1 uncached, 1 cached)
    const reqs = await pool.query(
      `SELECT is_cached, input_tokens, output_tokens, cost_usd
       FROM ai_requests
       WHERE user_id = (SELECT id FROM users WHERE email = $1)
       ORDER BY created_at ASC`,
      [userEmail],
    );

    expect(reqs.rows.length).toBe(2);
    expect(reqs.rows[0].is_cached).toBe(false);
    expect(reqs.rows[1].is_cached).toBe(true);
    expect(reqs.rows[1].input_tokens).toBe(0);
    expect(Number(reqs.rows[1].cost_usd)).toBe(0);
  });
});
