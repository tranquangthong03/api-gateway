import express from 'express';
import { requestIdMiddleware } from './middleware/request-id.js';
import { notFoundHandler, errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { swaggerUiMiddleware, swaggerUiHandler } from './openapi/index.js';

export const createApp = () => {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());

  // Swagger UI documentation
  app.use('/docs', swaggerUiMiddleware, swaggerUiHandler);

  // Health endpoint
  app.use(healthRouter);

  // Unknown route handler -> 404
  app.use(notFoundHandler);

  // Global Error handler
  app.use(errorHandler);

  return app;
};
