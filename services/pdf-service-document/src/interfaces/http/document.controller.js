import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { translateDomainError } from '@pdf-reader/core-service-document/src/interfaces/http/translate-domain-error.js';

const toPublicDocument = (doc) => ({
  id: doc.id,
  originalName: doc.originalName,
  mime: doc.mime,
  sizeBytes: doc.sizeBytes,
  pageCount: doc.pageCount,
  status: doc.status,
  hasTextLayer: doc.hasTextLayer,
  errorMessage: doc.errorMessage,
  createdAt: doc.createdAt,
});

export const makeDocumentController = ({ uploadDocument, getDocument, listDocuments, searchDocuments, storageDir }) => ({
  upload: async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { message: 'No file uploaded, or file was not a PDF', details: null } });
        return;
      }

      const storagePath = join(storageDir, 'documents', `${randomUUID()}.pdf`);
      mkdirSync(join(storageDir, 'documents'), { recursive: true });
      writeFileSync(storagePath, req.file.buffer);

      const document = await uploadDocument({
        userId: req.user.sub,
        originalName: req.file.originalname,
        mime: req.file.mimetype,
        sizeBytes: req.file.size,
        storagePath,
        fileBuffer: req.file.buffer,
      });

      res.status(201).json({ document: toPublicDocument(document) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  get: async (req, res, next) => {
    try {
      const document = await getDocument({ documentId: req.params.id, userId: req.user.sub });
      res.status(200).json({ document: toPublicDocument(document) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  list: async (req, res, next) => {
    try {
      const documents = await listDocuments({ userId: req.user.sub });
      res.status(200).json({ documents: documents.map(toPublicDocument) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  search: async (req, res, next) => {
    try {
      const { query, documentIds } = req.body;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: { message: 'query is required', details: null } });
        return;
      }

      const result = await searchDocuments({
        userId: req.user.sub,
        query,
        documentIds: Array.isArray(documentIds) ? documentIds : [],
      });

      res.status(200).json(result);
    } catch (err) {
      next(translateDomainError(err));
    }
  },
});
