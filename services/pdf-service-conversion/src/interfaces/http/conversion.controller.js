import { readFileSync } from 'node:fs';

export const makeConversionController = ({ renderPdfPages, convertImageToPdf, ocrDocument }) => ({
  renderPages: async (req, res, next) => {
    try {
      const authToken = req.headers.authorization.slice('Bearer '.length);
      const result = await renderPdfPages({ documentId: req.params.documentId, authToken });

      const images = result.pages.map((p) => ({
        pageNo: p.pageNo,
        base64: readFileSync(p.path).toString('base64'),
      }));

      res.status(200).json({ documentId: result.documentId, pages: images });
    } catch (err) {
      next(err);
    }
  },

  imageToPdf: async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        res.status(400).json({ error: { message: 'No images uploaded', details: null } });
        return;
      }

      const imageBuffers = req.files.map((f) => f.buffer);
      const mimeTypes = req.files.map((f) => f.mimetype);

      const pdfBuffer = await convertImageToPdf({ imageBuffers, mimeTypes });

      res.status(200).set('Content-Type', 'application/pdf').send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },

  ocr: async (req, res, next) => {
    try {
      const authToken = req.headers.authorization.slice('Bearer '.length);
      const result = await ocrDocument({ documentId: req.params.documentId, authToken });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
});
