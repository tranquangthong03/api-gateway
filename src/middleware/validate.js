import { createValidationError } from '../core/errors.js';

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(createValidationError('Validation failed', { issues }));
  }
  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(createValidationError('Validation failed', { issues }));
  }
  for (const key of Object.keys(req.query)) {
    delete req.query[key];
  }
  Object.assign(req.query, result.data);
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(createValidationError('Validation failed', { issues }));
  }
  for (const key of Object.keys(req.params)) {
    delete req.params[key];
  }
  Object.assign(req.params, result.data);
  next();
};
