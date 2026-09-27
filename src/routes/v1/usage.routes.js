import { Router } from 'express';
import { validateQuery } from '../../middleware/validate.js';
import { authMiddleware } from '../../middleware/auth.js';
import { rateLimitMiddleware } from '../../middleware/rate-limit.js';
import { usageQuerySchema } from '../../schemas/usage.schema.js';
import { getUsageMetrics } from '../../services/usage.service.js';

export const usageRouter = Router();

usageRouter.use(authMiddleware);
usageRouter.use(rateLimitMiddleware);

usageRouter.get('/', validateQuery(usageQuerySchema), async (req, res, next) => {
  try {
    const result = await getUsageMetrics({
      currentUser: req.user,
      query: req.query,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
