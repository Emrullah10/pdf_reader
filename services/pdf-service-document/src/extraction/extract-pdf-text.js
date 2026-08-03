import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const standardFontDataUrl = pathToFileURL(
  join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/',
).href;

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

// Widths of the characters of `str` in em/1000, aligned index-for-index with the string. Only an
// exact match is used — the fallback used to also scan the whole index with `indexOf` per miss,
// which is O(index size) per text item; on text-heavy pages the flat-distribution fallback below
// is indistinguishable in practice, so a miss just takes that path instead of paying for the scan.
const glyphWidthsFor = (str, glyphWidthIndex) => {
  const exact = glyphWidthIndex.get(str);
  return exact && exact.length === str.length ? exact : null;
};

// True if any item in the page has more than one whitespace-separated piece — i.e. needs its
// width split proportionally, which is the only reason the (expensive) glyph index is ever needed.
const pageNeedsGlyphWidths = (textContent) => {
  for (const item of textContent.items) {
    if (item.str.trim().length === 0) continue;
    const pieces = item.str.match(/\S+/g);
    if (pieces && pieces.length > 1) return true;
    if (pieces && pieces[0].length !== item.str.length) return true;
  }
  return false;
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

    // A single run with no internal whitespace is exactly one word — its box is the item's own
    // box, so there's nothing to distribute proportionally and no need for glyph metrics at all.
    const pieces = [...item.str.matchAll(/\S+/g)];
    const isSingleWord = pieces.length === 1 && pieces[0][0].length === item.str.length;

    // pdf.js gives one text item per run of text (often a whole line or phrase, not one item per word),
    // so each word's box has to be carved out of the item's own bounding box.
    //
    // Character-count splitting (charWidth = itemWidth / str.length) is wrong for proportional fonts:
    // in this CV's font 'm' advances 798 units against 'e' at 503, so a box sized by character count
    // under-covers wide words and drifts on every word after the first. Instead, distribute itemWidth
    // across the characters in proportion to their real glyph advances, which keeps the total exactly
    // equal to itemWidth (so the item's right edge still lands where pdf.js says it does) while giving
    // each character its true share. glyphWidthIndex is null on pages where nothing needed it (see
    // pageNeedsGlyphWidths), which skips getOperatorList() — the most expensive step — entirely.
    const glyphWidths = isSingleWord || !glyphWidthIndex ? null : glyphWidthsFor(item.str, glyphWidthIndex);
    const totalGlyphWidth = glyphWidths?.reduce((sum, w) => sum + w, 0) ?? 0;

    // Prefix sums of glyph widths, so offsetAt(i) is O(1) instead of re-summing from 0 each call.
    let prefixSums = null;
    if (glyphWidths && totalGlyphWidth > 0) {
      prefixSums = new Array(glyphWidths.length + 1);
      prefixSums[0] = 0;
      for (let n = 0; n < glyphWidths.length; n++) prefixSums[n + 1] = prefixSums[n] + glyphWidths[n];
    }

    // Offset of character `i` from the item's left edge, and the width spanned by [start, end).
    const offsetAt = (i) => {
      if (!prefixSums) return (itemWidth * i) / (item.str.length || 1);
      return (itemWidth * prefixSums[i]) / totalGlyphWidth;
    };

    if (isSingleWord) {
      words.push({
        text: pieces[0][0],
        x: e,
        y: pageHeight - f - itemHeight,
        w: itemWidth,
        h: itemHeight,
        wordIndex: wordIndex++,
      });
      continue;
    }

    for (const match of pieces) {
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

// Opens by path rather than by buffer: passing `data` forces the whole PDF into memory, which on a
// small host is what actually kills the process on a large file. In url mode pdf.js reads ranges
// off disk as it needs them, so peak memory tracks the working set, not the file size.
//
// disableFontFace/useSystemFonts are meaningless in Node (there's no font face to render), and
// isEvalSupported: false skips JS-eval-based glyph-mapping optimizations pdf.js otherwise attempts —
// all pure overhead here. standardFontDataUrl points at the package's own font metrics so pdf.js
// doesn't need to fetch them or warn about their absence.
const openPdf = (storagePath) =>
  getDocument({
    url: pathToFileURL(storagePath),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl,
  }).promise;

// Streams a document page by page, handing each one to `onPage` and releasing it before moving on.
// Nothing accumulates across pages here — the caller decides what to keep — so a 200MB scan costs
// roughly what a 2MB one does. Returns the totals that are only knowable after a full pass.
export const extractPdfTextByPage = async (storagePath, onPage) => {
  const pdf = await openPdf(storagePath);
  let anyWords = false;

  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);

      try {
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        // getOperatorList() re-walks the whole content stream and is the single most expensive step
        // in this loop — far more than getTextContent() alone. It's only needed to split a multi-word
        // text item proportionally by real glyph advances, so pages made up entirely of single-word
        // items (common once whitespace already separates runs) skip it completely.
        const glyphWidthIndex = pageNeedsGlyphWidths(textContent)
          ? buildGlyphWidthIndex(await page.getOperatorList())
          : null;

        const words = groupTextItemsIntoWords(textContent, viewport.height, glyphWidthIndex);
        if (words.length > 0) anyWords = true;

        // pageCount is known as soon as the document is open, so it rides along with every page
        // rather than only being returned at the end — that lets a caller report real progress
        // ("525/1237") while the pass is still running instead of an indeterminate wait.
        await onPage({ pageNo, pageCount: pdf.numPages, width: viewport.width, height: viewport.height, words });
      } finally {
        // pdf.js caches every page it hands out; without this the document holds all of them
        // until destroy(), which reintroduces exactly the growth this function exists to avoid.
        page.cleanup();
      }
    }

    return { pageCount: pdf.numPages, hasTextLayer: anyWords };
  } finally {
    await pdf.destroy();
  }
};

// Collects every page in memory. Fine for small documents and for tests, but callers handling
// user uploads of unknown size should prefer extractPdfTextByPage.
export const extractPdfText = async (storagePath) => {
  const pages = [];
  const { pageCount, hasTextLayer } = await extractPdfTextByPage(storagePath, (page) => {
    pages.push(page);
  });

  return { pageCount, hasTextLayer, pages };
};
