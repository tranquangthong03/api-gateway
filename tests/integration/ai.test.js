import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infra/db.js';
import { redis } from '../../src/infra/redis.js';
import { LLMOrchestrator } from '../../src/llm/orchestrator.js';
import { FakeProvider } from '../helpers/fake-provider.js';

describe('AI Endpoints (/v1/ai)', () => {
  const instantSleep = () => Promise.resolve();

  let userAToken = '';
  let userBToken = '';
  let fakeGemini;
  let fakeGroq;
  let orchestrator;
  let app;
  let request;

  const userAEmail = 'ai.userA@example.com';
  const userBEmail = 'ai.userB@example.com';
  const password = 'Password123!';

  beforeAll(async () => {
    // Cleanup existing users
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [userAEmail, userBEmail]);

    // Setup app & test users
    const tempApp = createApp();
    const tempReq = supertest(tempApp);

    await tempReq.post('/v1/auth/register').send({ email: userAEmail, password });
    await tempReq.post('/v1/auth/register').send({ email: userBEmail, password });

    const loginA = await tempReq.post('/v1/auth/login').send({ email: userAEmail, password });
    const loginB = await tempReq.post('/v1/auth/login').send({ email: userBEmail, password });

    userAToken = loginA.body.access_token;
    userBToken = loginB.body.access_token;
  });

  beforeEach(() => {
    fakeGemini = new FakeProvider({ name: 'gemini', defaultModel: 'gemini-2.5-flash' });
    fakeGroq = new FakeProvider({ name: 'groq', defaultModel: 'llama-3.3-70b' });
    orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      groqAdapter: fakeGroq,
      sleepFn: instantSleep,
    });

    app = createApp({ orchestrator });
    request = supertest(app);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM ai_requests WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))`,
      [userAEmail, userBEmail],
    );
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

  it('POST /v1/ai/chat creates new conversation with title and returns 200', async () => {
    fakeGemini.responses = [
      { text: 'Hello from LLM!', usage: { input_tokens: 10, output_tokens: 15 } },
    ];

    const res = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ message: 'Hello AI Gateway, this is my first prompt.' });

    expect(res.status).toBe(200);
    expect(res.body.conversation_id).toBeDefined();
    expect(res.body.message_id).toBeDefined();
    expect(res.body.reply).toBe('Hello from LLM!');
    expect(res.body.provider).toBe('gemini');
    expect(res.body.is_fallback).toBe(false);
    expect(typeof res.body.usage.cost_usd).toBe('number');

    // Verify conversation title in DB
    const convRes = await pool.query('SELECT title FROM conversations WHERE id = $1', [
      res.body.conversation_id,
    ]);
    expect(convRes.rows[0].title).toBe('Hello AI Gateway, this is my first prompt.');
  });

  it('POST /v1/ai/chat second message uses conversation history', async () => {
    fakeGemini.responses = [
      { text: 'First response', usage: { input_tokens: 10, output_tokens: 10 } },
      {
        text: 'Second response remembering history',
        usage: { input_tokens: 20, output_tokens: 20 },
      },
    ];

    // 1st message
    const res1 = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ message: 'My favorite color is blue.' });

    const conversationId = res1.body.conversation_id;

    // 2nd message
    const res2 = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ conversation_id: conversationId, message: 'What is my favorite color?' });

    expect(res2.status).toBe(200);
    expect(res2.body.conversation_id).toBe(conversationId);
    expect(res2.body.reply).toBe('Second response remembering history');

    // Verify fakeGemini received history
    const secondCall = fakeGemini.receivedParams[1];
    expect(secondCall.messages.length).toBe(3); // user1, assistant1, user2
    expect(secondCall.messages[0].content).toBe('My favorite color is blue.');
    expect(secondCall.messages[1].content).toBe('First response');
    expect(secondCall.messages[2].content).toBe('What is my favorite color?');
  });

  it("POST /v1/ai/chat returns 404 when accessing another user's conversation", async () => {
    fakeGemini.responses = [{ text: 'Response' }];

    const res1 = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ message: 'Private conversation for User A' });

    const conversationId = res1.body.conversation_id;

    // User B attempts to access User A's conversation
    const res2 = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ conversation_id: conversationId, message: 'Sneaky prompt' });

    expect(res2.status).toBe(404);
    expect(res2.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /v1/ai/chat returns 400 when message exceeds 10,000 characters', async () => {
    const longMessage = 'a'.repeat(10001);

    const res = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ message: longMessage });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/ai/chat on LLM failure returns 502/504, saves user message, logs error row, and attaches conversation_id in details', async () => {
    const timeoutErr = new Error('Gateway Timeout');
    timeoutErr.errorType = 'timeout';

    fakeGemini.error = timeoutErr;
    fakeGroq.error = timeoutErr;

    const res = await request
      .post('/v1/ai/chat')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ message: 'Message before LLM crash' });

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('PROVIDER_TIMEOUT');
    expect(res.body.error.details.conversation_id).toBeDefined();

    const conversationId = res.body.error.details.conversation_id;

    // Verify user message was saved in DB
    const msgsRes = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1',
      [conversationId],
    );
    expect(msgsRes.rows.length).toBe(1);
    expect(msgsRes.rows[0].role).toBe('user');
    expect(msgsRes.rows[0].content).toBe('Message before LLM crash');

    // Verify ai_requests error row was written
    const reqsRes = await pool.query(
      'SELECT status, error_code FROM ai_requests WHERE conversation_id = $1',
      [conversationId],
    );
    expect(reqsRes.rows.length).toBe(1);
    expect(reqsRes.rows[0].status).toBe('error');
    expect(reqsRes.rows[0].error_code).toBe('timeout');
  });

  it('POST /v1/ai/analyze sentiment task succeeds', async () => {
    fakeGemini.responses = [
      {
        text: JSON.stringify({
          sentiment: 'positive',
          confidence: 0.95,
          aspects: [{ aspect: 'service', sentiment: 'positive' }],
        }),
      },
    ];

    const res = await request
      .post('/v1/ai/analyze')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ task: 'sentiment', text: 'Great service and fast delivery!' });

    expect(res.status).toBe(200);
    expect(res.body.task).toBe('sentiment');
    expect(res.body.result.sentiment).toBe('positive');
    expect(res.body.result.aspects[0].aspect).toBe('service');
    expect(typeof res.body.usage.cost_usd).toBe('number');
  });

  it('POST /v1/ai/analyze summarize task succeeds', async () => {
    fakeGemini.responses = [
      {
        text: '```json\n{"summary": "Short summary text", "key_points": ["Point 1", "Point 2"]}\n```',
      },
    ];

    const res = await request
      .post('/v1/ai/analyze')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ task: 'summarize', text: 'Long article text...' });

    expect(res.status).toBe(200);
    expect(res.body.task).toBe('summarize');
    expect(res.body.result.summary).toBe('Short summary text');
    expect(res.body.result.key_points).toEqual(['Point 1', 'Point 2']);
  });

  it('POST /v1/ai/analyze extract task succeeds', async () => {
    fakeGemini.responses = [
      {
        text: JSON.stringify({
          people: ['John Doe'],
          organizations: ['Acme Corp'],
          dates: ['2026-09-27'],
          amounts: [{ value: 100.5, currency: 'USD' }],
        }),
      },
    ];

    const res = await request
      .post('/v1/ai/analyze')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ task: 'extract', text: 'John Doe from Acme Corp paid $100.50 on 2026-09-27' });

    expect(res.status).toBe(200);
    expect(res.body.task).toBe('extract');
    expect(res.body.result.people).toEqual(['John Doe']);
    expect(res.body.result.amounts[0].value).toBe(100.5);
  });

  it('POST /v1/ai/analyze returns 502 on double invalid output', async () => {
    fakeGemini.responses = [{ text: 'invalid json 1' }, { text: 'invalid json 2' }];

    const res = await request
      .post('/v1/ai/analyze')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ task: 'summarize', text: 'Some text' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PROVIDER_ERROR');
  });
});
