import { createWorker } from 'tesseract.js';

export const runOcr = async (imagePath, { languages = 'eng+tur' } = {}) => {
  const worker = await createWorker(languages);

  try {
    const { data } = await worker.recognize(imagePath);

    const words = (data.words ?? []).map((w, index) => ({
      text: w.text,
      x: w.bbox.x0,
      y: w.bbox.y0,
      w: w.bbox.x1 - w.bbox.x0,
      h: w.bbox.y1 - w.bbox.y0,
      wordIndex: index,
    }));

    return { words };
  } finally {
    await worker.terminate();
  }
};
