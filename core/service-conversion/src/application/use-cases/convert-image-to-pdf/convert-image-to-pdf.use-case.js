export const makeConvertImageToPdf = ({ pdfBuilder }) => {
  return async ({ imageBuffers, mimeTypes }) => {
    return pdfBuilder.build({ imageBuffers, mimeTypes });
  };
};
