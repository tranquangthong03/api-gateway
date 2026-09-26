import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  DEFAULT_PROVIDER: z.string().default('gemini'),
  FALLBACK_PROVIDER: z.string().default('groq'),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  PROVIDER_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  DEFAULT_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:', result.error.format());
  throw new Error('Invalid environment variables configuration');
}

export const env = result.data;
