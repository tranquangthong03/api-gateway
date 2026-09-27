import * as userRepo from '../repositories/user.repo.js';
import { hashPassword, comparePassword } from '../core/password.js';
import { signJwt } from '../core/jwt.js';
import { createConflictError, createUnauthorizedError } from '../core/errors.js';

export const registerUser = async ({ email, password, full_name }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await userRepo.findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw createConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepo.createUser({
    email: normalizedEmail,
    passwordHash,
    fullName: full_name,
  });

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    created_at: user.created_at,
  };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await userRepo.findUserByEmail(normalizedEmail);
  if (!user || !user.is_active) {
    throw createUnauthorizedError('Invalid email or password');
  }

  const isPasswordValid = await comparePassword(password, user.password_hash);
  if (!isPasswordValid) {
    throw createUnauthorizedError('Invalid email or password');
  }

  const token = signJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 3600,
  };
};
