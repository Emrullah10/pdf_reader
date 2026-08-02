# Phase 4: Conversion Service (PDF↔Image, OCR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `pdf-service-conversion` — convert an already-uploaded PDF to page images (PNG), convert an image to a searchable PDF via OCR, and run OCR on a scanned (no-text-layer) PDF so its `page_words` become searchable through the existing document-service search endpoint. This closes the two gaps the user explicitly asked for: "dönüştürme" (conversion) and OCR for scanned documents.

**Architecture:** Same hexagonal pattern (`core/service-conversion` + `services/pdf-service-conversion`). Conversion jobs run **synchronously in-process** for this phase (same simplification as the document service — no BullMQ/Redis queue yet; OCR on a typical few-page PDF takes seconds, acceptable for a synchronous HTTP request in this phase). Two conversion capabilities: (1) `pdf-to-images` — renders each PDF page to a PNG via `pdftoppm` (poppler-utils, already installed on this machine) and stores the images, returning download URLs; (2) `ocr-document` — runs Tesseract OCR (`tesseract.js`) against a document's rendered page images, extracts words+coordinates, and writes them into the EXISTING `page_words` table via a direct call to the document service's HTTP API (not a shared DB connection — services stay decoupled, communicating over HTTP only, consistent with the gateway's proxy-based architecture). This means: upload a scanned PDF → document service correctly reports `hasTextLayer: false` (already built in phase 3) → call `POST /api/conversion/ocr` → conversion service OCRs it and pushes words back into the document service → search now works on that document too.

**Tech Stack:** Node.js 22 (ESM), Express 4, `pdftoppm` (poppler-utils CLI, invoked via `child_process`), `tesseract.js` (pure-JS OCR, no native build step), `sharp` (image post-processing if needed), local filesystem storage (same `STORAGE_DIR` convention as the document service), Jest 29.

---

## Context

`services/pdf-service-document` is fully built: upload, pdfjs-dist extraction, Postgres storage of `documents`/`document_pages`/`page_words`, search — all working end-to-end through the gateway. `services/pdf-web-gateway`'s `route-table.js` currently has one entry (`/api/documents` → document service).

**Why OCR pushes words via HTTP instead of writing to Postgres directly:** the conversion service does NOT get its own `pg` connection to the `documents`/`page_words` tables. Those tables are owned by the document service. Cross-service direct-DB-writes would violate the "each service owns its own data" boundary this monorepo has followed since phase 1 (see `MONOREPO-ARCHITECTURE-TEMPLATE.md` §3 — services communicate via HTTP, not shared DB access). Instead, the document service gets ONE new internal endpoint, `PUT /api/documents/:id/pages/:pageNo/words`, that the conversion service calls after running OCR — this keeps the document service as the sole owner/writer of its own schema.

**Storage reuse:** conversion service uses the same `STORAGE_DIR` env var and directory convention as the document service (`STORAGE_DIR/documents/<uuid>.pdf` for source PDFs, now adding `STORAGE_DIR/renders/<documentId>/<pageNo>.png` for rendered page images). It needs read access to the original PDF file — since storage is local disk in this phase (not S3), and both services run on the same machine in dev, the conversion service reads the PDF directly from `STORAGE_DIR` using the `storagePath` value returned by the document service's `GET /api/documents/:id` endpoint. This is a deliberate simplification that will need revisiting if these services are ever deployed on separate machines (a future "shared storage / S3" phase, not this one).

---

## File Structure

```
core/service-conversion/
├── package.json
└── src/
    ├── domain/
    │   └── errors/
    │       ├── conversion-job-failed.error.js
    │       └── unsupported-conversion-type.error.js
    ├── application/
    │   └── use-cases/
    │       ├── render-pdf-pages/
    │       │   ├── render-pdf-pages.use-case.js
    │       │   └── render-pdf-pages.use-case.test.js
    │       ├── convert-image-to-pdf/
    │       │   ├── convert-image-to-pdf.use-case.js
    │       │   └── convert-image-to-pdf.use-case.test.js
    │       └── ocr-document/
    │           ├── ocr-document.use-case.js
    │           └── ocr-document.use-case.test.js
    └── interfaces/http/
        └── translate-domain-error.js

services/pdf-service-conversion/
├── package.json
├── main.js
├── ecosystem.config.js
├── configs/
│   └── app-config.js
└── src/
    ├── boot.js
    ├── container.js
    ├── rendering/
    │   ├── render-pdf-to-images.js       # child_process wrapper around pdftoppm
    │   └── render-pdf-to-images.test.js
    ├── ocr/
    │   ├── run-ocr.js                     # tesseract.js wrapper: image -> words+coordinates
    │   └── run-ocr.test.js
    ├── clients/
    │   └── document-client.js             # HTTP client: get document, push OCR'd words
    └── interfaces/http/
        ├── conversion.controller.js
        ├── require-auth.js
        └── routes.js

services/pdf-service-document/src/interfaces/http/
└── (MODIFIED) document.controller.js, routes.js  — add internal words-push endpoint

core/service-document/src/application/use-cases/
└── (NEW) ingest-ocr-words/
    ├── ingest-ocr-words.use-case.js
    └── ingest-ocr-words.use-case.test.js

test/services/conversion/
└── integration/
    ├── config/
    │   └── test-config.js
    └── conversion.e2e.test.js

test/fixtures/
└── sample-scanned.pdf   # generated: an image-only PDF (no text layer) for OCR testing
```

---

## Task 1: Domain errors + package skeleton

**Files:**
- Create: `core/service-conversion/package.json`
- Create: `core/service-conversion/src/domain/errors/conversion-job-failed.error.js`
- Create: `core/service-conversion/src/domain/errors/unsupported-conversion-type.error.js`

`package.json`:
```json
{
  "name": "@pdf-reader/core-service-conversion",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js"
}
```

`conversion-job-failed.error.js`:
```js
export class ConversionJobFailedError extends Error {
  constructor(reason) {
    super(`Conversion job failed: ${reason}`);
    this.name = 'ConversionJobFailedError';
  }
}
```

`unsupported-conversion-type.error.js`:
```js
export class UnsupportedConversionTypeError extends Error {
  constructor(type) {
    super(`Unsupported conversion type: ${type}`);
    this.name = 'UnsupportedConversionTypeError';
    this.type = type;
  }
}
```

No tests — trivial constructors, same precedent as `core/service-document`'s domain errors.

---

## Task 2: `render-pdf-to-images.js` — pdftoppm wrapper

**Files:**
- Create: `services/pdf-service-conversion/package.json`
- Create: `services/pdf-service-conversion/src/rendering/render-pdf-to-images.js`
- Create: `services/pdf-service-conversion/src/rendering/render-pdf-to-images.test.js`

`package.json`:
```json
{
  "name": "@pdf-reader/service-conversion",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": { "start": "node main.js" },
  "dependencies": {
    "@pdf-reader/config": "*",
    "@pdf-reader/core-service-conversion": "*",
    "@pdf-reader/errors": "*",
    "@pdf-reader/helper": "*",
    "@pdf-reader/middlewares": "*",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "tesseract.js": "^5.1.1",
    "multer": "^1.4.5-lts.1"
  }
}
```

`render-pdf-to-images.js` — invokes the system `pdftoppm` binary (already installed at `/opt/homebrew/bin/pdftoppm` on this machine, part of poppler-utils):

```js
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
```

**Design note:** `pdftoppm -png -r <dpi> input.pdf outputPrefix` produces files named `outputPrefix-1.png`, `outputPrefix-2.png`, etc. (or `outputPrefix-01.png` with zero-padding depending on page count — poppler auto-pads based on total page count, which is why the code re-derives `pageNo` from sorted array position rather than parsing the filename's number, avoiding any zero-padding parsing bugs).

Test (`render-pdf-to-images.test.js`) uses `test/fixtures/sample-text.pdf` (already exists from phase 3):

```js
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdtempSync, existsSync } from 'node:fs';
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
    expect(fileBuffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // PNG magic bytes
  });
});
```

Run: `cd /Users/emrullah/developer/fullStack/pdf_reader && npm install && node --experimental-vm-modules node_modules/.bin/jest services/pdf-service-conversion/src/rendering --no-coverage`

Note: don't actually run this — per current instructions, write and edit code only, no test execution. Just write the files as specified.

Commit is not required to be run either — just write the files; committing/testing happens in a later pass if requested.

---

## Task 3: `run-ocr.js` — tesseract.js wrapper

**Files:**
- Create: `services/pdf-service-conversion/src/ocr/run-ocr.js`
- Create: `services/pdf-service-conversion/src/ocr/run-ocr.test.js`

```js
import { createWorker } from 'tesseract.js';

export const runOcr = async (imagePath, { languages = 'eng+tur' } = {}) => {
  const worker = await createWorker(languages);

  try {
    const { data } = await worker.recognize(imagePath);

    const words = (data.words ?? []).map((w, index) => ({
      text: w.text,
      x: w.bbox.x0,
      y: w.bbox.y0,
      w: w.bbox.x1 - w.bbox.x0,
      h: w.bbox.y1 - w.bbox.y0,
      wordIndex: index,
    }));

    return { words };
  } finally {
    await worker.terminate();
  }
};
```

**Design note — Turkish OCR support:** `languages = 'eng+tur'` loads both English and Turkish trained data (tesseract.js downloads language data on first use, cached afterward). This directly serves the project's Turkish-first requirement — OCR'd Turkish text should recognize Turkish characters (ş, ğ, ı, etc.) correctly, which then flows through the ALREADY-BUILT Turkish-aware `normalize()` function (phase 3) when the words are ingested into `page_words`.

Test:
```js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOcr } from './run-ocr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');

describe('runOcr', () => {
  it('extracts words with bounding boxes from a rendered page image', async () => {
    // Requires test/fixtures/sample-text-page-1.png — see Task 4, which generates this
    // fixture as a side effect of testing renderPdfToImages. If it doesn't exist yet
    // when this test runs, run Task 2's render test first or run scripts/generate-test-pdfs.js
    // followed by a manual renderPdfToImages call to produce it — this test READS a pre-rendered
    // PNG rather than re-rendering, to keep OCR tests fast and independent of pdftoppm.
    const imagePath = join(fixturesDir, 'sample-text-page-1.png');

    const result = await runOcr(imagePath, { languages: 'eng' });

    expect(result.words.length).toBeGreaterThan(0);
    const texts = result.words.map((w) => w.text.toLowerCase());
    expect(texts.some((t) => t.includes('hello'))).toBe(true);
  }, 30000); // OCR can be slow on first run (downloads language data)
});
```

**IMPORTANT — fixture dependency:** this test needs a pre-rendered PNG fixture (`test/fixtures/sample-text-page-1.png`) that doesn't exist yet. Add a step to `scripts/generate-test-pdfs.js` (already exists from phase 3) that also renders `sample-text.pdf` to a PNG using the newly-written `renderPdfToImages` function, OR write a small one-off script `scripts/generate-ocr-fixture.js` that does this. Since test execution is out of scope for this pass, just write BOTH the test file above AND a `scripts/generate-ocr-fixture.js` that would produce the needed fixture:

```js
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
```

---

## Task 4: `ocr-document` use-case (core)

**Files:**
- Create: `core/service-conversion/src/application/use-cases/ocr-document/ocr-document.use-case.js`
- Create: `core/service-conversion/src/application/use-cases/ocr-document/ocr-document.use-case.test.js`

**Collaborator shapes:**
- `documentClient`: `{ getDocument(documentId, authToken), pushPageWords(documentId, pageNo, words, authToken) }`
- `renderer`: `{ render({ pdfPath, outputDir }) }` → `[{ pageNo, path }]`
- `ocrEngine`: `{ recognize(imagePath) }` → `{ words: [{text, x, y, w, h, wordIndex}] }`

```js
export const makeOcrDocument = ({ documentClient, renderer, ocrEngine, tmpDirFactory }) => {
  return async ({ documentId, authToken }) => {
    const document = await documentClient.getDocument(documentId, authToken);
    const outputDir = tmpDirFactory();

    const pages = await renderer.render({ pdfPath: document.storagePath, outputDir });

    let totalWords = 0;
    for (const page of pages) {
      const { words } = await ocrEngine.recognize(page.path);
      if (words.length > 0) {
        await documentClient.pushPageWords(documentId, page.pageNo, words, authToken);
        totalWords += words.length;
      }
    }

    return { documentId, pagesProcessed: pages.length, wordsExtracted: totalWords };
  };
};
```

Test (fakes, no real OCR/rendering):
```js
import { makeOcrDocument } from './ocr-document.use-case.js';

describe('makeOcrDocument', () => {
  it('renders each page, OCRs it, and pushes words back to the document service', async () => {
    const pushed = [];
    const documentClient = {
      getDocument: async () => ({ id: 'doc-1', storagePath: '/tmp/fake.pdf' }),
      pushPageWords: async (documentId, pageNo, words) => {
        pushed.push({ documentId, pageNo, words });
      },
    };
    const renderer = { render: async () => [{ pageNo: 1, path: '/tmp/page-1.png' }, { pageNo: 2, path: '/tmp/page-2.png' }] };
    const ocrEngine = {
      recognize: async (path) => ({
        words: path.includes('page-1') ? [{ text: 'Hello', x: 0, y: 0, w: 10, h: 10, wordIndex: 0 }] : [],
      }),
    };

    const ocrDocument = makeOcrDocument({ documentClient, renderer, ocrEngine, tmpDirFactory: () => '/tmp/ocr-job' });

    const result = await ocrDocument({ documentId: 'doc-1', authToken: 'token' });

    expect(result.pagesProcessed).toBe(2);
    expect(result.wordsExtracted).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].pageNo).toBe(1);
  });

  it('skips pushing words for pages with no OCR results', async () => {
    const pushed = [];
    const documentClient = {
      getDocument: async () => ({ id: 'doc-1', storagePath: '/tmp/fake.pdf' }),
      pushPageWords: async (...args) => pushed.push(args),
    };
    const renderer = { render: async () => [{ pageNo: 1, path: '/tmp/page-1.png' }] };
    const ocrEngine = { recognize: async () => ({ words: [] }) };

    const ocrDocument = makeOcrDocument({ documentClient, renderer, ocrEngine, tmpDirFactory: () => '/tmp/ocr-job' });

    const result = await ocrDocument({ documentId: 'doc-1', authToken: 'token' });

    expect(result.wordsExtracted).toBe(0);
    expect(pushed).toHaveLength(0);
  });
});
```

---

## Task 5: `render-pdf-pages` and `convert-image-to-pdf` use-cases (core)

**Files:**
- Create: `core/service-conversion/src/application/use-cases/render-pdf-pages/render-pdf-pages.use-case.js` + `.test.js`
- Create: `core/service-conversion/src/application/use-cases/convert-image-to-pdf/convert-image-to-pdf.use-case.js` + `.test.js`

`render-pdf-pages.use-case.js` — the "convert PDF to images" feature (returns image file paths for the HTTP layer to serve/zip):

```js
export const makeRenderPdfPages = ({ documentClient, renderer, tmpDirFactory }) => {
  return async ({ documentId, authToken, dpi = 150 }) => {
    const document = await documentClient.getDocument(documentId, authToken);
    const outputDir = tmpDirFactory();
    const pages = await renderer.render({ pdfPath: document.storagePath, outputDir, dpi });
    return { documentId, pages };
  };
};
```

Test:
```js
import { makeRenderPdfPages } from './render-pdf-pages.use-case.js';

describe('makeRenderPdfPages', () => {
  it('fetches the document and renders each page to an image', async () => {
    const documentClient = { getDocument: async () => ({ id: 'doc-1', storagePath: '/tmp/fake.pdf' }) };
    const renderer = { render: async () => [{ pageNo: 1, path: '/tmp/page-1.png' }] };

    const renderPdfPages = makeRenderPdfPages({ documentClient, renderer, tmpDirFactory: () => '/tmp/render-job' });

    const result = await renderPdfPages({ documentId: 'doc-1', authToken: 'token' });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].path).toBe('/tmp/page-1.png');
  });
});
```

`convert-image-to-pdf.use-case.js` — the "convert JPEG/PNG to PDF" feature, using `pdf-lib` (already a devDependency from phase 3 — promote it to a real dependency of the conversion service):

```js
export const makeConvertImageToPdf = ({ pdfBuilder }) => {
  return async ({ imageBuffers, mimeTypes }) => {
    return pdfBuilder.build({ imageBuffers, mimeTypes });
  };
};
```

Test (fake `pdfBuilder`):
```js
import { makeConvertImageToPdf } from './convert-image-to-pdf.use-case.js';

describe('makeConvertImageToPdf', () => {
  it('delegates to the pdfBuilder with the provided images', async () => {
    let receivedArgs;
    const pdfBuilder = { build: async (args) => { receivedArgs = args; return Buffer.from('fake-pdf-bytes'); } };

    const convertImageToPdf = makeConvertImageToPdf({ pdfBuilder });
    const result = await convertImageToPdf({ imageBuffers: [Buffer.from('img1')], mimeTypes: ['image/png'] });

    expect(result).toEqual(Buffer.from('fake-pdf-bytes'));
    expect(receivedArgs.imageBuffers).toHaveLength(1);
  });
});
```

**Note:** `pdfBuilder` is injected abstractly here (core stays framework-free); the REAL `pdfBuilder` implementation using `pdf-lib`'s `PDFDocument.create()` + `embedPng`/`embedJpg` + `addPage` lives in `services/pdf-service-conversion/src/rendering/build-pdf-from-images.js` (Task 6).

---

## Task 6: `build-pdf-from-images.js` — real pdf-lib implementation

**Files:**
- Create: `services/pdf-service-conversion/src/rendering/build-pdf-from-images.js`

```js
import { PDFDocument } from 'pdf-lib';

export const makePdfBuilder = () => ({
  async build({ imageBuffers, mimeTypes }) {
    const doc = await PDFDocument.create();

    for (let i = 0; i < imageBuffers.length; i++) {
      const buffer = imageBuffers[i];
      const mime = mimeTypes[i];

      const image = mime === 'image/png' ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
      const page = doc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    return Buffer.from(await doc.save());
  },
});
```

Add `pdf-lib` as a real dependency (not devDependency) of `services/pdf-service-conversion/package.json`:
```json
"pdf-lib": "^1.17.1"
```

---

## Task 7: `document-client.js` — HTTP client to the document service

**Files:**
- Create: `services/pdf-service-conversion/src/clients/document-client.js`

```js
export const makeDocumentClient = ({ baseUrl }) => ({
  async getDocument(documentId, authToken) {
    const res = await fetch(`${baseUrl}/api/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch document ${documentId}: ${res.status}`);
    }
    const { document } = await res.json();
    return document;
  },

  async pushPageWords(documentId, pageNo, words, authToken) {
    const res = await fetch(`${baseUrl}/api/documents/${documentId}/pages/${pageNo}/words`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ words }),
    });
    if (!res.ok) {
      throw new Error(`Failed to push words for document ${documentId} page ${pageNo}: ${res.status}`);
    }
    return res.json();
  },
});
```

**Note:** `getDocument`'s current shape (from phase 3's `document.controller.js`'s `toPublicDocument`) does NOT include `storagePath` in its public response (it's intentionally omitted as an internal implementation detail). This means Task 8 needs to ALSO modify the document service's `toPublicDocument` — or, better, add a SEPARATE internal-only field. See Task 9 for the exact fix.

---

## Task 8: Document service — add `ingest-ocr-words` use-case (core/service-document)

**Files:**
- Create: `core/service-document/src/application/use-cases/ingest-ocr-words/ingest-ocr-words.use-case.js`
- Create: `core/service-document/src/application/use-cases/ingest-ocr-words/ingest-ocr-words.use-case.test.js`

This lives in `core/service-document` (not `core/service-conversion`) because it's the document service that owns writes to `page_words` — the conversion service only calls this via HTTP.

```js
import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

export const makeIngestOcrWords = ({ documentRepo, pageRepo, wordRepo, normalize }) => {
  return async ({ documentId, userId, pageNo, words }) => {
    const document = await documentRepo.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    const pages = await pageRepo.listByDocument(documentId);
    let page = pages.find((p) => p.pageNo === pageNo);

    if (!page) {
      const [createdPage] = await pageRepo.createMany(documentId, [{ pageNo, width: 0, height: 0 }]);
      page = createdPage;
    }

    await wordRepo.createMany(
      page.id,
      words.map((w) => ({
        text: w.text,
        textNormalized: normalize(w.text),
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        wordIndex: w.wordIndex,
      })),
    );

    const hasTextLayer = true;
    return documentRepo.updateStatus(documentId, { status: 'ready', hasTextLayer });
  };
};
```

**Design note:** if the page doesn't exist yet (common for a scanned PDF, since phase 3's `uploadDocument` still creates a `document_pages` row even with zero words — check: yes, `uploadDocument` calls `pageRepo.createMany` for every page regardless of word count, so pages DO already exist for a scanned upload, just with `width: 0, height: 0`... actually no, re-check phase 3's `extractPdfText` — it always returns real `width`/`height` from `viewport`, even for pages with zero extracted words, since pdfjs can read page dimensions even without a text layer). So in practice the `if (!page)` branch is defensive/unlikely to trigger for documents that went through normal upload, but is kept as a safety net for robustness (e.g. if OCR is ever run on a page number that somehow wasn't pre-created).

Test (with fakes from `core/service-document/test/fakes/`, already built in phase 3):
```js
import { makeIngestOcrWords } from './ingest-ocr-words.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { makeFakePageRepository, makeFakeWordRepository } from '../../../../test/fakes/fake-page-word-repository.js';
import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

describe('makeIngestOcrWords', () => {
  it('writes OCR words into an existing page and marks the document ready with hasTextLayer true', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', status: 'ready', hasTextLayer: false },
    ]);
    const pageRepo = makeFakePageRepository();
    pageRepo._all.push({ id: 'page-1', documentId: 'doc-1', pageNo: 1, width: 612, height: 792 });
    const wordRepo = makeFakeWordRepository();

    const ingestOcrWords = makeIngestOcrWords({ documentRepo, pageRepo, wordRepo, normalize: (s) => s.toLowerCase() });

    const result = await ingestOcrWords({
      documentId: 'doc-1',
      userId: 'user-1',
      pageNo: 1,
      words: [{ text: 'Hello', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }],
    });

    expect(result.hasTextLayer).toBe(true);
    expect(wordRepo._all).toHaveLength(1);
    expect(wordRepo._all[0].textNormalized).toBe('hello');
  });

  it('throws DocumentNotFoundError for a document the user does not own', async () => {
    const documentRepo = makeFakeDocumentRepository([{ id: 'doc-1', userId: 'other-user', status: 'ready' }]);
    const ingestOcrWords = makeIngestOcrWords({
      documentRepo,
      pageRepo: makeFakePageRepository(),
      wordRepo: makeFakeWordRepository(),
      normalize: (s) => s.toLowerCase(),
    });

    await expect(
      ingestOcrWords({ documentId: 'doc-1', userId: 'user-1', pageNo: 1, words: [] }),
    ).rejects.toThrow(DocumentNotFoundError);
  });
});
```

---

## Task 9: Document service — expose `storagePath` internally + new PUT endpoint

**Files:**
- Modify: `services/pdf-service-document/src/interfaces/http/document.controller.js`
- Modify: `services/pdf-service-document/src/interfaces/http/routes.js`
- Modify: `services/pdf-service-document/src/container.js`

### Step 1: Add an internal-only field to the document response

In `document.controller.js`, the PUBLIC `toPublicDocument` mapper must NOT change (frontend and other consumers depend on its exact shape). Instead, add a SEPARATE endpoint variant, OR simplest: since `getDocument`'s use-case already returns the full internal `document` object (including `storagePath`), just add `storagePath` to the response ONLY when the request is confirmed to originate from a trusted internal service call. Given this phase has no service-to-service auth distinct from user JWTs (the conversion service calls using the END USER's own access token, not a service-account token — the user IS authorized to see their own document's storage path, it's not a secret), the simplest correct fix is: add `storagePath` to `toPublicDocument`'s output. It's not sensitive (it's a local file path, not a credential), and the endpoint is already user-scoped via `requireAuth` + `findByIdAndUser`.

Edit `toPublicDocument` in `document.controller.js`:
```js
const toPublicDocument = (doc) => ({
  id: doc.id,
  originalName: doc.originalName,
  mime: doc.mime,
  sizeBytes: doc.sizeBytes,
  pageCount: doc.pageCount,
  status: doc.status,
  hasTextLayer: doc.hasTextLayer,
  errorMessage: doc.errorMessage,
  createdAt: doc.createdAt,
  storagePath: doc.storagePath,
});
```

### Step 2: Add the `ingestOcrWords` controller method

Add to `document.controller.js`'s exported factory:
```js
  ingestOcrWords: async (req, res, next) => {
    try {
      const { words } = req.body;
      if (!Array.isArray(words)) {
        res.status(400).json({ error: { message: 'words must be an array', details: null } });
        return;
      }

      const document = await ingestOcrWords({
        documentId: req.params.id,
        userId: req.user.sub,
        pageNo: Number(req.params.pageNo),
        words,
      });

      res.status(200).json({ document: toPublicDocument(document) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },
```

Add `ingestOcrWords` to `makeDocumentController`'s destructured parameters:
```js
export const makeDocumentController = ({ uploadDocument, getDocument, listDocuments, searchDocuments, ingestOcrWords, storageDir }) => ({
```

### Step 3: Add the route

In `routes.js`, add:
```js
router.put('/:id/pages/:pageNo/words', requireAuth, documentController.ingestOcrWords);
```

### Step 4: Wire it in container.js

Add the import and wiring:
```js
import { makeIngestOcrWords } from '@pdf-reader/core-service-document/src/application/use-cases/ingest-ocr-words/ingest-ocr-words.use-case.js';
```

Add inside `buildContainer`:
```js
  const ingestOcrWords = makeIngestOcrWords({ documentRepo, pageRepo, wordRepo, normalize });
```

Add `ingestOcrWords` to the `makeDocumentController({...})` call's object.

---

## Task 10: Conversion service HTTP layer, container, boot, main

**Files:**
- Create: `services/pdf-service-conversion/src/interfaces/http/require-auth.js` (identical pattern to document service's)
- Create: `services/pdf-service-conversion/src/interfaces/http/conversion.controller.js`
- Create: `services/pdf-service-conversion/src/interfaces/http/routes.js`
- Create: `services/pdf-service-conversion/src/container.js`
- Create: `services/pdf-service-conversion/src/boot.js`
- Create: `services/pdf-service-conversion/main.js`
- Create: `services/pdf-service-conversion/ecosystem.config.js`
- Create: `services/pdf-service-conversion/configs/app-config.js`

`configs/app-config.js`:
```js
import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('CONVERSION_PORT', '3003')),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  documentServiceUrl: requireEnv('DOCUMENT_SERVICE_URL', 'http://localhost:3002'),
  storageDir: requireEnv('STORAGE_DIR', '/tmp/pdf-reader-storage'),
  maxUploadBytes: Number(requireEnv('MAX_UPLOAD_BYTES', String(50 * 1024 * 1024))),
});
```

`require-auth.js` — identical to `services/pdf-service-document/src/interfaces/http/require-auth.js` (copy verbatim, same Bearer-header JWT verification pattern).

`conversion.controller.js`:
```js
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const makeConversionController = ({ renderPdfPages, convertImageToPdf, ocrDocument }) => ({
  renderPages: async (req, res, next) => {
    try {
      const authToken = req.headers.authorization.slice('Bearer '.length);
      const result = await renderPdfPages({ documentId: req.params.documentId, authToken });

      const images = result.pages.map((p) => ({
        pageNo: p.pageNo,
        base64: readFileSync(p.path).toString('base64'),
      }));

      res.status(200).json({ documentId: result.documentId, pages: images });
    } catch (err) {
      next(err);
    }
  },

  imageToPdf: async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        res.status(400).json({ error: { message: 'No images uploaded', details: null } });
        return;
      }

      const imageBuffers = req.files.map((f) => f.buffer);
      const mimeTypes = req.files.map((f) => f.mimetype);

      const pdfBuffer = await convertImageToPdf({ imageBuffers, mimeTypes });

      res.status(200).set('Content-Type', 'application/pdf').send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },

  ocr: async (req, res, next) => {
    try {
      const authToken = req.headers.authorization.slice('Bearer '.length);
      const result = await ocrDocument({ documentId: req.params.documentId, authToken });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
});
```

`routes.js`:
```js
import { Router } from 'express';
import multer from 'multer';

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).array('images', 20);

export const makeConversionRoutes = ({ conversionController, requireAuth }) => {
  const router = Router();

  router.post('/pdf-to-images/:documentId', requireAuth, conversionController.renderPages);
  router.post('/image-to-pdf', requireAuth, imageUpload, conversionController.imageToPdf);
  router.post('/ocr/:documentId', requireAuth, conversionController.ocr);

  return router;
};
```

`container.js`:
```js
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
```

`boot.js`:
```js
import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeConversionRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  app.use(jsonBody());
  app.use(
    '/api/conversion',
    makeConversionRoutes({ conversionController: container.conversionController, requireAuth: container.requireAuth }),
  );
  app.use(notFound());
  app.use(handleErrors);

  return { app };
};
```

`main.js`:
```js
import { loadEnv } from '@pdf-reader/config';
import { makeLogger } from '@pdf-reader/helper';
import { getAppConfig } from './configs/app-config.js';
import { boot } from './src/boot.js';

loadEnv();
const config = getAppConfig();
const logger = makeLogger({ serviceName: 'pdf-service-conversion' });
const { app } = boot(config);

app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});
```

`ecosystem.config.js`:
```js
export default {
  apps: [{ name: 'pdf-service-conversion', script: './main.js', instances: 1, exec_mode: 'fork' }],
};
```

---

## Task 11: Wire conversion service into the gateway

**Files:**
- Modify: `services/pdf-web-gateway/configs/app-config.js`
- Modify: `services/pdf-web-gateway/src/route-table.js`
- Modify: `.env.example`

Add to gateway config:
```js
  conversionServiceUrl: requireEnv('CONVERSION_SERVICE_URL', 'http://localhost:3003'),
```

Add to route table:
```js
export const buildRouteTable = (config) => [
  { prefix: '/api/documents', target: config.documentServiceUrl },
  { prefix: '/api/conversion', target: config.conversionServiceUrl },
];
```

Add to `.env.example`:
```
CONVERSION_PORT=3003
CONVERSION_SERVICE_URL=http://localhost:3003
```

---

## Notes on scope and what's deferred

- **No job queue.** OCR and rendering run synchronously within the HTTP request. For large/multi-page scanned PDFs this could mean a slow request (tesseract.js OCR is not fast — several seconds per page). Acceptable for this phase; a background job queue (BullMQ + Redis) is a natural follow-up once this pattern proves out, matching the original architecture doc's phase-4 design intent.
- **`pdf-to-images` returns base64-encoded PNGs in a JSON response**, not a ZIP download or individual file URLs. This is the simplest correct implementation for now; a later refinement could stream a ZIP or provide signed download URLs instead, especially for many-page documents where base64-in-JSON bloats payload size significantly.
- **No automatic OCR triggering.** The document service (phase 3) already detects `hasTextLayer: false` on upload for scanned PDFs, but does NOT automatically call the conversion service's OCR endpoint — that decision is left to the frontend (phase 5), which will show an "this looks scanned, run OCR?" prompt and call `POST /api/conversion/ocr/:documentId` explicitly. This matches the original design intent from the very first architecture brainstorm.
