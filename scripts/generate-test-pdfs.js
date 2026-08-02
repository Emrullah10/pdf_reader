import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'test', 'fixtures');
mkdirSync(fixturesDir, { recursive: true });

const makeSimplePdf = async (text) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  return doc.save();
};

const run = async () => {
  const textPdf = await makeSimplePdf('Hello World this is a test document');
  writeFileSync(join(fixturesDir, 'sample-text.pdf'), textPdf);

  const turkishPdf = await makeSimplePdf('Istanbul sehir universitesi ogretmen');
  writeFileSync(join(fixturesDir, 'sample-turkish.pdf'), turkishPdf);

  console.log('Generated test fixture PDFs in', fixturesDir);
};

run();
