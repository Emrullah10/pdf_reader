import {
  makeUploadDocument,
  makeProcessDocument,
  makeEnqueueDocumentProcessing,
} from '@pdf-reader/core-service-document/src/application/use-cases/upload-document/upload-document.use-case.js';
import { makeGetDocument } from '@pdf-reader/core-service-document/src/application/use-cases/get-document/get-document.use-case.js';
import { makeListDocuments } from '@pdf-reader/core-service-document/src/application/use-cases/list-documents/list-documents.use-case.js';
import { makeSearchDocuments } from '@pdf-reader/core-service-document/src/application/use-cases/search-documents/search-documents.use-case.js';
import { makeIngestOcrWords } from '@pdf-reader/core-service-document/src/application/use-cases/ingest-ocr-words/ingest-ocr-words.use-case.js';
import { makeDeleteDocument } from '@pdf-reader/core-service-document/src/application/use-cases/delete-document/delete-document.use-case.js';
import { normalize } from '@pdf-reader/core-service-document/src/domain/text/normalize.js';
import { makePool, withTransaction } from './infrastructure/persistence/db.js';
import { makeDocumentRepository } from './infrastructure/persistence/document.repository.js';
import { makeDocumentPageRepository } from './infrastructure/persistence/document-page.repository.js';
import { makePageWordRepository } from './infrastructure/persistence/page-word.repository.js';
import { makeDocumentJobRepository } from './infrastructure/persistence/document-job.repository.js';
import { makeLocalFileStore } from './infrastructure/persistence/local-file-store.js';
import { makeUploadSessionStore } from './infrastructure/persistence/upload-session-store.js';
import { extractPdfTextByPage } from './extraction/extract-pdf-text.js';
import { makeDocumentController } from './interfaces/http/document.controller.js';
import { makeRequireAuth } from './interfaces/http/require-auth.js';
import { makeUploadMiddleware } from './interfaces/http/upload.middleware.js';

// Shared by both the API process and the extraction worker: repositories and use-cases that don't
// depend on which process is running them.
export const buildCoreServices = (config) => {
  const pool = makePool({ connectionString: config.databaseUrl });
  const documentRepo = makeDocumentRepository({ pool });
  const pageRepo = makeDocumentPageRepository({ pool });
  const wordRepo = makePageWordRepository({ pool });
  const jobRepo = makeDocumentJobRepository({ pool });
  const extractor = { extractByPage: extractPdfTextByPage };
  const runInTransaction = (run) => withTransaction(pool, run);

  return { pool, documentRepo, pageRepo, wordRepo, jobRepo, extractor, runInTransaction };
};

// The API process's container: handles uploads and enqueues extraction, but never runs it —
// that keeps CPU-bound PDF parsing off the process answering HTTP requests. A separate worker
// process (worker/main.js) is the only thing that calls makeProcessDocument.
export const buildContainer = (config) => {
  const { pool, documentRepo, pageRepo, wordRepo, jobRepo } = buildCoreServices(config);

  const uploadDocument = makeUploadDocument({ documentRepo, processDocument: null });
  const enqueueDocumentProcessing = makeEnqueueDocumentProcessing({ jobRepo });
  const getDocument = makeGetDocument({ documentRepo });
  const listDocuments = makeListDocuments({ documentRepo });
  const searchDocuments = makeSearchDocuments({ wordRepo, normalize });
  const ingestOcrWords = makeIngestOcrWords({ documentRepo, pageRepo, wordRepo, normalize });
  const fileStore = makeLocalFileStore();
  const deleteDocument = makeDeleteDocument({ documentRepo, fileStore });

  const uploadSessionStore = makeUploadSessionStore({ storageDir: config.storageDir });

  const documentController = makeDocumentController({
    uploadDocument,
    enqueueDocumentProcessing,
    getDocument,
    listDocuments,
    searchDocuments,
    ingestOcrWords,
    deleteDocument,
    uploadSessionStore,
    maxUploadBytes: config.maxUploadBytes,
  });

  const requireAuth = makeRequireAuth({ jwtAccessSecret: config.jwtAccessSecret });
  const uploadMiddleware = makeUploadMiddleware({ storageDir: config.storageDir, maxUploadBytes: config.maxUploadBytes });

  return { pool, documentController, requireAuth, uploadMiddleware, uploadSessionStore };
};

export { makeProcessDocument };
