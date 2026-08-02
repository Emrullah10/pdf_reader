import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

export const makeGetDocument = ({ documentRepo }) => {
  return async ({ documentId, userId }) => {
    const document = await documentRepo.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }
    return document;
  };
};
