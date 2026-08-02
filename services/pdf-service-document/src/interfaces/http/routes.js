import { Router } from 'express';

export const makeDocumentRoutes = ({ documentController, requireAuth, uploadMiddleware }) => {
  const router = Router();

  router.post('/', requireAuth, uploadMiddleware, documentController.upload);
  router.get('/', requireAuth, documentController.list);
  router.get('/:id', requireAuth, documentController.get);
  router.post('/search', requireAuth, documentController.search);

  return router;
};
