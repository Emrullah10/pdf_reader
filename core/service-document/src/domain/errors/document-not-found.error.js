export class DocumentNotFoundError extends Error {
  constructor(documentId) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
    this.documentId = documentId;
  }
}
