export class DocumentNotReadyError extends Error {
  constructor(documentId, status) {
    super(`Document ${documentId} is not ready for search (status: ${status})`);
    this.name = 'DocumentNotReadyError';
    this.documentId = documentId;
    this.status = status;
  }
}
