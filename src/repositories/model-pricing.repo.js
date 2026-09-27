import { pool } from '../infra/db.js';

export const findLatestPricing = async (provider, model) => {
  const query = `
    SELECT id, provider, model, input_price_per_1k, output_price_per_1k, effective_from, is_active
    FROM model_pricing
    WHERE provider = $1 AND model = $2 AND effective_from <= now() AND is_active = true
    ORDER BY effective_from DESC
    LIMIT 1
  `;
  const res = await pool.query(query, [provider, model]);
  return res.rows[0] || null;
};
