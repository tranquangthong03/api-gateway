import { pool } from '../infra/db.js';

export const createApiKey = async ({
  userId,
  name,
  keyHash,
  keyPrefix,
  rateLimitPerMin = 60,
  expiresAt = null,
}) => {
  const query = `
    INSERT INTO api_keys (user_id, name, key_hash, key_prefix, rate_limit_per_min, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, user_id, name, key_prefix, rate_limit_per_min, last_used_at, expires_at, revoked_at, created_at
  `;
  const values = [userId, name, keyHash, keyPrefix, rateLimitPerMin, expiresAt];
  const res = await pool.query(query, values);
  return res.rows[0];
};

export const findApiKeyByHash = async (keyHash) => {
  const query = `
    SELECT k.id, k.user_id, k.name, k.key_hash, k.key_prefix, k.rate_limit_per_min,
           k.last_used_at, k.expires_at, k.revoked_at, k.created_at,
           u.email, u.role, u.is_active AS user_is_active
    FROM api_keys k
    JOIN users u ON k.user_id = u.id
    WHERE k.key_hash = $1
  `;
  const res = await pool.query(query, [keyHash]);
  return res.rows[0] || null;
};

export const findApiKeysByUserId = async (userId) => {
  const query = `
    SELECT id, name, key_prefix, rate_limit_per_min, last_used_at, expires_at, revoked_at, created_at
    FROM api_keys
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;
  const res = await pool.query(query, [userId]);
  return res.rows;
};

export const findApiKeyById = async (id) => {
  const query = `
    SELECT id, user_id, name, key_prefix, rate_limit_per_min, last_used_at, expires_at, revoked_at, created_at
    FROM api_keys
    WHERE id = $1
  `;
  const res = await pool.query(query, [id]);
  return res.rows[0] || null;
};

export const revokeApiKey = async (id, userId) => {
  const query = `
    UPDATE api_keys
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE id = $1 AND user_id = $2
    RETURNING id, user_id, revoked_at
  `;
  const res = await pool.query(query, [id, userId]);
  return res.rows[0] || null;
};

export const updateLastUsedAt = async (id) => {
  const query = `
    UPDATE api_keys
    SET last_used_at = now()
    WHERE id = $1
  `;
  await pool.query(query, [id]);
};
