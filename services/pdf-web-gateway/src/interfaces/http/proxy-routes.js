import { Router } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

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
            // app.use(jsonBody()) is mounted globally (needed for /api/gateway/*), so it
            // already consumes and parses the request stream before this proxy middleware
            // runs. Without re-serializing req.body here, any proxied POST/PUT with a JSON
            // body hangs forever — the target service waits on a body that never arrives.
            fixRequestBody(proxyReq, req);
          },
        },
      }),
    );
  }

  return router;
};
