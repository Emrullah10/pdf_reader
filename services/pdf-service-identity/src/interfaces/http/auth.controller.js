import { z } from 'zod';
import { ValidationError } from '@pdf-reader/errors';
import { translateDomainError } from '@pdf-reader/core-service-identity/src/interfaces/http/translate-domain-error.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const toPublicUser = (user) => ({ id: user.id, email: user.email, name: user.name, locale: user.locale });

const translateError = (err) => {
  if (err instanceof z.ZodError) {
    return new ValidationError('Invalid request body', err.issues);
  }
  return translateDomainError(err);
};

export const makeAuthController = ({ registerUser, loginUser, refreshSession, revokeSession }) => ({
  register: async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      const user = await registerUser(input);
      res.status(201).json({ user: toPublicUser(user) });
    } catch (err) {
      next(translateError(err));
    }
  },

  login: async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await loginUser({
        ...input,
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip,
      });
      res.status(200).json({ user: toPublicUser(user), accessToken, refreshToken });
    } catch (err) {
      next(translateError(err));
    }
  },

  refresh: async (req, res, next) => {
    try {
      const input = refreshSchema.parse(req.body);
      const { accessToken, user } = await refreshSession(input);
      res.status(200).json({ accessToken, user: toPublicUser(user) });
    } catch (err) {
      next(translateError(err));
    }
  },

  logout: async (req, res, next) => {
    try {
      const input = refreshSchema.parse(req.body);
      await revokeSession(input);
      res.status(204).send();
    } catch (err) {
      next(translateError(err));
    }
  },
});
