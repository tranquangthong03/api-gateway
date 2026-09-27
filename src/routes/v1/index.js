import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { apiKeysRouter } from './api-keys.routes.js';
import { aiRouter } from './ai.routes.js';
import { conversationsRouter } from './conversations.routes.js';

export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/api-keys', apiKeysRouter);
v1Router.use('/ai', aiRouter);
v1Router.use('/conversations', conversationsRouter);
