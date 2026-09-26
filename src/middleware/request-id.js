import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from '../core/logger.js';

export const requestIdMiddleware = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existingId = req.headers['x-request-id'];
    const id = existingId && typeof existingId === 'string' ? existingId : `req_${randomUUID()}`;
    res.setHeader('X-Request-ID', id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
});
