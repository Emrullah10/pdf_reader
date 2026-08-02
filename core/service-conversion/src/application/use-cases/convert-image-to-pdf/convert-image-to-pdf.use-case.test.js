import { makeConvertImageToPdf } from './convert-image-to-pdf.use-case.js';

describe('makeConvertImageToPdf', () => {
  it('delegates to the pdfBuilder with the provided images', async () => {
    let receivedArgs;
    const pdfBuilder = {
      build: async (args) => {
        receivedArgs = args;
        return Buffer.from('fake-pdf-bytes');
      },
    };

    const convertImageToPdf = makeConvertImageToPdf({ pdfBuilder });
    const result = await convertImageToPdf({ imageBuffers: [Buffer.from('img1')], mimeTypes: ['image/png'] });

    expect(result).toEqual(Buffer.from('fake-pdf-bytes'));
    expect(receivedArgs.imageBuffers).toHaveLength(1);
  });
});
