export const makeSearchDocuments = ({ documentRepo, wordRepo, normalize }) => {
  return async ({ userId, query, documentIds = [], _testContext }) => {
    const normalizedQuery = normalize(query);

    const rawMatches = await wordRepo.searchByUser(userId, {
      normalizedQuery,
      documentIds,
      ...(_testContext ?? {}),
    });

    const perDocumentMap = new Map();
    for (const match of rawMatches) {
      perDocumentMap.set(match.documentId, (perDocumentMap.get(match.documentId) ?? 0) + 1);
    }

    return {
      totalMatches: rawMatches.length,
      perDocument: [...perDocumentMap.entries()].map(([documentId, matchCount]) => ({ documentId, matchCount })),
      matches: rawMatches.map((m) => ({
        documentId: m.documentId,
        pageNo: m.pageNo,
        text: m.text,
        x: m.x,
        y: m.y,
        w: m.w,
        h: m.h,
      })),
    };
  };
};
