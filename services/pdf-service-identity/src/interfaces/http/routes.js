import { Router } from 'express';

export const makeAuthRoutes = ({ authController }) => {
  const router = Router();

  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.post('/refresh', authController.refresh);
  router.post('/logout', authController.logout);

  return router;
};
