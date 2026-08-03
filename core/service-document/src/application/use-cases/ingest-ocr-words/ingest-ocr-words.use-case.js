import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

export const makeIngestOcrWords = ({ documentRepo, pageRepo, wordRepo, normalize }) => {
  return async ({ documentId, userId, pageNo, words }) => {
    const document = await documentRepo.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    const pages = await pageRepo.listByDocument(documentId);
    let page = pages.find((p) => p.pageNo === pageNo);

    if (!page) {
      const [createdPage] = await pageRepo.createMany(documentId, [{ pageNo, width: 0, height: 0 }]);
      page = createdPage;
    }

    await wordRepo.createMany(
      words.map(() => page.id),
      words.map((w) => ({
        text: w.text,
        textNormalized: normalize(w.text),
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        wordIndex: w.wordIndex,
      })),
    );

    return documentRepo.updateStatus(documentId, { status: 'ready', hasTextLayer: true });
  };
};
