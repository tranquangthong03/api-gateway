import * as apiKeyRepo from '../repositories/api-key.repo.js';
import { generateRawApiKey, extractKeyPrefix, hashApiKey } from '../core/api-key.js';
import { createNotFoundError } from '../core/errors.js';

export const createApiKey = async ({ userId, name, expiresInDays }) => {
  const rawKey = generateRawApiKey();
  const keyPrefix = extractKeyPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);

  let expiresAt = null;
  if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  const apiKey = await apiKeyRepo.createApiKey({
    userId,
    name,
    keyHash,
    keyPrefix,
    expiresAt,
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    key: rawKey,
    key_prefix: apiKey.key_prefix,
    rate_limit_per_min: apiKey.rate_limit_per_min,
    expires_at: apiKey.expires_at,
    created_at: apiKey.created_at,
    warning: 'Store this key now. It will not be shown again.',
  };
};

export const listApiKeys = async (userId) => {
  const keys = await apiKeyRepo.findApiKeysByUserId(userId);
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    key_prefix: k.key_prefix,
    rate_limit_per_min: k.rate_limit_per_min,
    last_used_at: k.last_used_at,
    expires_at: k.expires_at,
    revoked_at: k.revoked_at,
    created_at: k.created_at,
  }));
};

export const revokeApiKey = async ({ id, userId }) => {
  const existingKey = await apiKeyRepo.findApiKeyById(id);
  if (!existingKey || existingKey.user_id !== userId) {
    throw createNotFoundError('Resource not found');
  }

  await apiKeyRepo.revokeApiKey(id, userId);
};
