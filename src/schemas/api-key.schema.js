import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_in_days: z.number().int().positive().optional(),
});

export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key: z.string(),
  key_prefix: z.string(),
  rate_limit_per_min: z.number(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  warning: z.string(),
});

export const apiKeyListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  rate_limit_per_min: z.number(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});

export const apiKeyListResponseSchema = z.array(apiKeyListItemSchema);
