import { UnsupportedFileTypeError } from '../../../domain/errors/unsupported-file-type.error.js';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf']);

// Text extraction walks every page and pulls each page's operator list, which is CPU-bound and
// scales with page count — a few hundred pages can take minutes. Kept separate from the upload
// path so it can run after the response has been sent, rather than holding the request open.
export const makeProcessDocument = ({ documentRepo, pageRepo, wordRepo, extractor, normalize }) => {
  return async ({ documentId, storagePath }) => {
    try {
      // Each page is persisted as it arrives and then dropped, so neither the extractor's output
      // nor this loop ever holds more than one page's words — the whole point on a small host.
      const { pageCount, hasTextLayer } = await extractor.extractByPage(storagePath, async (page) => {
        const [createdPage] = await pageRepo.createMany(documentId, [
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
      });

      return documentRepo.updateStatus(documentId, {
        status: 'ready',
        pageCount,
        hasTextLayer,
      });
    } catch (err) {
      return documentRepo.updateStatus(documentId, {
        status: 'failed',
        errorMessage: err.message,
      });
    }
  };
};

// Returns as soon as the document row exists, leaving it in its schema-default 'processing'
// status. Extraction is exposed as `startProcessing` rather than awaited here, so the HTTP layer
// can send its 201 immediately; clients poll the document's status to learn when it finished.
export const makeUploadDocument = ({ documentRepo, processDocument }) => {
  return async ({ userId, originalName, mime, sizeBytes, storagePath }) => {
    if (!SUPPORTED_MIME_TYPES.has(mime)) {
      throw new UnsupportedFileTypeError(mime);
    }

    const document = await documentRepo.create({ userId, originalName, mime, sizeBytes, storagePath });

    return {
      document,
      startProcessing: () => processDocument({ documentId: document.id, storagePath }),
    };
  };
};
