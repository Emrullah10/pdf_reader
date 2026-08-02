import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export const makeProxyRoutes = ({ routeTable, requireAuth }) => {
  const router = Router();

  for (const { prefix, target } of routeTable) {
    router.use(prefix, requireAuth, createProxyMiddleware({ target, changeOrigin: true }));
  }

  return router;
};
