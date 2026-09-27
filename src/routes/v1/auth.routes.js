import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { registerSchema, loginSchema } from '../../schemas/auth.schema.js';
import * as authService from '../../services/auth.service.js';
import { authMiddleware } from '../../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authMiddleware, async (req, res) => {
  res.status(200).json({
    user_id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    auth_type: req.authType,
  });
});
