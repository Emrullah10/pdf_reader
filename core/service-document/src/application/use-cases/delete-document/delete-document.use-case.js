import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

export const makeDeleteDocument = ({ documentRepo, fileStore }) => {
  return async ({ documentId, userId }) => {
    const document = await documentRepo.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    await documentRepo.deleteById(documentId);

    // Best-effort: remove the stored PDF from disk. A failure here shouldn't leave the
    // document row un-deleted (the DB is the source of truth for "does this document exist"),
    // so this runs after the DB delete succeeds and any error is swallowed rather than thrown.
    try {
      await fileStore.remove(document.storagePath);
    } catch {
      // orphaned file on disk is an acceptable, low-severity outcome — not re-thrown
    }
  };
};
