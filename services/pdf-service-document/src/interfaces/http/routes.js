import { Router } from 'express';

export const makeDocumentRoutes = ({ documentController, requireAuth, uploadMiddleware }) => {
  const router = Router();

  router.post('/', requireAuth, uploadMiddleware, documentController.upload);
  router.get('/', requireAuth, documentController.list);
  router.get('/:id', requireAuth, documentController.get);
  router.get('/:id/file', requireAuth, documentController.download);
  router.delete('/:id', requireAuth, documentController.remove);
  router.post('/search', requireAuth, documentController.search);
  router.put('/:id/pages/:pageNo/words', requireAuth, documentController.ingestOcrWords);

  return router;
};
