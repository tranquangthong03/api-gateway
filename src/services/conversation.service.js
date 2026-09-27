import * as conversationRepo from '../repositories/conversation.repo.js';
import * as messageRepo from '../repositories/message.repo.js';
import { createNotFoundError } from '../core/errors.js';

export const listConversations = async ({ userId, limit = 20, offset = 0 }) => {
  const numLimit = Number(limit);
  const numOffset = Number(offset);
  return conversationRepo.listConversations({ userId, limit: numLimit, offset: numOffset });
};

export const getConversationDetail = async ({ id, userId }) => {
  const conv = await conversationRepo.findConversationByIdAndUser({ id, userId });
  if (!conv) {
    throw createNotFoundError('Conversation not found');
  }

  const messages = await messageRepo.findAllMessagesByConversationId(id);

  return {
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    messages,
  };
};
