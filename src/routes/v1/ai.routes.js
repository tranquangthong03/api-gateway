import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authMiddleware } from '../../middleware/auth.js';
import { chatSchema, analyzeSchema } from '../../schemas/ai.schema.js';
import { executeChat } from '../../services/chat.service.js';
import { executeAnalyze } from '../../services/analyze.service.js';

export const aiRouter = Router();

aiRouter.use(authMiddleware);

aiRouter.post('/chat', validateBody(chatSchema), async (req, res, next) => {
  try {
    const orchestrator = req.app.get('orchestrator');
    const userId = req.user.id;
    const apiKeyId = req.authType === 'api_key' ? req.apiKey.id : null;
    const requestId = req.id;

    const result = await executeChat({
      userId,
      apiKeyId,
      requestId,
      conversationId: req.body.conversation_id,
      message: req.body.message,
      model: req.body.model,
      orchestrator,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/analyze', validateBody(analyzeSchema), async (req, res, next) => {
  try {
    const orchestrator = req.app.get('orchestrator');
    const userId = req.user.id;
    const apiKeyId = req.authType === 'api_key' ? req.apiKey.id : null;
    const requestId = req.id;

    const result = await executeAnalyze({
      userId,
      apiKeyId,
      requestId,
      task: req.body.task,
      text: req.body.text,
      model: req.body.model,
      orchestrator,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
