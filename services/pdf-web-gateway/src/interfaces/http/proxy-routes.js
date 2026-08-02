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
        // Uploads stream through this proxy, and a large PDF's extraction can keep the target
        // service busy well past the default socket timeout. Without these the connection is
        // dropped mid-transfer and the client sees a truncated/failed upload.
        proxyTimeout: 10 * 60 * 1000,
        timeout: 10 * 60 * 1000,
        on: {
          proxyReq: (proxyReq, req) => {
            const { accessToken } = readAuthCookies(req);
            if (accessToken) {
              proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
            }
            // jsonBody() is scoped to /api/gateway, so proxied requests normally still have an
            // unread stream that http-proxy-middleware pipes through untouched — which is what
            // multipart uploads need. Only re-serialize when something upstream actually parsed
            // a body; calling fixRequestBody on an unparsed request would truncate the upload.
            if (req.body && Object.keys(req.body).length > 0) {
              fixRequestBody(proxyReq, req);
            }
          },
        },
      }),
    );
  }

  return router;
};
