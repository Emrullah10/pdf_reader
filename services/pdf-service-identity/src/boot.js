import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeAuthRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  app.use(jsonBody());
  app.use('/api/auth', makeAuthRoutes({ authController: container.authController }));
  app.use(notFound());
  app.use(handleErrors);

  return { app, pool: container.pool };
};
