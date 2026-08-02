export const makeOcrDocument = ({ documentClient, renderer, ocrEngine, tmpDirFactory }) => {
  return async ({ documentId, authToken }) => {
    const document = await documentClient.getDocument(documentId, authToken);
    const outputDir = tmpDirFactory();

    const pages = await renderer.render({ pdfPath: document.storagePath, outputDir });

    let totalWords = 0;
    for (const page of pages) {
      const { words } = await ocrEngine.recognize(page.path);
      if (words.length > 0) {
        await documentClient.pushPageWords(documentId, page.pageNo, words, authToken);
        totalWords += words.length;
      }
    }

    return { documentId, pagesProcessed: pages.length, wordsExtracted: totalWords };
  };
};
