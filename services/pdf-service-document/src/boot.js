import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeDocumentRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

const ABANDONED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOAD_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  // A tab closed mid-upload leaves a partial file with nobody to finalize or cancel it. Without a
  // sweep those pin disk permanently, and a few abandoned large uploads add up fast.
  const sweepUploads = () => {
    container.uploadSessionStore
      .purgeExpired({ olderThanMs: ABANDONED_UPLOAD_TTL_MS })
      .then((purged) => {
        if (purged > 0) console.log(`[document] purged ${purged} abandoned upload session(s)`);
      })
      .catch((err) => console.error('[document] upload sweep failed:', err));
  };

  sweepUploads();
  const uploadSweeper = setInterval(sweepUploads, UPLOAD_SWEEP_INTERVAL_MS);
  // Don't hold the event loop open on shutdown just for the sweeper.
  uploadSweeper.unref();

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
