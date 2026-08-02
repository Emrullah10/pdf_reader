import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export const makeProxyRoutes = ({ routeTable, requireAuth, readAuthCookies }) => {
  const router = Router();

  for (const { prefix, target } of routeTable) {
    router.use(
      prefix,
      requireAuth,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        pathFilter: '/**',
        pathRewrite: (path) => `${prefix}${path}`,
        on: {
          proxyReq: (proxyReq, req) => {
            const { accessToken } = readAuthCookies(req);
            if (accessToken) {
              proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
            }
          },
        },
      }),
    );
  }

  return router;
};
