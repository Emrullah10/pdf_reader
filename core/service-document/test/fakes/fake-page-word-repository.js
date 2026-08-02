export const makeFakePageRepository = () => {
  const pages = [];
  let nextId = 1;

  return {
    async createMany(documentId, pageInputs) {
      const created = pageInputs.map((p) => ({ id: `page-${nextId++}`, documentId, ...p }));
      pages.push(...created);
      return created;
    },
    async listByDocument(documentId) {
      return pages.filter((p) => p.documentId === documentId);
    },
    _all: pages,
  };
};

export const makeFakeWordRepository = (initialWords = []) => {
  const words = [...initialWords];

  return {
    async createMany(pageId, wordInputs) {
      const created = wordInputs.map((w) => ({ pageId, ...w }));
      words.push(...created);
      return created;
    },
    async searchByUser(userId, { normalizedQuery, documentIds, pagesById, documentsById }) {
      // Fake implementation for use-case unit tests: the use-case passes enough
      // context (pagesById, documentsById maps) for the fake to join in-memory.
      return words
        .filter((w) => w.textNormalized === normalizedQuery)
        .filter((w) => {
          const page = pagesById?.[w.pageId];
          if (!page) return false;
          const doc = documentsById?.[page.documentId];
          if (!doc || doc.userId !== userId) return false;
          if (documentIds && documentIds.length > 0 && !documentIds.includes(doc.id)) return false;
          return true;
        })
        .map((w) => {
          const page = pagesById[w.pageId];
          return { ...w, pageNo: page.pageNo, documentId: page.documentId };
        });
    },
    _all: words,
  };
};
