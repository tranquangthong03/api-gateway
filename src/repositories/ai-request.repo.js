import { pool } from '../infra/db.js';

export const createAiRequest = async ({
  userId,
  apiKeyId = null,
  conversationId = null,
  messageId = null,
  requestId,
  endpoint,
  provider,
  model,
  isFallback = false,
  isCached = false,
  inputTokens = 0,
  outputTokens = 0,
  costUsd = 0,
  latencyMs,
  retryCount = 0,
  status,
  errorCode = null,
  errorMessage = null,
}) => {
  const query = `
    INSERT INTO ai_requests (
      user_id, api_key_id, conversation_id, message_id, request_id,
      endpoint, provider, model, is_fallback, is_cached,
      input_tokens, output_tokens, cost_usd, latency_ms, retry_count,
      status, error_code, error_message
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18
    )
    RETURNING id, request_id, status, total_tokens, cost_usd, latency_ms, created_at
  `;

  const truncatedError = errorMessage ? String(errorMessage).slice(0, 500) : null;

  const values = [
    userId,
    apiKeyId,
    conversationId,
    messageId,
    requestId,
    endpoint,
    provider,
    model,
    isFallback,
    isCached,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
    retryCount,
    status,
    errorCode,
    truncatedError,
  ];

  const res = await pool.query(query, values);
  return res.rows[0];
};
