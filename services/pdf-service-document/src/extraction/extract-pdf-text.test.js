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

  it('throws a descriptive error for a non-PDF buffer', async () => {
    await expect(extractPdfText(Buffer.from('this is not a pdf'))).rejects.toThrow();
  });
});
