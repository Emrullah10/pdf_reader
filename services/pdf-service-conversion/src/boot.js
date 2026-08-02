import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeConversionRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  app.use(jsonBody());
  app.use(
    '/api/conversion',
    makeConversionRoutes({ conversionController: container.conversionController, requireAuth: container.requireAuth }),
  );
  app.use(notFound());
  app.use(handleErrors);

  return { app };
};
