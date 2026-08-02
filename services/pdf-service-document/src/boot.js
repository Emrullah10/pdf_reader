import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeDocumentRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  app.use(jsonBody());
  app.use(
    '/api/documents',
    makeDocumentRoutes({
      documentController: container.documentController,
      requireAuth: container.requireAuth,
      uploadMiddleware: container.uploadMiddleware,
    }),
  );
  app.use(notFound());
  app.use(handleErrors);

  return { app, pool: container.pool };
};
