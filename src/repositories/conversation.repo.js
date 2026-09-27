import { pool } from '../infra/db.js';

export const createConversation = async (
  { userId, title, defaultModel = null, systemPrompt = null },
  client = pool,
) => {
  const result = await client.query(
    `INSERT INTO conversations (user_id, title, default_model, system_prompt)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, title, default_model, system_prompt, is_archived, created_at, updated_at`,
    [userId, title, defaultModel, systemPrompt],
  );
  return result.rows[0];
};

export const findConversationByIdAndUser = async ({ id, userId }, client = pool) => {
  const result = await client.query(
    `SELECT id, user_id, title, default_model, system_prompt, is_archived, created_at, updated_at
     FROM conversations
     WHERE id = $1 AND user_id = $2 AND is_archived = false`,
    [id, userId],
  );
  return result.rows[0] || null;
};

export const updateConversationUpdatedAt = async (id, client = pool) => {
  await client.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [id]);
};

export const listConversations = async ({ userId, limit = 20, offset = 0 }, client = pool) => {
  const countResult = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM conversations
     WHERE user_id = $1 AND is_archived = false`,
    [userId],
  );
  const total = countResult.rows[0]?.total || 0;

  const itemsResult = await client.query(
    `SELECT id, title, created_at, updated_at
     FROM conversations
     WHERE user_id = $1 AND is_archived = false
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return {
    items: itemsResult.rows,
    total,
    limit,
    offset,
  };
};
