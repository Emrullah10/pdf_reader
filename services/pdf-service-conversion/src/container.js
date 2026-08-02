import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRenderPdfPages } from '@pdf-reader/core-service-conversion/src/application/use-cases/render-pdf-pages/render-pdf-pages.use-case.js';
import { makeConvertImageToPdf } from '@pdf-reader/core-service-conversion/src/application/use-cases/convert-image-to-pdf/convert-image-to-pdf.use-case.js';
import { makeOcrDocument } from '@pdf-reader/core-service-conversion/src/application/use-cases/ocr-document/ocr-document.use-case.js';
import { makeDocumentClient } from './clients/document-client.js';
import { renderPdfToImages } from './rendering/render-pdf-to-images.js';
import { makePdfBuilder } from './rendering/build-pdf-from-images.js';
import { runOcr } from './ocr/run-ocr.js';
import { makeConversionController } from './interfaces/http/conversion.controller.js';
import { makeRequireAuth } from './interfaces/http/require-auth.js';

export const buildContainer = (config) => {
  const documentClient = makeDocumentClient({ baseUrl: config.documentServiceUrl });
  const renderer = { render: renderPdfToImages };
  const ocrEngine = { recognize: (imagePath) => runOcr(imagePath, { languages: 'eng+tur' }) };
  const pdfBuilder = makePdfBuilder();
  const tmpDirFactory = () => mkdtempSync(join(tmpdir(), `conversion-job-${randomUUID()}-`));

  const renderPdfPages = makeRenderPdfPages({ documentClient, renderer, tmpDirFactory });
  const convertImageToPdf = makeConvertImageToPdf({ pdfBuilder });
  const ocrDocument = makeOcrDocument({ documentClient, renderer, ocrEngine, tmpDirFactory });

  const conversionController = makeConversionController({ renderPdfPages, convertImageToPdf, ocrDocument });
  const requireAuth = makeRequireAuth({ jwtAccessSecret: config.jwtAccessSecret });

  return { conversionController, requireAuth };
};
