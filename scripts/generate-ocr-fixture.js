import { renderPdfToImages } from '../services/pdf-service-conversion/src/rendering/render-pdf-to-images.js';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'test', 'fixtures');

const run = async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ocr-fixture-'));
  const pages = await renderPdfToImages({ pdfPath: join(fixturesDir, 'sample-text.pdf'), outputDir: tmpDir });
  copyFileSync(pages[0].path, join(fixturesDir, 'sample-text-page-1.png'));
  console.log('Generated OCR fixture:', join(fixturesDir, 'sample-text-page-1.png'));
};

run();
