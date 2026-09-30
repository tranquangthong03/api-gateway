import { AppError } from '../core/errors.js';
import { logger } from '../core/logger.js';

export const notFoundHandler = (req, res, _next) => {
  const requestId = req.id || res.getHeader('X-Request-ID') || null;
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      request_id: requestId,
    },
  });
};

export const errorHandler = (err, req, res, _next) => {
  const requestId = req.id || res.getHeader('X-Request-ID') || null;

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(
        {
          request_id: requestId,
          code: err.code,
          method: req.method,
          path: req.originalUrl,
          err,
        },
        `5xx Application Error: ${err.message}`,
      );
    }

    const errorBody = {
      code: err.code,
      message: err.message,
      request_id: requestId,
    };
    if (err.details !== null && err.details !== undefined) {
      errorBody.details = err.details;
    }
    return res.status(err.status).json({ error: errorBody });
  }

  // Handle Express body-parser JSON syntax error (400)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON body syntax',
        request_id: requestId,
      },
    });
  }

  // Handle unexpected standard errors (500)
  logger.error(
    {
      request_id: requestId,
      code: 'INTERNAL_ERROR',
      method: req.method,
      path: req.originalUrl,
      err,
    },
    'Unhandled application error',
  );

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      request_id: requestId,
    },
  });
};
