import { PDFDocument } from 'pdf-lib';

export const makePdfBuilder = () => ({
  async build({ imageBuffers, mimeTypes }) {
    const doc = await PDFDocument.create();

    for (let i = 0; i < imageBuffers.length; i++) {
      const buffer = imageBuffers[i];
      const mime = mimeTypes[i];

      const image = mime === 'image/png' ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
      const page = doc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    return Buffer.from(await doc.save());
  },
});
