import { Router } from 'express';
import { authMiddleware, requireJwt } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createApiKeySchema } from '../../schemas/api-key.schema.js';
import * as apiKeyService from '../../services/api-key.service.js';

export const apiKeysRouter = Router();

apiKeysRouter.use(authMiddleware, requireJwt);

apiKeysRouter.post('/', validateBody(createApiKeySchema), async (req, res, next) => {
  try {
    const apiKey = await apiKeyService.createApiKey({
      userId: req.user.id,
      name: req.body.name,
      expiresInDays: req.body.expires_in_days,
    });
    res.status(201).json(apiKey);
  } catch (err) {
    next(err);
  }
});

apiKeysRouter.get('/', async (req, res, next) => {
  try {
    const keys = await apiKeyService.listApiKeys(req.user.id);
    res.status(200).json(keys);
  } catch (err) {
    next(err);
  }
});

apiKeysRouter.delete('/:id', async (req, res, next) => {
  try {
    await apiKeyService.revokeApiKey({
      id: req.params.id,
      userId: req.user.id,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
