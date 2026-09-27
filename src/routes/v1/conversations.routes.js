import { Router } from 'express';
import { validateQuery, validateParams } from '../../middleware/validate.js';
import { authMiddleware } from '../../middleware/auth.js';
import { rateLimitMiddleware } from '../../middleware/rate-limit.js';
import {
  listConversationsSchema,
  conversationIdParamsSchema,
} from '../../schemas/conversation.schema.js';
import { listConversations, getConversationDetail } from '../../services/conversation.service.js';

export const conversationsRouter = Router();

conversationsRouter.use(authMiddleware);
conversationsRouter.use(rateLimitMiddleware);

conversationsRouter.get('/', validateQuery(listConversationsSchema), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit, offset } = req.query;

    const result = await listConversations({ userId, limit, offset });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

conversationsRouter.get(
  '/:id',
  validateParams(conversationIdParamsSchema),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const result = await getConversationDetail({ id, userId });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
