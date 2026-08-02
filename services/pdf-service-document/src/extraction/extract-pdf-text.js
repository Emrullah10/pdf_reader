import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

// pdf.js exposes per-glyph advance widths (in 1/1000 em) only through the operator list, not through
// getTextContent(). Collect them per drawn string so word boxes can be measured with the font's real
// metrics instead of assuming every character is equally wide.
const buildGlyphWidthIndex = (operatorList) => {
  const index = new Map();

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    if (operatorList.fnArray[i] !== OPS.showText) continue;

    const glyphs = operatorList.argsArray[i][0];
    let text = '';
    const widths = [];

    for (const glyph of glyphs) {
      // Numbers in the glyph array are kerning adjustments, not glyphs; they shift the pen without
      // emitting a character, so they must not contribute an entry to the per-character width list.
      if (typeof glyph !== 'object' || glyph === null) continue;
      text += glyph.unicode;
      widths.push(glyph.width);
    }

    // The same string can be drawn more than once on a page; the first occurrence's metrics apply to
    // all of them, since identical text in the same font advances identically.
    if (text && !index.has(text)) index.set(text, widths);
  }

  return index;
};

// Widths of the characters of `str` in em/1000, aligned index-for-index with the string. Falls back
// to a flat distribution when the item's text can't be matched back to a drawn string.
const glyphWidthsFor = (str, glyphWidthIndex) => {
  const exact = glyphWidthIndex.get(str);
  if (exact && exact.length === str.length) return exact;

  for (const [drawn, widths] of glyphWidthIndex) {
    const at = drawn.indexOf(str);
    if (at !== -1 && widths.length === drawn.length) return widths.slice(at, at + str.length);
  }

  return null;
};

const groupTextItemsIntoWords = (textContent, pageHeight, glyphWidthIndex) => {
  const words = [];
  let wordIndex = 0;

  for (const item of textContent.items) {
    if (item.str.trim().length === 0) continue;

    // PDF text matrix is [a, b, c, d, e, f]: the translation (i.e. the glyph origin) lives in
    // e and f. `a` is the horizontal scale/font size — reading x out of it put every box at a
    // small offset near the left margin regardless of the text's real column.
    const [, , , , e, f] = item.transform;
    const itemHeight = item.height || Math.abs(item.transform[3]) || 10;
    const itemWidth = item.width || item.str.length * (itemHeight * 0.5);

    // pdf.js gives one text item per run of text (often a whole line or phrase, not one item per word),
    // so each word's box has to be carved out of the item's own bounding box.
    //
    // Character-count splitting (charWidth = itemWidth / str.length) is wrong for proportional fonts:
    // in this CV's font 'm' advances 798 units against 'e' at 503, so a box sized by character count
    // under-covers wide words and drifts on every word after the first. Instead, distribute itemWidth
    // across the characters in proportion to their real glyph advances, which keeps the total exactly
    // equal to itemWidth (so the item's right edge still lands where pdf.js says it does) while giving
    // each character its true share.
    const glyphWidths = glyphWidthsFor(item.str, glyphWidthIndex);
    const totalGlyphWidth = glyphWidths?.reduce((sum, w) => sum + w, 0) ?? 0;

    // Offset of character `i` from the item's left edge, and the width spanned by [start, end).
    const offsetAt = (i) => {
      if (!glyphWidths || totalGlyphWidth <= 0) return (itemWidth * i) / (item.str.length || 1);
      let acc = 0;
      for (let n = 0; n < i; n++) acc += glyphWidths[n];
      return (itemWidth * acc) / totalGlyphWidth;
    };

    for (const match of item.str.matchAll(/\S+/g)) {
      const piece = match[0];
      const pieceStart = match.index;
      const pieceOffset = offsetAt(pieceStart);
      const pieceWidth = offsetAt(pieceStart + piece.length) - pieceOffset;

      words.push({
        text: piece,
        x: e + pieceOffset,
        // `f` is the baseline in PDF space (origin bottom-left). Flipping it gives the box's BOTTOM
        // edge in top-left space; subtracting the glyph height gives the TOP edge, which is what a
        // CSS-positioned highlight needs. Without the subtraction every box sat one line too low.
        y: pageHeight - f - itemHeight,
        w: pieceWidth,
        h: itemHeight,
        wordIndex: wordIndex++,
      });
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
    const operatorList = await page.getOperatorList();

    const words = groupTextItemsIntoWords(
      textContent,
      viewport.height,
      buildGlyphWidthIndex(operatorList),
    );
    if (words.length > 0) anyWords = true;

    pages.push({ pageNo, width: viewport.width, height: viewport.height, words });
  }

  return { pageCount: pdf.numPages, hasTextLayer: anyWords, pages };
};
