import { makeUploadDocument } from '@pdf-reader/core-service-document/src/application/use-cases/upload-document/upload-document.use-case.js';
import { makeGetDocument } from '@pdf-reader/core-service-document/src/application/use-cases/get-document/get-document.use-case.js';
import { makeListDocuments } from '@pdf-reader/core-service-document/src/application/use-cases/list-documents/list-documents.use-case.js';
import { makeSearchDocuments } from '@pdf-reader/core-service-document/src/application/use-cases/search-documents/search-documents.use-case.js';
import { normalize } from '@pdf-reader/core-service-document/src/domain/text/normalize.js';
import { makePool } from './infrastructure/persistence/db.js';
import { makeDocumentRepository } from './infrastructure/persistence/document.repository.js';
import { makeDocumentPageRepository } from './infrastructure/persistence/document-page.repository.js';
import { makePageWordRepository } from './infrastructure/persistence/page-word.repository.js';
import { extractPdfText } from './extraction/extract-pdf-text.js';
import { makeDocumentController } from './interfaces/http/document.controller.js';
import { makeRequireAuth } from './interfaces/http/require-auth.js';
import { makeUploadMiddleware } from './interfaces/http/upload.middleware.js';

export const buildContainer = (config) => {
  const pool = makePool({ connectionString: config.databaseUrl });
  const documentRepo = makeDocumentRepository({ pool });
  const pageRepo = makeDocumentPageRepository({ pool });
  const wordRepo = makePageWordRepository({ pool });
  const extractor = { extract: extractPdfText };

  const uploadDocument = makeUploadDocument({ documentRepo, pageRepo, wordRepo, extractor, normalize });
  const getDocument = makeGetDocument({ documentRepo });
  const listDocuments = makeListDocuments({ documentRepo });
  const searchDocuments = makeSearchDocuments({ wordRepo, normalize });

  const documentController = makeDocumentController({
    uploadDocument,
    getDocument,
    listDocuments,
    searchDocuments,
    storageDir: config.storageDir,
  });

  const requireAuth = makeRequireAuth({ jwtAccessSecret: config.jwtAccessSecret });
  const uploadMiddleware = makeUploadMiddleware({ storageDir: config.storageDir, maxUploadBytes: config.maxUploadBytes });

  return { pool, documentController, requireAuth, uploadMiddleware };
};
