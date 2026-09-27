import { pool } from '../infra/db.js';
import * as conversationRepo from '../repositories/conversation.repo.js';
import * as messageRepo from '../repositories/message.repo.js';
import { createNotFoundError } from '../core/errors.js';

export const executeChat = async ({
  userId,
  apiKeyId = null,
  requestId,
  conversationId = null,
  message,
  model = null,
  orchestrator,
}) => {
  const conv = conversationId
    ? await conversationRepo.findConversationByIdAndUser({ id: conversationId, userId })
    : await conversationRepo.createConversation({
        userId,
        title: message.length > 60 ? message.substring(0, 60) : message,
        defaultModel: model,
      });

  if (!conv) {
    throw createNotFoundError('Conversation not found');
  }

  conversationId = conv.id;

  // Save user message in its own transaction before calling the LLM
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await messageRepo.createMessage({ conversationId, role: 'user', content: message }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Build history (last 20 messages in chronological order)
  const recentMessages = await messageRepo.findRecentMessagesByConversationId(conversationId, 20);
  const historyMessages = recentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Prepend stored system prompt if present
  if (conv?.system_prompt) {
    historyMessages.unshift({
      role: 'system',
      content: conv.system_prompt,
    });
  }

  // Callback to save assistant message and update conversation timestamp
  const saveAssistantMessageFn = async ({ text, finish_reason }) => {
    const assistantMsg = await messageRepo.createMessage({
      conversationId,
      role: 'assistant',
      content: text,
      finishReason: finish_reason,
    });
    await conversationRepo.updateConversationUpdatedAt(conversationId);
    return assistantMsg.id;
  };

  try {
    const res = await orchestrator.executeAIRequest({
      userId,
      apiKeyId,
      conversationId,
      requestId,
      endpoint: 'chat',
      requestedModel: model || conv?.default_model || null,
      messages: historyMessages,
      saveAssistantMessageFn,
    });

    return {
      conversation_id: conversationId,
      message_id: res.message_id,
      reply: res.text,
      provider: res.provider,
      model: res.model,
      is_fallback: res.is_fallback,
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        cost_usd: res.cost_usd,
      },
      latency_ms: res.latency_ms,
    };
  } catch (err) {
    if (!err.details) {
      err.details = {};
    }
    err.details.conversation_id = conversationId;
    throw err;
  }
};
