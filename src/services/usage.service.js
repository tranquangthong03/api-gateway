import * as usageRepo from '../repositories/usage.repo.js';
import { getDefaultTimeRange } from '../core/time.js';
import { createValidationError, createForbiddenError } from '../core/errors.js';

export const getUsageMetrics = async ({ currentUser, query }) => {
  const { from, to } = getDefaultTimeRange(query.from, query.to);

  if (new Date(from) >= new Date(to)) {
    throw createValidationError("'from' timestamp must be before 'to' timestamp");
  }

  let targetUserId;
  if (currentUser.role === 'admin') {
    targetUserId = query.user_id || null;
  } else {
    if (query.user_id && query.user_id !== currentUser.id) {
      throw createForbiddenError("'user_id' filter requires admin role");
    }
    targetUserId = currentUser.id;
  }

  const summary = await usageRepo.getUsageSummary({ from, to, userId: targetUserId });
  const byModel = await usageRepo.getUsageByModel({ from, to, userId: targetUserId });

  return {
    period: { from, to },
    requests: Number(summary?.requests || 0),
    tokens: Number(summary?.tokens || 0),
    average_latency_ms: Number(summary?.average_latency_ms || 0),
    error_rate: Number(summary?.error_rate || 0),
    estimated_cost_usd: Number(summary?.estimated_cost_usd || 0),
    by_model: byModel.map((item) => ({
      model: item.model,
      requests: Number(item.requests || 0),
      tokens: Number(item.tokens || 0),
    })),
  };
};
