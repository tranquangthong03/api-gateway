export class AppError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const createValidationError = (message, details = null) =>
  new AppError('VALIDATION_ERROR', message, 400, details);

export const createUnauthorizedError = (message = 'Authentication required') =>
  new AppError('UNAUTHORIZED', message, 401);

export const createForbiddenError = (message = 'Access denied') =>
  new AppError('FORBIDDEN', message, 403);

export const createNotFoundError = (message = 'Resource not found') =>
  new AppError('NOT_FOUND', message, 404);

export const createConflictError = (message) => new AppError('CONFLICT', message, 409);

export const createRateLimitError = (message, retryAfterSeconds) =>
  new AppError('RATE_LIMIT_EXCEEDED', message, 429, {
    retry_after_seconds: retryAfterSeconds,
  });

export const createProviderError = (message, details = null) =>
  new AppError('PROVIDER_ERROR', message, 502, details);

export const createProviderTimeoutError = (message = 'Provider timed out') =>
  new AppError('PROVIDER_TIMEOUT', message, 504);

export const createInternalError = (message = 'Internal server error') =>
  new AppError('INTERNAL_ERROR', message, 500);
