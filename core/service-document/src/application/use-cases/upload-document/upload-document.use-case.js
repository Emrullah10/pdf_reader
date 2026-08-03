import { UnsupportedFileTypeError } from '../../../domain/errors/unsupported-file-type.error.js';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf']);

// How many pages to accumulate before writing them out. Buffering trades a small, bounded amount
// of memory (a batch's worth of pages/words, never the whole document) for far fewer round trips:
// one INSERT per page/word-batch pair instead of two per page.
const PAGE_BATCH_SIZE = 25;

// Text extraction walks every page and pulls each page's operator list, which is CPU-bound and
// scales with page count — a few hundred pages can take minutes. Kept separate from the upload
// path so it can run after the response has been sent, rather than holding the request open.
//
// `runInTransaction` is injected (rather than this module reaching for a pool/client itself) so
// the use-case stays storage-agnostic; the composition root wires it to withTransaction(pool, ...).
// `onProgress`, if given, is called after each batch flush with the running page count — the
// worker uses it to update document_jobs.pages_done so clients can poll a percentage.
export const makeProcessDocument = ({ documentRepo, pageRepo, wordRepo, extractor, normalize, runInTransaction, onProgress }) => {
  const flush = async (documentId, batch) => {
    if (batch.length === 0) return;

    await runInTransaction(async (client) => {
      const createdPages = await pageRepo.createMany(
        documentId,
        batch.map((page) => ({ pageNo: page.pageNo, width: page.width, height: page.height })),
        { client },
      );
      const pageIdByPageNo = new Map(createdPages.map((p) => [p.pageNo, p.id]));

      const pageIds = [];
      const words = [];
      for (const page of batch) {
        const pageId = pageIdByPageNo.get(page.pageNo);
        for (const w of page.words) {
          pageIds.push(pageId);
          words.push({
            text: w.text,
            textNormalized: normalize(w.text),
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            wordIndex: w.wordIndex,
          });
        }
      }

      await wordRepo.createMany(pageIds, words, { client });
    });
  };

  return async ({ documentId, storagePath }) => {
    try {
      // Pages accumulate in a batch and are written together, so a batch's worth of pages/words is
      // the most this loop ever holds — not the whole document — while still cutting round trips
      // from two-per-page to two-per-batch.
      let batch = [];
      let pagesFlushed = 0;
      const { pageCount, hasTextLayer } = await extractor.extractByPage(storagePath, async (page) => {
        batch.push(page);
        if (batch.length >= PAGE_BATCH_SIZE) {
          const toFlush = batch;
          batch = [];
          await flush(documentId, toFlush);
          pagesFlushed += toFlush.length;
          await onProgress?.({ pagesDone: pagesFlushed });
        }
      });
      await flush(documentId, batch);
      pagesFlushed += batch.length;
      await onProgress?.({ pagesDone: pagesFlushed });

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

// Records a document as needing extraction, without running it. A separate worker process polls
// document_jobs and calls processDocument — this keeps the HTTP process's response free of the
// CPU-bound extraction work entirely, rather than merely not awaiting it in the same process.
export const makeEnqueueDocumentProcessing = ({ jobRepo }) => {
  return async ({ documentId }) => jobRepo.enqueue(documentId);
};
