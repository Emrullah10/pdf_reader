import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOcr } from './run-ocr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');

describe('runOcr', () => {
  it('extracts words with bounding boxes from a rendered page image', async () => {
    const imagePath = join(fixturesDir, 'sample-text-page-1.png');

    const result = await runOcr(imagePath, { languages: 'eng' });

    expect(result.words.length).toBeGreaterThan(0);
    const texts = result.words.map((w) => w.text.toLowerCase());
    expect(texts.some((t) => t.includes('hello'))).toBe(true);
  }, 30000);
});
