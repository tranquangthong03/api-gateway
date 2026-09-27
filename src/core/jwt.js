import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { createUnauthorizedError } from './errors.js';

export const signJwt = (payload, expiresIn = env.JWT_EXPIRES_IN) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn,
  });
};

export const verifyJwt = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
  } catch {
    throw createUnauthorizedError('Authentication required');
  }
};
