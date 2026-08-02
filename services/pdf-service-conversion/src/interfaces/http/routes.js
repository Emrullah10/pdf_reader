import { Router } from 'express';
import multer from 'multer';

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).array(
  'images',
  20,
);

export const makeConversionRoutes = ({ conversionController, requireAuth }) => {
  const router = Router();

  router.post('/pdf-to-images/:documentId', requireAuth, conversionController.renderPages);
  router.post('/image-to-pdf', requireAuth, imageUpload, conversionController.imageToPdf);
  router.post('/ocr/:documentId', requireAuth, conversionController.ocr);

  return router;
};
