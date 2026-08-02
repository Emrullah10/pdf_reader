import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPdfToImages } from './render-pdf-to-images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');

describe('renderPdfToImages', () => {
  it('renders each page of a PDF to a PNG file', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'pdf-render-test-'));

    const pages = await renderPdfToImages({ pdfPath: join(fixturesDir, 'sample-text.pdf'), outputDir });

    expect(pages).toHaveLength(1);
    expect(pages[0].pageNo).toBe(1);
    expect(existsSync(pages[0].path)).toBe(true);

    const fileBuffer = readFileSync(pages[0].path);
    expect(fileBuffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});
