import { Router } from 'express';

export const makeGatewayRoutes = ({ gatewayController, requireAuth, requireCsrfToken, strictAuthLimiter }) => {
  const router = Router();

  router.post('/register', strictAuthLimiter, requireCsrfToken, gatewayController.register);
  router.post('/login', strictAuthLimiter, requireCsrfToken, gatewayController.login);
  router.post('/refresh', strictAuthLimiter, requireCsrfToken, gatewayController.refresh);
  router.post('/logout', requireCsrfToken, gatewayController.logout);
  router.get('/me', requireAuth, gatewayController.me);

  return router;
};
