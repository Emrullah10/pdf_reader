import { Router } from 'express';

export const makeDocumentRoutes = ({ documentController, requireAuth, uploadMiddleware }) => {
  const router = Router();

  // Chunked upload. Declared before '/:id' so 'uploads' is not swallowed as a document id.
  router.post('/uploads', requireAuth, documentController.createUploadSession);
  router.get('/uploads/:uploadId', requireAuth, documentController.getUploadSession);
  router.delete('/uploads/:uploadId', requireAuth, documentController.cancelUploadSession);
  // No body parser on this route: the handler pipes the raw request into the session file, so any
  // middleware that consumed the stream first would both break the append and buffer the chunk.
  router.patch('/uploads/:uploadId', requireAuth, documentController.uploadChunk);

  router.post('/', requireAuth, uploadMiddleware, documentController.upload);
  router.get('/', requireAuth, documentController.list);
  router.get('/:id', requireAuth, documentController.get);
  router.get('/:id/file', requireAuth, documentController.download);
  router.delete('/:id', requireAuth, documentController.remove);
  router.post('/search', requireAuth, documentController.search);
  router.put('/:id/pages/:pageNo/words', requireAuth, documentController.ingestOcrWords);

  return router;
};
