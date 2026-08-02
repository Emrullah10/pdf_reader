import express from 'express';
import cookieParser from 'cookie-parser';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeIdentityClient } from './clients/identity-client.js';
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

  app.use(cookieParser());
  app.use(jsonBody());
  app.use(issueCsrfCookie({ isProduction: config.isProduction }));

  app.use(
    '/api/gateway',
    makeGatewayRoutes({ gatewayController, requireAuth, requireCsrfToken, strictAuthLimiter }),
  );
  app.use(makeProxyRoutes({ routeTable, requireAuth }));

  app.use(notFound());
  app.use(handleErrors);

  return { app };
};
