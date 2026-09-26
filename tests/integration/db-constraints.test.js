import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

describe('Database Constraints Verification', () => {
  let pool;
  let testUserId;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ('test-constraint@example.com', 'hash', 'Test Constraint User', 'user')
       RETURNING id`,
    );
    testUserId = userRes.rows[0].id;
  });

  afterAll(async () => {
    if (pool && testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
      await pool.end();
    }
  });

  it('rejects ai_requests with invalid status "abc" via check constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO ai_requests (user_id, request_id, endpoint, provider, model, input_tokens, output_tokens, latency_ms, status)
         VALUES ($1, 'req_invalid_status_test', 'chat', 'gemini', 'gemini-3.5-flash-lite', 10, 10, 100, 'abc')`,
        [testUserId],
      ),
    ).rejects.toThrow(/chk_ai_requests_status/);
  });

  it('rejects message with non-existent conversation_id via foreign key constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ('00000000-0000-0000-0000-000000000000', 'user', 'Hello world')`,
      ),
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it('computes total_tokens = input_tokens + output_tokens automatically as a STORED GENERATED column', async () => {
    const res = await pool.query(
      `INSERT INTO ai_requests (user_id, request_id, endpoint, provider, model, input_tokens, output_tokens, latency_ms, status)
       VALUES ($1, 'req_tokens_calc_test', 'chat', 'gemini', 'gemini-3.5-flash-lite', 100, 50, 200, 'success')
       RETURNING id, input_tokens, output_tokens, total_tokens`,
      [testUserId],
    );

    expect(res.rows[0].input_tokens).toBe(100);
    expect(res.rows[0].output_tokens).toBe(50);
    expect(res.rows[0].total_tokens).toBe(150);

    // Cleanup ai_request fixture
    await pool.query('DELETE FROM ai_requests WHERE id = $1', [res.rows[0].id]);
  });
});
