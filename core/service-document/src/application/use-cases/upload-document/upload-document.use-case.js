import { UnsupportedFileTypeError } from '../../../domain/errors/unsupported-file-type.error.js';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf']);

export const makeUploadDocument = ({ documentRepo, pageRepo, wordRepo, extractor, normalize }) => {
  return async ({ userId, originalName, mime, sizeBytes, storagePath, fileBuffer }) => {
    if (!SUPPORTED_MIME_TYPES.has(mime)) {
      throw new UnsupportedFileTypeError(mime);
    }

    const document = await documentRepo.create({ userId, originalName, mime, sizeBytes, storagePath });

    try {
      const extracted = await extractor.extract(fileBuffer);

      for (const page of extracted.pages) {
        const [createdPage] = await pageRepo.createMany(document.id, [
          { pageNo: page.pageNo, width: page.width, height: page.height },
        ]);

        if (page.words.length > 0) {
          await wordRepo.createMany(
            createdPage.id,
            page.words.map((w) => ({
              text: w.text,
              textNormalized: normalize(w.text),
              x: w.x,
              y: w.y,
              w: w.w,
              h: w.h,
              wordIndex: w.wordIndex,
            })),
          );
        }
      }

      const hasTextLayer = extracted.hasTextLayer;

      return documentRepo.updateStatus(document.id, {
        status: 'ready',
        pageCount: extracted.pageCount,
        hasTextLayer,
      });
    } catch (err) {
      return documentRepo.updateStatus(document.id, {
        status: 'failed',
        errorMessage: err.message,
      });
    }
  };
};
