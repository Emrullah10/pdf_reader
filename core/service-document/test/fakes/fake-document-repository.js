export const makeFakeDocumentRepository = (initial = []) => {
  const documents = [...initial];
  let nextId = documents.length + 1;

  return {
    async create({ userId, originalName, mime, sizeBytes, storagePath }) {
      const doc = {
        id: `doc-${nextId++}`,
        userId,
        originalName,
        mime,
        sizeBytes,
        storagePath,
        status: 'processing',
        pageCount: null,
        hasTextLayer: null,
        errorMessage: null,
        createdAt: new Date(),
      };
      documents.push(doc);
      return doc;
    },
    async findById(id) {
      return documents.find((d) => d.id === id) ?? null;
    },
    async findByIdAndUser(id, userId) {
      return documents.find((d) => d.id === id && d.userId === userId) ?? null;
    },
    async listByUser(userId) {
      return documents.filter((d) => d.userId === userId);
    },
    async updateStatus(id, { status, pageCount, hasTextLayer, errorMessage }) {
      const doc = documents.find((d) => d.id === id);
      if (doc) {
        doc.status = status;
        if (pageCount !== undefined) doc.pageCount = pageCount;
        if (hasTextLayer !== undefined) doc.hasTextLayer = hasTextLayer;
        if (errorMessage !== undefined) doc.errorMessage = errorMessage;
      }
      return doc;
    },
    _all: documents,
  };
};
