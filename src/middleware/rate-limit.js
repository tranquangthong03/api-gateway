import { redis } from '../infra/redis.js';
import { env } from '../config/env.js';
import { getEpochMinute, getRetryAfterSeconds } from '../core/time.js';
import { createRateLimitError } from '../core/errors.js';
import { logger } from '../core/logger.js';

const RATE_LIMIT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], 120)
  end
  return current
`;

export const createRateLimitMiddleware = ({
  clockFn = () => Date.now(),
  redisClient = redis,
} = {}) => {
  return async (req, res, next) => {
    const idKey = req.authType === 'api_key' ? req.apiKey?.id : req.user?.id;
    if (!idKey) {
      return next();
    }

    const limit =
      req.authType === 'api_key'
        ? (req.apiKey?.rate_limit_per_min ?? env.DEFAULT_RATE_LIMIT_PER_MIN)
        : env.DEFAULT_RATE_LIMIT_PER_MIN;

    const nowMs = clockFn();
    const epochMinute = getEpochMinute(nowMs);
    const key = `rl:${idKey}:${epochMinute}`;

    try {
      const currentCount = await redisClient.eval(RATE_LIMIT_LUA, 1, key);
      const remaining = Math.max(0, limit - Number(currentCount));

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);

      if (Number(currentCount) > limit) {
        const retryAfterSeconds = getRetryAfterSeconds(nowMs);
        res.setHeader('Retry-After', retryAfterSeconds);
        logger.warn({ key, currentCount, limit }, 'Rate limit exceeded');

        return next(
          createRateLimitError(
            `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
            retryAfterSeconds,
          ),
        );
      }

      next();
    } catch (err) {
      logger.warn(
        { err: err.message },
        'Redis rate limit check failed, allowing request (fail-open)',
      );
      next();
    }
  };
};

export const rateLimitMiddleware = createRateLimitMiddleware();
