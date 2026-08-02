import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const groupTextItemsIntoWords = (textContent, pageHeight) => {
  const words = [];
  let wordIndex = 0;

  for (const item of textContent.items) {
    const rawPieces = item.str.split(/\s+/).filter((piece) => piece.length > 0);
    if (rawPieces.length === 0) continue;

    const [x, , , , , f] = item.transform;
    const itemHeight = item.height || Math.abs(item.transform[3]) || 10;
    const itemWidth = item.width || item.str.length * (itemHeight * 0.5);

    // pdf.js gives one text item per run of text (often a whole line or phrase, not one item per word).
    // Split proportionally by character count across the item's bounding box to approximate per-word boxes.
    const totalChars = rawPieces.join('').length || 1;
    let cursorX = x;

    for (const piece of rawPieces) {
      const pieceWidth = (piece.length / totalChars) * itemWidth;
      words.push({
        text: piece,
        x: cursorX,
        y: pageHeight - f, // baseline position (flipped to top-left origin), not the glyph box's top edge
        w: pieceWidth,
        h: itemHeight,
        wordIndex: wordIndex++,
      });
      cursorX += pieceWidth;
    }
  }

  return words;
};

export const extractPdfText = async (fileBuffer) => {
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer) });
  const pdf = await loadingTask.promise;

  const pages = [];
  let anyWords = false;

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const words = groupTextItemsIntoWords(textContent, viewport.height);
    if (words.length > 0) anyWords = true;

    pages.push({ pageNo, width: viewport.width, height: viewport.height, words });
  }

  return { pageCount: pdf.numPages, hasTextLayer: anyWords, pages };
};
