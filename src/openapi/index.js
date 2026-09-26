import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { healthResponseSchema, errorResponseSchema } from '../schemas/health.schema.js';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.register('HealthResponse', healthResponseSchema);
registry.register('ErrorResponse', errorResponseSchema);

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'Checks connectivity to PostgreSQL database and Redis cache.',
  tags: ['System'],
  responses: {
    200: {
      description: 'Service is fully healthy',
      content: {
        'application/json': {
          schema: healthResponseSchema,
          example: {
            status: 'ok',
            db: 'ok',
            redis: 'ok',
          },
        },
      },
    },
    503: {
      description: 'Service is degraded or unhealthy (Database or Redis connection failed)',
      content: {
        'application/json': {
          schema: healthResponseSchema,
          example: {
            status: 'error',
            db: 'error',
            redis: 'ok',
          },
        },
      },
    },
  },
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'AI Gateway API',
      description: 'Central AI Gateway backend service',
    },
    servers: [{ url: '/' }],
  });
}

export const swaggerUiMiddleware = swaggerUi.serve;
export const swaggerUiHandler = swaggerUi.setup(generateOpenApiDocument());
