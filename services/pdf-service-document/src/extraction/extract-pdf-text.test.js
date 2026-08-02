import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdfText } from './extract-pdf-text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');

describe('extractPdfText', () => {
  it('extracts page count, dimensions, and words with bounding boxes from a real PDF', async () => {
    const buffer = readFileSync(join(fixturesDir, 'sample-text.pdf'));

    const result = await extractPdfText(buffer);

    expect(result.pageCount).toBe(1);
    expect(result.hasTextLayer).toBe(true);
    expect(result.pages).toHaveLength(1);

    const page = result.pages[0];
    expect(page.pageNo).toBe(1);
    expect(page.width).toBeGreaterThan(0);
    expect(page.height).toBeGreaterThan(0);
    expect(page.words.length).toBeGreaterThan(0);

    const texts = page.words.map((w) => w.text.toLowerCase());
    expect(texts).toContain('hello');
    expect(texts).toContain('world');

    const helloWord = page.words.find((w) => w.text.toLowerCase() === 'hello');
    expect(helloWord.x).toBeGreaterThanOrEqual(0);
    expect(helloWord.y).toBeGreaterThanOrEqual(0);
    expect(helloWord.w).toBeGreaterThan(0);
    expect(helloWord.h).toBeGreaterThan(0);
    expect(typeof helloWord.wordIndex).toBe('number');
  });

  it('assigns sequential wordIndex values starting at 0 per page', async () => {
    const buffer = readFileSync(join(fixturesDir, 'sample-text.pdf'));
    const result = await extractPdfText(buffer);

    const indices = result.pages[0].words.map((w) => w.wordIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(indices[0]).toBe(0);
  });

  it('lays out consecutive words on the same line without gaps or overlaps', async () => {
    const buffer = readFileSync(join(fixturesDir, 'sample-text.pdf'));
    const result = await extractPdfText(buffer);

    const words = result.pages[0].words;
    expect(words.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < words.length; i++) {
      const previous = words[i - 1];
      const current = words[i];
      // Each word should start at or after the previous word's right edge (no overlap),
      // and reasonably close to it (no large unexplained gap from a miscalculated width).
      expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.w - 0.01);
    }

    // The words should collectively span roughly the same width as the sum of their individual widths
    // (proportional-by-character-count split should account for the full run width, no width lost or added).
    const firstWord = words[0];
    const lastWord = words[words.length - 1];
    const totalSpan = lastWord.x + lastWord.w - firstWord.x;
    const sumOfWidths = words.reduce((sum, w) => sum + w.w, 0);
    expect(totalSpan).toBeCloseTo(sumOfWidths, 1);
  });

  it('throws a descriptive error for a non-PDF buffer', async () => {
    await expect(extractPdfText(Buffer.from('this is not a pdf'))).rejects.toThrow();
  });
});
