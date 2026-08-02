export const makeRenderPdfPages = ({ documentClient, renderer, tmpDirFactory }) => {
  return async ({ documentId, authToken, dpi = 150 }) => {
    const document = await documentClient.getDocument(documentId, authToken);
    const outputDir = tmpDirFactory();
    const pages = await renderer.render({ pdfPath: document.storagePath, outputDir, dpi });
    return { documentId, pages };
  };
};
