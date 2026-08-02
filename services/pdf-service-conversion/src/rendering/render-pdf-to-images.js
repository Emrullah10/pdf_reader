import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export const renderPdfToImages = async ({ pdfPath, outputDir, dpi = 150 }) => {
  await mkdir(outputDir, { recursive: true });
  const outputPrefix = join(outputDir, 'page');

  await execFileAsync('pdftoppm', ['-png', '-r', String(dpi), pdfPath, outputPrefix]);

  const files = await readdir(outputDir);
  const pageFiles = files
    .filter((f) => f.startsWith('page') && f.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return pageFiles.map((filename, index) => ({
    pageNo: index + 1,
    path: join(outputDir, filename),
  }));
};
