import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { healthResponseSchema, errorResponseSchema } from '../schemas/health.schema.js';
import {
  registerSchema,
  loginSchema,
  userResponseSchema,
  loginResponseSchema,
  meResponseSchema,
} from '../schemas/auth.schema.js';
import {
  createApiKeySchema,
  apiKeyResponseSchema,
  apiKeyListResponseSchema,
} from '../schemas/api-key.schema.js';
import { chatSchema, analyzeSchema } from '../schemas/ai.schema.js';
import { listConversationsSchema } from '../schemas/conversation.schema.js';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.register('HealthResponse', healthResponseSchema);
registry.register('ErrorResponse', errorResponseSchema);
registry.register('RegisterInput', registerSchema);
registry.register('LoginInput', loginSchema);
registry.register('UserResponse', userResponseSchema);
registry.register('LoginResponse', loginResponseSchema);
registry.register('MeResponse', meResponseSchema);
registry.register('CreateApiKeyInput', createApiKeySchema);
registry.register('ApiKeyResponse', apiKeyResponseSchema);
registry.register('ApiKeyListResponse', apiKeyListResponseSchema);
registry.register('ChatInput', chatSchema);
registry.register('AnalyzeInput', analyzeSchema);

const securityBearer = registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const securityApiKey = registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-Key',
});

// System
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
          example: { status: 'ok', db: 'ok', redis: 'ok' },
        },
      },
    },
    503: {
      description: 'Service is degraded or unhealthy',
      content: {
        'application/json': {
          schema: healthResponseSchema,
          example: { status: 'error', db: 'error', redis: 'ok' },
        },
      },
    },
  },
});

// Auth
registry.registerPath({
  method: 'post',
  path: '/v1/auth/register',
  summary: 'Register a new user',
  tags: ['Auth'],
  request: {
    content: {
      'application/json': {
        schema: registerSchema,
      },
    },
  },
  responses: {
    201: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: userResponseSchema,
        },
      },
    },
    400: { description: 'Validation error' },
    409: { description: 'Email already registered' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/auth/login',
  summary: 'User login',
  tags: ['Auth'],
  request: {
    content: {
      'application/json': {
        schema: loginSchema,
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: loginResponseSchema,
        },
      },
    },
    401: { description: 'Invalid email or password' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/auth/me',
  summary: 'Get current caller info',
  tags: ['Auth'],
  security: [{ [securityBearer.name]: [] }, { [securityApiKey.name]: [] }],
  responses: {
    200: {
      description: 'Current authenticated caller info',
      content: {
        'application/json': {
          schema: meResponseSchema,
        },
      },
    },
    401: { description: 'Authentication required' },
  },
});

// API Keys
registry.registerPath({
  method: 'post',
  path: '/v1/api-keys',
  summary: 'Create an API key',
  tags: ['API Keys'],
  security: [{ [securityBearer.name]: [] }],
  request: {
    content: {
      'application/json': {
        schema: createApiKeySchema,
      },
    },
  },
  responses: {
    201: {
      description: 'API key created successfully',
      content: {
        'application/json': {
          schema: apiKeyResponseSchema,
        },
      },
    },
    401: { description: 'Authentication required' },
    403: { description: 'API keys cannot manage API keys' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/api-keys',
  summary: 'List user API keys',
  tags: ['API Keys'],
  security: [{ [securityBearer.name]: [] }],
  responses: {
    200: {
      description: 'List of API keys',
      content: {
        'application/json': {
          schema: apiKeyListResponseSchema,
        },
      },
    },
    401: { description: 'Authentication required' },
    403: { description: 'API keys cannot manage API keys' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/v1/api-keys/{id}',
  summary: 'Revoke an API key',
  tags: ['API Keys'],
  security: [{ [securityBearer.name]: [] }],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    204: { description: 'API key revoked' },
    401: { description: 'Authentication required' },
    403: { description: 'API keys cannot manage API keys' },
    404: { description: 'Resource not found' },
  },
});

// AI Endpoints
registry.registerPath({
  method: 'post',
  path: '/v1/ai/chat',
  summary: 'Multi-turn chat completion',
  tags: ['AI'],
  security: [{ [securityBearer.name]: [] }, { [securityApiKey.name]: [] }],
  request: {
    content: {
      'application/json': {
        schema: chatSchema,
      },
    },
  },
  responses: {
    200: { description: 'Chat completion successful' },
    400: { description: 'Validation error' },
    401: { description: 'Authentication required' },
    404: { description: 'Conversation not found' },
    502: { description: 'Provider error' },
    504: { description: 'Provider timeout' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/v1/ai/analyze',
  summary: 'Structured text analysis',
  tags: ['AI'],
  security: [{ [securityBearer.name]: [] }, { [securityApiKey.name]: [] }],
  request: {
    content: {
      'application/json': {
        schema: analyzeSchema,
      },
    },
  },
  responses: {
    200: { description: 'Text analysis successful' },
    400: { description: 'Validation error' },
    401: { description: 'Authentication required' },
    502: { description: 'Provider or output validation error' },
    504: { description: 'Provider timeout' },
  },
});

// Conversations
registry.registerPath({
  method: 'get',
  path: '/v1/conversations',
  summary: 'List user conversations',
  tags: ['Conversations'],
  security: [{ [securityBearer.name]: [] }, { [securityApiKey.name]: [] }],
  request: {
    query: listConversationsSchema,
  },
  responses: {
    200: { description: 'List of conversations' },
    401: { description: 'Authentication required' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/v1/conversations/{id}',
  summary: 'Get conversation details with message history',
  tags: ['Conversations'],
  security: [{ [securityBearer.name]: [] }, { [securityApiKey.name]: [] }],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    200: { description: 'Conversation details' },
    401: { description: 'Authentication required' },
    404: { description: 'Conversation not found' },
  },
});

// Usage
registry.registerPath({
  method: 'get',
  path: '/v1/usage',
  summary: 'Get usage metrics and aggregates',
  tags: ['Usage'],
  security: [{ [securityBearer.name]: [] }, { [securityApiKey.name]: [] }],
  responses: {
    200: { description: 'Usage analytics metrics' },
    400: { description: 'Validation error' },
    401: { description: 'Authentication required' },
    403: { description: 'Forbidden (admin role required for user_id filter)' },
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
