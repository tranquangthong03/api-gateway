import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateCost } from '../../src/llm/cost.js';
import { pool } from '../../src/infra/db.js';

describe('Cost Calculator (calculateCost)', () => {
  beforeAll(async () => {
    // Seed test pricing
    await pool.query(
      `INSERT INTO model_pricing (provider, model, input_price_per_1k, output_price_per_1k)
       VALUES ('test_prov', 'test_model', 0.001000, 0.002000)
       ON CONFLICT (provider, model, effective_from) DO NOTHING`,
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM model_pricing WHERE provider = 'test_prov'`);
    await pool.end();
  });

  it('calculates cost correctly using seeded pricing row rounded to 6 decimals', async () => {
    // 1000 input tokens * 0.001 = 0.001, 2000 output tokens * 0.002 = 0.004 -> total 0.005
    const cost = await calculateCost({
      provider: 'test_prov',
      model: 'test_model',
      inputTokens: 1000,
      outputTokens: 2000,
    });

    expect(cost).toBe(0.005);
  });

  it('returns cost 0 without crashing when model pricing is unknown', async () => {
    const cost = await calculateCost({
      provider: 'unknown_provider',
      model: 'unknown_model',
      inputTokens: 5000,
      outputTokens: 5000,
    });

    expect(cost).toBe(0);
  });
});
