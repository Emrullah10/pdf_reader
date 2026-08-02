import express from 'express';
import cookieParser from 'cookie-parser';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeIdentityClient } from './clients/identity-client.js';
import { readAuthCookies } from './auth/cookies.js';
import { makeGatewayController } from './interfaces/http/gateway.controller.js';
import { makeGatewayRoutes } from './interfaces/http/gateway-routes.js';
import { makeProxyRoutes } from './interfaces/http/proxy-routes.js';
import { makeRequireAuth } from './middlewares/require-auth.js';
import { requireCsrfToken, issueCsrfCookie } from './middlewares/csrf.js';
import { strictAuthLimiter } from './middlewares/rate-limit.js';
import { buildRouteTable } from './route-table.js';

export const boot = (config) => {
  const identityClient = makeIdentityClient({ baseUrl: config.identityServiceUrl });
  const requireAuth = makeRequireAuth({ jwtAccessSecret: config.jwtAccessSecret });
  const gatewayController = makeGatewayController({ identityClient, isProduction: config.isProduction });
  const routeTable = buildRouteTable(config);

  const app = express();

  // Behind Cloudflare Tunnel (or any reverse proxy) the client IP arrives in X-Forwarded-For.
  // Without this, express-rate-limit sees every request as coming from the tunnel itself and
  // throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR — worse, it would rate-limit all users as one.
  // The tunnel is the only hop in front of us, so trust exactly one proxy.
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(issueCsrfCookie({ isProduction: config.isProduction }));

  app.use(
    '/api/gateway',
    // Mounted here rather than globally: a global json parser consumes the request stream for
    // every route, including proxied multipart uploads, which then have to be re-serialized and
    // are buffered entirely in the gateway's memory. Proxy routes need the raw stream instead.
    jsonBody(),
    makeGatewayRoutes({ gatewayController, requireAuth, requireCsrfToken, strictAuthLimiter }),
  );
  app.use(makeProxyRoutes({ routeTable, requireAuth, readAuthCookies }));

  app.use(notFound());
  app.use(handleErrors);

  return { app };
};
