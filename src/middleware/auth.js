import { verifyJwt } from '../core/jwt.js';
import { hashApiKey } from '../core/api-key.js';
import * as userRepo from '../repositories/user.repo.js';
import * as apiKeyRepo from '../repositories/api-key.repo.js';
import { createUnauthorizedError, createForbiddenError } from '../core/errors.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  try {
    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        throw createUnauthorizedError('Authentication required');
      }

      const token = authHeader.slice(7).trim();
      const payload = verifyJwt(token);

      const user = await userRepo.findUserById(payload.sub);
      if (!user || !user.is_active) {
        throw createUnauthorizedError('Authentication required');
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };
      req.authType = 'jwt';
      return next();
    }

    if (apiKeyHeader) {
      const rawKey = typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '';
      if (!rawKey) {
        throw createUnauthorizedError('Authentication required');
      }

      const keyHash = hashApiKey(rawKey);
      const key = await apiKeyRepo.findApiKeyByHash(keyHash);

      if (!key) {
        throw createUnauthorizedError('Authentication required');
      }

      if (key.revoked_at !== null) {
        throw createUnauthorizedError('Authentication required');
      }

      if (key.expires_at !== null && new Date(key.expires_at) <= new Date()) {
        throw createUnauthorizedError('Authentication required');
      }

      if (!key.user_is_active) {
        throw createUnauthorizedError('Authentication required');
      }

      // Update last_used_at timestamp in background asynchronously
      apiKeyRepo.updateLastUsedAt(key.id).catch(() => {});

      req.user = {
        id: key.user_id,
        email: key.email,
        role: key.role,
      };
      req.apiKey = {
        id: key.id,
        name: key.name,
      };
      req.authType = 'api_key';
      return next();
    }

    throw createUnauthorizedError('Authentication required');
  } catch (err) {
    next(err);
  }
};

export const requireJwt = (req, res, next) => {
  if (req.authType !== 'jwt') {
    return next(createForbiddenError('API keys cannot manage API keys'));
  }
  next();
};
