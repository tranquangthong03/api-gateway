import { pool } from '../infra/db.js';

export const getUsageSummary = async ({ from, to, userId = null }, client = pool) => {
  const result = await client.query(
    `SELECT
       COUNT(*)::int AS requests,
       COALESCE(SUM(total_tokens), 0)::bigint AS tokens,
       ROUND(COALESCE(AVG(latency_ms), 0))::int AS average_latency_ms,
       ROUND(COALESCE(AVG(CASE WHEN status = 'error' THEN 1.0 ELSE 0.0 END), 0.0)::numeric, 4)::float AS error_rate,
       ROUND(COALESCE(SUM(cost_usd), 0.0)::numeric, 6)::float AS estimated_cost_usd
     FROM ai_requests
     WHERE created_at >= $1 AND created_at < $2
       AND ($3::uuid IS NULL OR user_id = $3::uuid)`,
    [from, to, userId],
  );

  return result.rows[0];
};

export const getUsageByModel = async ({ from, to, userId = null }, client = pool) => {
  const result = await client.query(
    `SELECT
       model,
       COUNT(*)::int AS requests,
       COALESCE(SUM(total_tokens), 0)::bigint AS tokens
     FROM ai_requests
     WHERE created_at >= $1 AND created_at < $2
       AND ($3::uuid IS NULL OR user_id = $3::uuid)
     GROUP BY model
     ORDER BY requests DESC`,
    [from, to, userId],
  );

  return result.rows;
};
