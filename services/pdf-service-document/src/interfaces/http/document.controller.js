import { createReadStream } from 'node:fs';
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
  storagePath: doc.storagePath,
});

export const makeDocumentController = ({
  uploadDocument,
  getDocument,
  listDocuments,
  searchDocuments,
  ingestOcrWords,
  deleteDocument,
  uploadSessionStore,
  maxUploadBytes,
}) => {
  // Registers the document and kicks off extraction without waiting for it. Parsing a large PDF
  // outlasts any proxy's patience (Cloudflare cuts at 100s), so the response has to go out first;
  // the document is readable at status 'processing' and flips to 'ready'/'failed' on its own.
  const respondAndProcess = async (res, { userId, originalName, mime, sizeBytes, storagePath }) => {
    const { document, startProcessing } = await uploadDocument({
      userId,
      originalName,
      mime,
      sizeBytes,
      storagePath,
    });

    res.status(201).json({ document: toPublicDocument(document) });

    startProcessing().catch((err) => {
      // startProcessing already records the failure on the document row; this guard only stops an
      // unhandled rejection from taking the process down after the response has been sent.
      console.error(`[document] background extraction failed for ${document.id}:`, err);
    });
  };

  return {
    upload: async (req, res, next) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: { message: 'No file uploaded, or file was not a PDF', details: null } });
          return;
        }

        // multer's diskStorage has already streamed the upload to its final path.
        await respondAndProcess(res, {
          userId: req.user.sub,
          originalName: req.file.originalname,
          mime: req.file.mimetype,
          sizeBytes: req.file.size,
          storagePath: req.file.path,
        });
      } catch (err) {
        next(translateDomainError(err));
      }
    },

    // Chunked upload, three steps: create a session, PATCH each chunk at its byte offset, and the
    // final chunk finalizes automatically. Exists because a single request cannot carry a large
    // file through Cloudflare — its per-request body cap is 100MB — and because appending chunk by
    // chunk keeps memory flat no matter how big the file is.
    createUploadSession: async (req, res, next) => {
      try {
        const { originalName, mime, totalBytes } = req.body ?? {};

        if (mime !== 'application/pdf') {
          res.status(400).json({ error: { message: 'Only PDF uploads are supported', details: null } });
          return;
        }
        if (!Number.isInteger(totalBytes) || totalBytes <= 0) {
          res.status(400).json({ error: { message: 'totalBytes must be a positive integer', details: null } });
          return;
        }
        if (totalBytes > maxUploadBytes) {
          res.status(413).json({
            error: { message: `File exceeds the maximum size of ${maxUploadBytes} bytes`, details: null },
          });
          return;
        }

        const session = await uploadSessionStore.create({
          userId: req.user.sub,
          originalName: typeof originalName === 'string' ? originalName : 'document.pdf',
          mime,
          totalBytes,
        });

        res.status(201).json({
          upload: { id: session.uploadId, receivedBytes: session.receivedBytes, totalBytes: session.totalBytes },
        });
      } catch (err) {
        next(translateDomainError(err));
      }
    },

    // The chunk is streamed straight from the request to the session file; the body is never
    // buffered, so peak memory is a socket buffer rather than a chunk — let alone a whole file.
    uploadChunk: async (req, res, next) => {
      try {
        const offset = Number(req.get('x-chunk-offset'));
        if (!Number.isInteger(offset) || offset < 0) {
          res.status(400).json({ error: { message: 'x-chunk-offset header must be a byte offset', details: null } });
          return;
        }

        const result = await uploadSessionStore.appendChunk({
          uploadId: req.params.uploadId,
          userId: req.user.sub,
          expectedOffset: offset,
          chunkStream: req,
        });

        if (result.error === 'not_found') {
          res.status(404).json({ error: { message: 'Upload session not found', details: null } });
          return;
        }
        if (result.error === 'offset_mismatch') {
          // 409 with the authoritative offset lets a client that lost its connection resume from
          // exactly where the server stopped, instead of restarting a multi-hundred-MB upload.
          res.status(409).json({
            error: { message: 'Chunk offset does not match server state', details: null },
            upload: { receivedBytes: result.receivedBytes },
          });
          return;
        }
        if (result.error === 'too_large') {
          res.status(413).json({ error: { message: 'Upload exceeded its declared size', details: null } });
          return;
        }

        if (!result.complete) {
          res.status(200).json({
            upload: { receivedBytes: result.manifest.receivedBytes, totalBytes: result.manifest.totalBytes },
          });
          return;
        }

        const finalized = await uploadSessionStore.finalize({
          uploadId: req.params.uploadId,
          userId: req.user.sub,
        });
        if (!finalized) {
          res.status(409).json({ error: { message: 'Upload could not be finalized', details: null } });
          return;
        }

        await respondAndProcess(res, {
          userId: req.user.sub,
          originalName: finalized.manifest.originalName,
          mime: finalized.manifest.mime,
          sizeBytes: finalized.manifest.totalBytes,
          storagePath: finalized.storagePath,
        });
      } catch (err) {
        next(translateDomainError(err));
      }
    },

    getUploadSession: async (req, res, next) => {
      try {
        const session = await uploadSessionStore.find({
          uploadId: req.params.uploadId,
          userId: req.user.sub,
        });
        if (!session) {
          res.status(404).json({ error: { message: 'Upload session not found', details: null } });
          return;
        }

        res.status(200).json({
          upload: { id: session.uploadId, receivedBytes: session.receivedBytes, totalBytes: session.totalBytes },
        });
      } catch (err) {
        next(translateDomainError(err));
      }
    },

    cancelUploadSession: async (req, res, next) => {
      try {
        const discarded = await uploadSessionStore.discard({
          uploadId: req.params.uploadId,
          userId: req.user.sub,
        });
        if (!discarded) {
          res.status(404).json({ error: { message: 'Upload session not found', details: null } });
          return;
        }

        res.status(204).send();
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

    download: async (req, res, next) => {
      try {
        const document = await getDocument({ documentId: req.params.id, userId: req.user.sub });
        res.status(200).set('Content-Type', 'application/pdf');
        createReadStream(document.storagePath).pipe(res);
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

    remove: async (req, res, next) => {
      try {
        await deleteDocument({ documentId: req.params.id, userId: req.user.sub });
        res.status(204).send();
      } catch (err) {
        next(translateDomainError(err));
      }
    },

    ingestOcrWords: async (req, res, next) => {
      try {
        const { words } = req.body;
        if (!Array.isArray(words)) {
          res.status(400).json({ error: { message: 'words must be an array', details: null } });
          return;
        }

        const document = await ingestOcrWords({
          documentId: req.params.id,
          userId: req.user.sub,
          pageNo: Number(req.params.pageNo),
          words,
        });

        res.status(200).json({ document: toPublicDocument(document) });
      } catch (err) {
        next(translateDomainError(err));
      }
    },
  };
};
