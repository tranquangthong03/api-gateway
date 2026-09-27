import { pool } from '../infra/db.js';

export const createMessage = async (
  { conversationId, role, content, finishReason = null },
  client = pool,
) => {
  const result = await client.query(
    `INSERT INTO messages (conversation_id, role, content, finish_reason, created_at)
     VALUES ($1, $2, $3, $4, clock_timestamp())
     RETURNING id, conversation_id, role, content, finish_reason, created_at`,
    [conversationId, role, content, finishReason],
  );
  return result.rows[0];
};

export const findRecentMessagesByConversationId = async (
  conversationId,
  limit = 20,
  client = pool,
) => {
  const result = await client.query(
    `SELECT id, role, content, finish_reason, created_at
     FROM (
       SELECT id, role, content, finish_reason, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) sub
     ORDER BY created_at ASC`,
    [conversationId, limit],
  );
  return result.rows;
};

export const findAllMessagesByConversationId = async (conversationId, client = pool) => {
  const result = await client.query(
    `SELECT id, role, content, finish_reason, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId],
  );
  return result.rows;
};
