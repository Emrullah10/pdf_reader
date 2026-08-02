# Phase 3: Document Service (Upload, Text Extraction, Search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `pdf-service-document` — upload a PDF, extract per-word text + bounding-box coordinates via `pdfjs-dist`, store everything in Postgres, and expose a **Turkish-aware search endpoint** that returns per-document/per-page match counts and coordinates for every match. This is the core feature of the whole product: "search a PDF for a word, see where and how many times it appears."

**Architecture:** Same hexagonal pattern as `service-identity`: `core/service-document` (framework-free: domain errors, Turkish text normalization, the search-matching algorithm, use-cases) + `services/pdf-service-document` (Express shell: file upload via `multer`, local-disk storage, Postgres repositories, `pdfjs-dist` extraction, HTTP layer). Upload triggers extraction **synchronously in-process** for this phase (no job queue yet — `pdfjs-dist` extraction of a typical PDF takes well under a second; a real async job queue is deferred to Phase 4 when OCR, which IS slow, is introduced). Word coordinates are stored one row per word (`page_words` table) to support the frontend's future highlight-overlay rendering.

**Tech Stack:** Node.js 22 (ESM), Express 4, PostgreSQL 16 (`pg`), `pdfjs-dist` (text + coordinate extraction — legacy Node build), `multer` (multipart upload handling), local filesystem storage under a configurable directory (`STORAGE_DIR`), Jest 29.

---

## Context

`services/pdf-service-identity` and `services/pdf-web-gateway` are both fully built and working. The gateway's `route-table.js` currently returns `[]` — this phase adds a real entry so `/api/documents/*` gets proxied through the gateway with auth enforcement.

**Turkish text normalization is critical and already has precedent**: `core/service-identity/src/domain/password/password-policy.js` already uses `/\p{L}/u` (Unicode letter matching) to correctly handle Turkish characters. This phase's search normalization must handle the full Turkish casing problem: `İ→i`, `I→ı→i`, `Ş→s`, `Ğ→g`, `Ü→u`, `Ö→o`, `Ç→c`, plus NFD accent stripping — because JavaScript's default `.toLowerCase()` incorrectly turns `I` into `i` (wrong for Turkish, where `I`'s lowercase is `ı` a dotless i) and `İ` into `i̇` (with a combining dot, not matching plain `i`).

**Storage abstraction, deliberately minimal for this phase:** files are stored on local disk at `STORAGE_DIR/documents/<uuid>.pdf`. This is NOT wrapped in a swappable interface yet (no `packages/modules/storage`) — introducing that abstraction now, before a second storage backend (S3) is ever needed, would be speculative. If/when cloud storage is needed, it can be extracted then. This is a deliberate YAGNI call.

---

## File Structure

```
db-schemas/
└── 02-document-schema.sql          # documents, document_pages, page_words tables

core/service-document/
├── package.json
└── src/
    ├── domain/
    │   ├── errors/
    │   │   ├── document-not-found.error.js
    │   │   ├── unsupported-file-type.error.js
    │   │   └── document-not-ready.error.js
    │   └── text/
    │       ├── normalize.js               # Turkish-aware normalization (pure fn)
    │       └── normalize.test.js
    ├── application/
    │   └── use-cases/
    │       ├── upload-document/
    │       │   ├── upload-document.use-case.js
    │       │   └── upload-document.use-case.test.js
    │       ├── get-document/
    │       │   ├── get-document.use-case.js
    │       │   └── get-document.use-case.test.js
    │       ├── list-documents/
    │       │   ├── list-documents.use-case.js
    │       │   └── list-documents.use-case.test.js
    │       └── search-documents/
    │           ├── search-documents.use-case.js
    │           └── search-documents.use-case.test.js
    └── interfaces/http/
        └── translate-domain-error.js

services/pdf-service-document/
├── package.json
├── main.js
├── ecosystem.config.js
├── configs/
│   └── app-config.js
└── src/
    ├── boot.js
    ├── container.js
    ├── extraction/
    │   ├── extract-pdf-text.js         # pdfjs-dist wrapper: PDF buffer -> pages+words
    │   └── extract-pdf-text.test.js
    ├── infrastructure/
    │   └── persistence/
    │       ├── db.js
    │       ├── document.repository.js
    │       ├── document-page.repository.js
    │       └── page-word.repository.js
    └── interfaces/http/
        ├── upload.middleware.js        # multer config
        ├── document.controller.js
        └── routes.js

test/services/document/
└── integration/
    ├── config/
    │   └── db-setup.js
    ├── document.repository.integration.test.js
    ├── page-word.repository.integration.test.js
    └── document.e2e.test.js

test/fixtures/
├── sample-text.pdf                     # tiny real PDF with a text layer, generated by a script
└── sample-turkish.pdf                  # tiny real PDF containing Turkish words, generated by a script
```

---

## Task 1: Document schema

**Files:**
- Create: `db-schemas/02-document-schema.sql`

- [ ] **Step 1: Write the schema**

```sql
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    page_count INTEGER,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    has_text_layer BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_no INTEGER NOT NULL,
    width NUMERIC NOT NULL,
    height NUMERIC NOT NULL,
    UNIQUE (document_id, page_no)
);

CREATE TABLE IF NOT EXISTS page_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    text_normalized TEXT NOT NULL,
    x NUMERIC NOT NULL,
    y NUMERIC NOT NULL,
    w NUMERIC NOT NULL,
    h NUMERIC NOT NULL,
    word_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_page_words_page_id ON page_words(page_id);
CREATE INDEX IF NOT EXISTS idx_page_words_text_normalized ON page_words(text_normalized);
```

**Design notes:**
- `documents.status` tracks async-looking-but-actually-synchronous processing (`processing` briefly during the upload request, then `ready` or `failed` by the time the HTTP response is sent — kept as a real state machine anyway so the frontend/API contract doesn't change when Phase 4 makes large-file processing genuinely async).
- `page_words.word_index` is the word's 0-based position within its page, needed later for multi-word phrase search (not built in this phase, but the column is cheap to add now and avoids a migration later).
- No `thumbnail_key`/`render_key` columns yet — page image rendering is Phase 4/5 scope.

- [ ] **Step 2: Rebuild combined-schema.sql and reload into dev Postgres**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node scripts/build-schema.js
docker compose -f docker-compose.dev.yml up -d
PGPASSWORD=pdf_reader psql -h localhost -p 5435 -U pdf_reader -d pdf_reader -f db-schemas/02-document-schema.sql
PGPASSWORD=pdf_reader psql -h localhost -p 5435 -U pdf_reader -d pdf_reader -c '\dt'
```

Expected: `\dt` lists `documents`, `document_pages`, `page_words` in addition to the existing `users`/`sessions`.

- [ ] **Step 3: Commit**

```bash
git add db-schemas/02-document-schema.sql db-schemas/combined-schema.sql
git commit -m "feat(db-schemas): add document schema (documents, document_pages, page_words)"
```

---

## Task 2: Turkish-aware text normalization (core, TDD)

**Files:**
- Create: `core/service-document/package.json`
- Create: `core/service-document/src/domain/text/normalize.js`
- Create: `core/service-document/src/domain/text/normalize.test.js`

- [ ] **Step 1: package.json**

```json
{
  "name": "@pdf-reader/core-service-document",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js"
}
```

- [ ] **Step 2: Write the failing test**

```js
import { normalize } from './normalize.js';

describe('normalize', () => {
  it('lowercases plain ASCII text', () => {
    expect(normalize('Hello World')).toBe('hello world');
  });

  it('correctly lowercases Turkish dotted I (İ) to dotless i, not i-with-combining-dot', () => {
    expect(normalize('İstanbul')).toBe('istanbul');
  });

  it('correctly lowercases Turkish dotless I to ı, then folds it to i for matching', () => {
    expect(normalize('IŞIK')).toBe('isik');
  });

  it('lowercases other Turkish letters correctly', () => {
    expect(normalize('ŞEHİR ÜNİVERSİTESİ ÇOCUK GÜNEŞ ÖĞRETMEN')).toBe('sehir universitesi cocuk gunes ogretmen');
  });

  it('strips diacritics from non-Turkish accented characters', () => {
    expect(normalize('café')).toBe('cafe');
  });

  it('collapses multiple whitespace characters into a single space', () => {
    expect(normalize('hello    world\t\ntest')).toBe('hello world test');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  hello  ')).toBe('hello');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalize('')).toBe('');
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest core/service-document/src/domain/text/normalize --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement normalize.js**

```js
const TURKISH_UPPER_TO_LOWER = {
  İ: 'i',
  I: 'ı',
  Ş: 'ş',
  Ğ: 'ğ',
  Ü: 'ü',
  Ö: 'ö',
  Ç: 'ç',
};

const TURKISH_TO_ASCII_FOLD = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ü: 'u',
  ö: 'o',
  ç: 'c',
};

const applyTurkishCasing = (text) =>
  text.replace(/[İIŞĞÜÖÇ]/g, (ch) => TURKISH_UPPER_TO_LOWER[ch] ?? ch.toLowerCase());

const foldTurkishToAscii = (text) =>
  text.replace(/[ışğüöç]/g, (ch) => TURKISH_TO_ASCII_FOLD[ch] ?? ch);

const stripDiacritics = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normalize = (text) => {
  const turkishLowercased = applyTurkishCasing(text);
  const restLowercased = turkishLowercased.toLowerCase();
  const folded = foldTurkishToAscii(restLowercased);
  const stripped = stripDiacritics(folded);
  return stripped.replace(/\s+/g, ' ').trim();
};
```

**Why this order matters:** Turkish-specific uppercase→lowercase mapping MUST happen before the generic `.toLowerCase()` call, because JS's built-in lowercasing already mishandles `İ`/`I` before Turkish rules can be applied otherwise. Then Turkish lowercase letters are folded to their ASCII equivalents (so `ş` and `s` are treated as equivalent for search — matches the design decision that search should be accent/Turkish-letter-insensitive, e.g. searching "sehir" should find "şehir"). Then any remaining non-Turkish diacritics (café → cafe) are stripped via NFD decomposition.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest core/service-document/src/domain/text/normalize --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add core/service-document/package.json core/service-document/src/domain/text
git commit -m "feat(document-core): add Turkish-aware text normalization"
```

---

## Task 3: Domain errors

**Files:**
- Create: `core/service-document/src/domain/errors/document-not-found.error.js`
- Create: `core/service-document/src/domain/errors/unsupported-file-type.error.js`
- Create: `core/service-document/src/domain/errors/document-not-ready.error.js`

- [ ] **Step 1: Write the three error classes**

```js
// document-not-found.error.js
export class DocumentNotFoundError extends Error {
  constructor(documentId) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
    this.documentId = documentId;
  }
}
```

```js
// unsupported-file-type.error.js
export class UnsupportedFileTypeError extends Error {
  constructor(mime) {
    super(`Unsupported file type: ${mime}`);
    this.name = 'UnsupportedFileTypeError';
    this.mime = mime;
  }
}
```

```js
// document-not-ready.error.js
export class DocumentNotReadyError extends Error {
  constructor(documentId, status) {
    super(`Document ${documentId} is not ready for search (status: ${status})`);
    this.name = 'DocumentNotReadyError';
    this.documentId = documentId;
    this.status = status;
  }
}
```

No dedicated tests — trivial constructors, exercised by use-case tests in Task 4.

- [ ] **Step 2: Commit**

```bash
git add core/service-document/src/domain/errors
git commit -m "feat(document-core): add domain errors"
```

---

## Task 4: Use-cases (core, TDD)

**Files:**
- Create: `core/service-document/test/fakes/fake-document-repository.js`
- Create: `core/service-document/test/fakes/fake-page-word-repository.js`
- Create: `core/service-document/src/application/use-cases/upload-document/upload-document.use-case.js` + `.test.js`
- Create: `core/service-document/src/application/use-cases/get-document/get-document.use-case.js` + `.test.js`
- Create: `core/service-document/src/application/use-cases/list-documents/list-documents.use-case.js` + `.test.js`
- Create: `core/service-document/src/application/use-cases/search-documents/search-documents.use-case.js` + `.test.js`

**Collaborator shapes:**
- `documentRepo`: `{ create({userId, originalName, mime, sizeBytes, storagePath}), findById(id), findByIdAndUser(id, userId), listByUser(userId), updateStatus(id, {status, pageCount, hasTextLayer, errorMessage}) }`
- `pageRepo`: `{ createMany(documentId, pages) }` — `pages: [{pageNo, width, height}]`, returns created pages with `id`s
- `wordRepo`: `{ createMany(pageId, words) }` — `words: [{text, textNormalized, x, y, w, h, wordIndex}]`; `{ searchByUser(userId, {normalizedQuery, documentIds}) }` — returns matches joined with page/document info
- `extractor`: `{ extract(fileBuffer) }` → `{ pageCount, hasTextLayer, pages: [{pageNo, width, height, words: [{text, x, y, w, h, wordIndex}]}] }`

- [ ] **Step 1: Write fake-document-repository.js**

```js
export const makeFakeDocumentRepository = (initial = []) => {
  const documents = [...initial];
  let nextId = documents.length + 1;

  return {
    async create({ userId, originalName, mime, sizeBytes, storagePath }) {
      const doc = {
        id: `doc-${nextId++}`,
        userId,
        originalName,
        mime,
        sizeBytes,
        storagePath,
        status: 'processing',
        pageCount: null,
        hasTextLayer: null,
        errorMessage: null,
        createdAt: new Date(),
      };
      documents.push(doc);
      return doc;
    },
    async findById(id) {
      return documents.find((d) => d.id === id) ?? null;
    },
    async findByIdAndUser(id, userId) {
      return documents.find((d) => d.id === id && d.userId === userId) ?? null;
    },
    async listByUser(userId) {
      return documents.filter((d) => d.userId === userId);
    },
    async updateStatus(id, { status, pageCount, hasTextLayer, errorMessage }) {
      const doc = documents.find((d) => d.id === id);
      if (doc) {
        doc.status = status;
        if (pageCount !== undefined) doc.pageCount = pageCount;
        if (hasTextLayer !== undefined) doc.hasTextLayer = hasTextLayer;
        if (errorMessage !== undefined) doc.errorMessage = errorMessage;
      }
      return doc;
    },
    _all: documents,
  };
};
```

- [ ] **Step 2: Write fake-page-word-repository.js**

```js
export const makeFakePageRepository = () => {
  const pages = [];
  let nextId = 1;

  return {
    async createMany(documentId, pageInputs) {
      const created = pageInputs.map((p) => ({ id: `page-${nextId++}`, documentId, ...p }));
      pages.push(...created);
      return created;
    },
    _all: pages,
  };
};

export const makeFakeWordRepository = (initialWords = []) => {
  const words = [...initialWords];

  return {
    async createMany(pageId, wordInputs) {
      const created = wordInputs.map((w) => ({ pageId, ...w }));
      words.push(...created);
      return created;
    },
    async searchByUser(userId, { normalizedQuery, documentIds, pagesById, documentsById }) {
      // Fake implementation for use-case unit tests: the use-case passes enough
      // context (pagesById, documentsById maps) for the fake to join in-memory.
      return words
        .filter((w) => w.textNormalized === normalizedQuery)
        .filter((w) => {
          const page = pagesById?.[w.pageId];
          if (!page) return false;
          const doc = documentsById?.[page.documentId];
          if (!doc || doc.userId !== userId) return false;
          if (documentIds && documentIds.length > 0 && !documentIds.includes(doc.id)) return false;
          return true;
        })
        .map((w) => {
          const page = pagesById[w.pageId];
          return { ...w, pageNo: page.pageNo, documentId: page.documentId };
        });
    },
    _all: words,
  };
};
```

**Note on this fake's design:** the real Postgres implementation (Task 8) will do this join with a single SQL query. The fake needs enough context to replicate that join in-memory for the use-case's unit tests — see Step 7 below for how the use-case actually calls `searchByUser`, which clarifies exactly what the real repo's SQL needs to return.

- [ ] **Step 3: Write the failing test for upload-document**

```js
import { makeUploadDocument } from './upload-document.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { makeFakePageRepository, makeFakeWordRepository } from '../../../../test/fakes/fake-page-word-repository.js';
import { UnsupportedFileTypeError } from '../../../domain/errors/unsupported-file-type.error.js';

const makeExtractor = ({ pages = [{ pageNo: 1, width: 612, height: 792, words: [] }], hasTextLayer = true } = {}) => ({
  extract: async () => ({ pageCount: pages.length, hasTextLayer, pages }),
});

describe('makeUploadDocument', () => {
  it('creates a document, extracts pages/words, and marks it ready', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const pageRepo = makeFakePageRepository();
    const wordRepo = makeFakeWordRepository();
    const extractor = makeExtractor({
      pages: [
        { pageNo: 1, width: 612, height: 792, words: [{ text: 'Hello', x: 0, y: 0, w: 10, h: 10, wordIndex: 0 }] },
      ],
    });

    const uploadDocument = makeUploadDocument({ documentRepo, pageRepo, wordRepo, extractor, normalize: (s) => s.toLowerCase() });

    const result = await uploadDocument({
      userId: 'user-1',
      originalName: 'test.pdf',
      mime: 'application/pdf',
      sizeBytes: 1234,
      storagePath: '/tmp/test.pdf',
      fileBuffer: Buffer.from('fake-pdf-bytes'),
    });

    expect(result.status).toBe('ready');
    expect(result.pageCount).toBe(1);
    expect(pageRepo._all).toHaveLength(1);
    expect(wordRepo._all).toHaveLength(1);
    expect(wordRepo._all[0].textNormalized).toBe('hello');
  });

  it('rejects a non-PDF mime type', async () => {
    const uploadDocument = makeUploadDocument({
      documentRepo: makeFakeDocumentRepository(),
      pageRepo: makeFakePageRepository(),
      wordRepo: makeFakeWordRepository(),
      extractor: makeExtractor(),
      normalize: (s) => s.toLowerCase(),
    });

    await expect(
      uploadDocument({
        userId: 'user-1',
        originalName: 'test.exe',
        mime: 'application/x-msdownload',
        sizeBytes: 100,
        storagePath: '/tmp/test.exe',
        fileBuffer: Buffer.from('x'),
      }),
    ).rejects.toThrow(UnsupportedFileTypeError);
  });

  it('marks the document failed if extraction throws, without throwing itself', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const extractor = { extract: async () => { throw new Error('corrupt pdf'); } };

    const uploadDocument = makeUploadDocument({
      documentRepo,
      pageRepo: makeFakePageRepository(),
      wordRepo: makeFakeWordRepository(),
      extractor,
      normalize: (s) => s.toLowerCase(),
    });

    const result = await uploadDocument({
      userId: 'user-1',
      originalName: 'broken.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      storagePath: '/tmp/broken.pdf',
      fileBuffer: Buffer.from('x'),
    });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('corrupt pdf');
  });

  it('sets hasTextLayer to false when extraction finds no words on any page', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const extractor = makeExtractor({ pages: [{ pageNo: 1, width: 612, height: 792, words: [] }], hasTextLayer: false });

    const uploadDocument = makeUploadDocument({
      documentRepo,
      pageRepo: makeFakePageRepository(),
      wordRepo: makeFakeWordRepository(),
      extractor,
      normalize: (s) => s.toLowerCase(),
    });

    const result = await uploadDocument({
      userId: 'user-1',
      originalName: 'scanned.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      storagePath: '/tmp/scanned.pdf',
      fileBuffer: Buffer.from('x'),
    });

    expect(result.hasTextLayer).toBe(false);
  });
});
```

- [ ] **Step 3b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest upload-document.use-case --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 4: Implement upload-document.use-case.js**

```js
import { UnsupportedFileTypeError } from '../../../domain/errors/unsupported-file-type.error.js';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf']);

export const makeUploadDocument = ({ documentRepo, pageRepo, wordRepo, extractor, normalize }) => {
  return async ({ userId, originalName, mime, sizeBytes, storagePath, fileBuffer }) => {
    if (!SUPPORTED_MIME_TYPES.has(mime)) {
      throw new UnsupportedFileTypeError(mime);
    }

    const document = await documentRepo.create({ userId, originalName, mime, sizeBytes, storagePath });

    try {
      const extracted = await extractor.extract(fileBuffer);

      for (const page of extracted.pages) {
        const [createdPage] = await pageRepo.createMany(document.id, [
          { pageNo: page.pageNo, width: page.width, height: page.height },
        ]);

        if (page.words.length > 0) {
          await wordRepo.createMany(
            createdPage.id,
            page.words.map((w) => ({
              text: w.text,
              textNormalized: normalize(w.text),
              x: w.x,
              y: w.y,
              w: w.w,
              h: w.h,
              wordIndex: w.wordIndex,
            })),
          );
        }
      }

      const hasTextLayer = extracted.hasTextLayer;

      return documentRepo.updateStatus(document.id, {
        status: 'ready',
        pageCount: extracted.pageCount,
        hasTextLayer,
      });
    } catch (err) {
      return documentRepo.updateStatus(document.id, {
        status: 'failed',
        errorMessage: err.message,
      });
    }
  };
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest upload-document.use-case --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 6: Write get-document and list-documents (simple, TDD)**

`get-document.use-case.test.js`:

```js
import { makeGetDocument } from './get-document.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

describe('makeGetDocument', () => {
  it('returns the document when it belongs to the user', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', originalName: 'a.pdf', status: 'ready' },
    ]);
    const getDocument = makeGetDocument({ documentRepo });

    const doc = await getDocument({ documentId: 'doc-1', userId: 'user-1' });

    expect(doc.id).toBe('doc-1');
  });

  it('throws DocumentNotFoundError when the document does not exist or belongs to another user', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'other-user', originalName: 'a.pdf', status: 'ready' },
    ]);
    const getDocument = makeGetDocument({ documentRepo });

    await expect(getDocument({ documentId: 'doc-1', userId: 'user-1' })).rejects.toThrow(DocumentNotFoundError);
  });
});
```

`get-document.use-case.js`:

```js
import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

export const makeGetDocument = ({ documentRepo }) => {
  return async ({ documentId, userId }) => {
    const document = await documentRepo.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }
    return document;
  };
};
```

`list-documents.use-case.test.js`:

```js
import { makeListDocuments } from './list-documents.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';

describe('makeListDocuments', () => {
  it("returns only the requesting user's documents", async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', originalName: 'a.pdf', status: 'ready' },
      { id: 'doc-2', userId: 'user-2', originalName: 'b.pdf', status: 'ready' },
    ]);
    const listDocuments = makeListDocuments({ documentRepo });

    const docs = await listDocuments({ userId: 'user-1' });

    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('doc-1');
  });
});
```

`list-documents.use-case.js`:

```js
export const makeListDocuments = ({ documentRepo }) => {
  return async ({ userId }) => documentRepo.listByUser(userId);
};
```

Run both, confirm 2 + 1 = 3 tests pass:

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest get-document.use-case list-documents.use-case --no-coverage
```

- [ ] **Step 7: Write the failing test for search-documents**

```js
import { makeSearchDocuments } from './search-documents.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { makeFakePageRepository, makeFakeWordRepository } from '../../../../test/fakes/fake-page-word-repository.js';

const turkishNormalize = (s) => s.toLowerCase().replace('ı', 'i').replace('ş', 's');

describe('makeSearchDocuments', () => {
  it('finds matches across a user\'s documents and groups counts per document and page', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', originalName: 'a.pdf', status: 'ready' },
    ]);
    const pagesById = {
      'page-1': { id: 'page-1', documentId: 'doc-1', pageNo: 1 },
      'page-2': { id: 'page-2', documentId: 'doc-1', pageNo: 2 },
    };
    const documentsById = { 'doc-1': documentRepo._all[0] };
    const wordRepo = makeFakeWordRepository([
      { pageId: 'page-1', text: 'Istanbul', textNormalized: 'istanbul', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 },
      { pageId: 'page-1', text: 'istanbul', textNormalized: 'istanbul', x: 2, y: 2, w: 5, h: 5, wordIndex: 5 },
      { pageId: 'page-2', text: 'İstanbul', textNormalized: 'istanbul', x: 3, y: 3, w: 5, h: 5, wordIndex: 0 },
    ]);

    const searchDocuments = makeSearchDocuments({ documentRepo, wordRepo, normalize: turkishNormalize });

    const result = await searchDocuments({ userId: 'user-1', query: 'istanbul', documentIds: [], _testContext: { pagesById, documentsById } });

    expect(result.totalMatches).toBe(3);
    expect(result.perDocument).toEqual([{ documentId: 'doc-1', matchCount: 3 }]);
    expect(result.matches).toHaveLength(3);
    expect(result.matches.map((m) => m.pageNo).sort()).toEqual([1, 1, 2]);
  });

  it('returns zero matches for a query that does not appear', async () => {
    const documentRepo = makeFakeDocumentRepository([{ id: 'doc-1', userId: 'user-1', originalName: 'a.pdf', status: 'ready' }]);
    const wordRepo = makeFakeWordRepository([]);
    const searchDocuments = makeSearchDocuments({ documentRepo, wordRepo, normalize: turkishNormalize });

    const result = await searchDocuments({ userId: 'user-1', query: 'nonexistent', documentIds: [], _testContext: { pagesById: {}, documentsById: {} } });

    expect(result.totalMatches).toBe(0);
    expect(result.perDocument).toEqual([]);
    expect(result.matches).toEqual([]);
  });
});
```

- [ ] **Step 7b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest search-documents.use-case --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 8: Implement search-documents.use-case.js**

```js
export const makeSearchDocuments = ({ documentRepo, wordRepo, normalize }) => {
  return async ({ userId, query, documentIds = [], _testContext }) => {
    const normalizedQuery = normalize(query);

    const rawMatches = await wordRepo.searchByUser(userId, {
      normalizedQuery,
      documentIds,
      ...(_testContext ?? {}),
    });

    const perDocumentMap = new Map();
    for (const match of rawMatches) {
      perDocumentMap.set(match.documentId, (perDocumentMap.get(match.documentId) ?? 0) + 1);
    }

    return {
      totalMatches: rawMatches.length,
      perDocument: [...perDocumentMap.entries()].map(([documentId, matchCount]) => ({ documentId, matchCount })),
      matches: rawMatches.map((m) => ({
        documentId: m.documentId,
        pageNo: m.pageNo,
        text: m.text,
        x: m.x,
        y: m.y,
        w: m.w,
        h: m.h,
      })),
    };
  };
};
```

**Note on `_testContext`:** this parameter exists ONLY to let the fake repository perform its in-memory join during unit tests (see Task 4 Step 2's fake). The REAL Postgres repository (Task 8) does the join in SQL and ignores `_testContext` entirely — production code never passes it. This is called out explicitly so the next engineer doesn't mistake it for a real API parameter.

- [ ] **Step 9: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest search-documents.use-case --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 10: Run the entire core/service-document test suite**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest core/service-document --no-coverage
```

Expected: all pass (8 normalize + 4 upload + 2 get + 1 list + 2 search = 17 tests)

- [ ] **Step 11: Commit**

```bash
git add core/service-document/src/application core/service-document/test
git commit -m "feat(document-core): add upload/get/list/search use-cases"
```

---

## Task 5: HTTP error translation (core)

**Files:**
- Create: `core/service-document/src/interfaces/http/translate-domain-error.js`

- [ ] **Step 1: Add @pdf-reader/errors as a dependency**

Edit `core/service-document/package.json` to add:
```json
"dependencies": {
  "@pdf-reader/errors": "*"
}
```

Run `npm install` at repo root.

- [ ] **Step 2: Implement**

```js
import { NotFoundError, ValidationError } from '@pdf-reader/errors';
import { DocumentNotFoundError } from '../../domain/errors/document-not-found.error.js';
import { UnsupportedFileTypeError } from '../../domain/errors/unsupported-file-type.error.js';
import { DocumentNotReadyError } from '../../domain/errors/document-not-ready.error.js';

export const translateDomainError = (err) => {
  if (err instanceof DocumentNotFoundError) {
    return new NotFoundError(err.message);
  }
  if (err instanceof UnsupportedFileTypeError) {
    return new ValidationError(err.message);
  }
  if (err instanceof DocumentNotReadyError) {
    return new ValidationError(err.message);
  }
  return err;
};
```

- [ ] **Step 3: Commit**

```bash
git add core/service-document/package.json core/service-document/src/interfaces
git commit -m "feat(document-core): add domain-to-HTTP error translation"
```

---

## Task 6: pdfjs-dist extraction wrapper

**Files:**
- Create: `services/pdf-service-document/package.json`
- Create: `services/pdf-service-document/src/extraction/extract-pdf-text.js`
- Create: `services/pdf-service-document/src/extraction/extract-pdf-text.test.js`
- Create: `scripts/generate-test-pdfs.js`
- Create: `test/fixtures/sample-text.pdf` (generated)
- Create: `test/fixtures/sample-turkish.pdf` (generated)

- [ ] **Step 1: package.json for the service**

```json
{
  "name": "@pdf-reader/service-document",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js"
  },
  "dependencies": {
    "@pdf-reader/config": "*",
    "@pdf-reader/core-service-document": "*",
    "@pdf-reader/errors": "*",
    "@pdf-reader/helper": "*",
    "@pdf-reader/middlewares": "*",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "pdfjs-dist": "^4.7.76",
    "pg": "^8.12.0"
  }
}
```

Run `npm install` at repo root after creating this.

- [ ] **Step 2: Write a script to generate two tiny real test-fixture PDFs**

We need real, valid PDFs with actual text layers for extraction tests — not hand-crafted binary garbage. Use `pdf-lib` (add as a root devDependency, NOT a service dependency, since it's test-only) to generate them programmatically.

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npm install --save-dev pdf-lib
```

`scripts/generate-test-pdfs.js`:

```js
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
```

Note: `pdf-lib`'s standard fonts (WinAnsi encoding) do NOT support native Turkish characters (ş, ı, ğ, etc.) without embedding a custom font — so `sample-turkish.pdf` deliberately uses ASCII transliterations ("Istanbul", "sehir") as page CONTENT. The Turkish-normalization tests that need actual Turkish Unicode characters (İ, ş, ğ) test `normalize.js` directly with string literals (already done in Task 2) — this fixture is only for proving PDF text EXTRACTION works end-to-end, which is orthogonal to normalization correctness.

- [ ] **Step 3: Generate the fixtures**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node scripts/generate-test-pdfs.js
ls -la test/fixtures/
```

Expected: `sample-text.pdf` and `sample-turkish.pdf` both exist and are non-trivial in size (a few KB).

- [ ] **Step 4: Write the failing test for extract-pdf-text.js**

```js
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
```

- [ ] **Step 4b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-service-document/src/extraction --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 5: Implement extract-pdf-text.js**

```js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const groupTextItemsIntoWords = (textContent, pageHeight) => {
  const words = [];
  let wordIndex = 0;

  for (const item of textContent.items) {
    const rawPieces = item.str.split(/\s+/).filter((piece) => piece.length > 0);
    if (rawPieces.length === 0) continue;

    const [x, , , , e, f] = item.transform;
    const itemHeight = item.height || Math.abs(item.transform[3]) || 10;
    const itemWidth = item.width || item.str.length * (itemHeight * 0.5);

    // pdf.js gives one text item per run of text (often a whole line or phrase, not one item per word).
    // Split proportionally by character count across the item's bounding box to approximate per-word boxes.
    const totalChars = rawPieces.join('').length || 1;
    let cursorX = x;

    for (const piece of rawPieces) {
      const pieceWidth = (piece.length / totalChars) * itemWidth;
      words.push({
        text: piece,
        x: cursorX,
        y: pageHeight - f,
        w: pieceWidth,
        h: itemHeight,
        wordIndex: wordIndex++,
      });
      cursorX += pieceWidth;
    }
  }

  return words;
};

export const extractPdfText = async (fileBuffer) => {
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer) });
  const pdf = await loadingTask.promise;

  const pages = [];
  let anyWords = false;

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const words = groupTextItemsIntoWords(textContent, viewport.height);
    if (words.length > 0) anyWords = true;

    pages.push({ pageNo, width: viewport.width, height: viewport.height, words });
  }

  return { pageCount: pdf.numPages, hasTextLayer: anyWords, pages };
};
```

**Design note on coordinate approximation:** `pdfjs-dist`'s `getTextContent()` returns text in runs (`items`), not pre-split per word — a single item might be `"Hello World"` as one string. This implementation splits each item's text on whitespace and distributes the item's bounding box proportionally by character count to approximate each word's box. This is NOT pixel-perfect (variable-width fonts mean characters aren't equal width), but it's a reasonable approximation for a first version of word-level highlighting; a future refinement could use `item.chars`-level data (available in newer pdfjs versions with `includeMarkedContent`) for exact per-character positioning. This tradeoff is being made deliberately here rather than over-engineering coordinate precision before there's a UI to even show it.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-service-document/src/extraction --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add services/pdf-service-document/package.json services/pdf-service-document/src/extraction scripts/generate-test-pdfs.js test/fixtures package-lock.json
git commit -m "feat(document-service): add pdfjs-dist text/coordinate extraction"
```

---

## Task 7: Storage helper + upload middleware

**Files:**
- Create: `services/pdf-service-document/configs/app-config.js`
- Create: `services/pdf-service-document/src/interfaces/http/upload.middleware.js`

- [ ] **Step 1: app-config.js**

```js
import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('DOCUMENT_PORT', '3002')),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  storageDir: requireEnv('STORAGE_DIR', '/tmp/pdf-reader-storage'),
  maxUploadBytes: Number(requireEnv('MAX_UPLOAD_BYTES', String(50 * 1024 * 1024))),
});
```

- [ ] **Step 2: upload.middleware.js**

```js
import multer from 'multer';
import { mkdirSync } from 'node:fs';

export const makeUploadMiddleware = ({ storageDir, maxUploadBytes }) => {
  mkdirSync(storageDir, { recursive: true });

  const storage = multer.memoryStorage();

  return multer({
    storage,
    limits: { fileSize: maxUploadBytes },
    fileFilter: (req, file, cb) => {
      cb(null, file.mimetype === 'application/pdf');
    },
  }).single('file');
};
```

**Design note:** using `memoryStorage()` (buffer in RAM) rather than `diskStorage()` because the extraction step (`pdfjs-dist`) needs the buffer in memory anyway, and the use-case layer (Task 4) is responsible for deciding where the persisted copy goes — keeping multer's job narrowly "parse the multipart body into a buffer." For a 50MB max upload this is a reasonable memory tradeoff; a future phase could switch to disk streaming if very large files become common.

- [ ] **Step 3: Commit**

```bash
git add services/pdf-service-document/configs services/pdf-service-document/src/interfaces/http/upload.middleware.js
git commit -m "feat(document-service): add app config and multer upload middleware"
```

---

## Task 8: Postgres repositories

**Files:**
- Create: `services/pdf-service-document/src/infrastructure/persistence/db.js`
- Create: `services/pdf-service-document/src/infrastructure/persistence/document.repository.js`
- Create: `services/pdf-service-document/src/infrastructure/persistence/document-page.repository.js`
- Create: `services/pdf-service-document/src/infrastructure/persistence/page-word.repository.js`
- Create: `test/services/document/integration/config/db-setup.js`
- Create: `test/services/document/integration/document.repository.integration.test.js`
- Create: `test/services/document/integration/page-word.repository.integration.test.js`

- [ ] **Step 1: db.js (identical pattern to identity service)**

```js
import pg from 'pg';

const { Pool } = pg;

export const makePool = ({ connectionString }) => new Pool({ connectionString });
```

- [ ] **Step 2: document.repository.js**

```js
const rowToDocument = (row) => ({
  id: row.id,
  userId: row.user_id,
  originalName: row.original_name,
  mime: row.mime,
  sizeBytes: Number(row.size_bytes),
  pageCount: row.page_count,
  storagePath: row.storage_path,
  status: row.status,
  hasTextLayer: row.has_text_layer,
  errorMessage: row.error_message,
  createdAt: row.created_at,
});

export const makeDocumentRepository = ({ pool }) => ({
  async create({ userId, originalName, mime, sizeBytes, storagePath }) {
    const { rows } = await pool.query(
      `INSERT INTO documents (user_id, original_name, mime, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, originalName, mime, sizeBytes, storagePath],
    );
    return rowToDocument(rows[0]);
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  },

  async findByIdAndUser(id, userId) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  },

  async listByUser(userId) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return rows.map(rowToDocument);
  },

  async updateStatus(id, { status, pageCount, hasTextLayer, errorMessage }) {
    const { rows } = await pool.query(
      `UPDATE documents
       SET status = $2, page_count = COALESCE($3, page_count), has_text_layer = COALESCE($4, has_text_layer), error_message = $5
       WHERE id = $1
       RETURNING *`,
      [id, status, pageCount ?? null, hasTextLayer ?? null, errorMessage ?? null],
    );
    return rowToDocument(rows[0]);
  },
});
```

- [ ] **Step 3: document-page.repository.js**

```js
const rowToPage = (row) => ({
  id: row.id,
  documentId: row.document_id,
  pageNo: row.page_no,
  width: Number(row.width),
  height: Number(row.height),
});

export const makeDocumentPageRepository = ({ pool }) => ({
  async createMany(documentId, pages) {
    const created = [];
    for (const page of pages) {
      const { rows } = await pool.query(
        `INSERT INTO document_pages (document_id, page_no, width, height)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [documentId, page.pageNo, page.width, page.height],
      );
      created.push(rowToPage(rows[0]));
    }
    return created;
  },

  async listByDocument(documentId) {
    const { rows } = await pool.query('SELECT * FROM document_pages WHERE document_id = $1 ORDER BY page_no', [documentId]);
    return rows.map(rowToPage);
  },
});
```

- [ ] **Step 4: page-word.repository.js**

```js
const rowToWord = (row) => ({
  id: row.id,
  pageId: row.page_id,
  text: row.text,
  textNormalized: row.text_normalized,
  x: Number(row.x),
  y: Number(row.y),
  w: Number(row.w),
  h: Number(row.h),
  wordIndex: row.word_index,
});

export const makePageWordRepository = ({ pool }) => ({
  async createMany(pageId, words) {
    if (words.length === 0) return [];
    const values = [];
    const params = [];
    words.forEach((w, i) => {
      const base = i * 7;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
      params.push(pageId, w.text, w.textNormalized, w.x, w.y, w.w, w.h !== undefined ? w.h : null, w.wordIndex);
    });
    // NOTE: the params.push above has 8 values per row (pageId, text, textNormalized, x, y, w, h, wordIndex)
    // but the values placeholder template only has 7 slots — see Step 4b below, this is intentionally
    // left as a bug for the TDD integration test to catch, matching this plan's "write test, see it fail
    // meaningfully" philosophy applied to hand-written SQL too.
    const { rows } = await pool.query(
      `INSERT INTO page_words (page_id, text, text_normalized, x, y, w, h, word_index)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])
       RETURNING *`,
      [
        words.map(() => pageId),
        words.map((w) => w.text),
        words.map((w) => w.textNormalized),
        words.map((w) => w.x),
        words.map((w) => w.y),
        words.map((w) => w.w),
        words.map((w) => w.h),
        words.map((w) => w.wordIndex),
      ],
    );
    return rows.map(rowToWord);
  },

  async searchByUser(userId, { normalizedQuery, documentIds = [] }) {
    const params = [userId, normalizedQuery];
    let documentFilter = '';
    if (documentIds.length > 0) {
      params.push(documentIds);
      documentFilter = `AND d.id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT pw.text, pw.x, pw.y, pw.w, pw.h, dp.page_no, d.id AS document_id
       FROM page_words pw
       JOIN document_pages dp ON dp.id = pw.page_id
       JOIN documents d ON d.id = dp.document_id
       WHERE d.user_id = $1 AND pw.text_normalized = $2 ${documentFilter}
       ORDER BY d.id, dp.page_no, pw.word_index`,
      params,
    );

    return rows.map((row) => ({
      documentId: row.document_id,
      pageNo: row.page_no,
      text: row.text,
      x: Number(row.x),
      y: Number(row.y),
      w: Number(row.w),
      h: Number(row.h),
    }));
  },
});
```

**IMPORTANT — the `createMany` implementation above has a deliberately-included bug** (mismatched manual `values`/`params` building that's dead code, followed by a DIFFERENT, correct `UNNEST`-based query that ignores that dead code). This is confusing as written. Replace the ENTIRE `createMany` method with this clean, correct version instead — ignore the `values`/`params` loop and comment above, they should not appear in your actual file:

```js
export const makePageWordRepository = ({ pool }) => ({
  async createMany(pageId, words) {
    if (words.length === 0) return [];

    const { rows } = await pool.query(
      `INSERT INTO page_words (page_id, text, text_normalized, x, y, w, h, word_index)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])
       RETURNING *`,
      [
        words.map(() => pageId),
        words.map((w) => w.text),
        words.map((w) => w.textNormalized),
        words.map((w) => w.x),
        words.map((w) => w.y),
        words.map((w) => w.w),
        words.map((w) => w.h),
        words.map((w) => w.wordIndex),
      ],
    );
    return rows.map(rowToWord);
  },

  async searchByUser(userId, { normalizedQuery, documentIds = [] }) {
    const params = [userId, normalizedQuery];
    let documentFilter = '';
    if (documentIds.length > 0) {
      params.push(documentIds);
      documentFilter = `AND d.id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT pw.text, pw.x, pw.y, pw.w, pw.h, dp.page_no, d.id AS document_id
       FROM page_words pw
       JOIN document_pages dp ON dp.id = pw.page_id
       JOIN documents d ON d.id = dp.document_id
       WHERE d.user_id = $1 AND pw.text_normalized = $2 ${documentFilter}
       ORDER BY d.id, dp.page_no, pw.word_index`,
      params,
    );

    return rows.map((row) => ({
      documentId: row.document_id,
      pageNo: row.page_no,
      text: row.text,
      x: Number(row.x),
      y: Number(row.y),
      w: Number(row.w),
      h: Number(row.h),
    }));
  },
});
```

(This note exists because bulk-insert via `UNNEST` with typed array casts is easy to get subtly wrong; writing it twice above and explicitly disambiguating which version is correct reduces the chance of the wrong one landing in the file.)

- [ ] **Step 5: db-setup.js for tests**

```js
import pg from 'pg';

const { Pool } = pg;

export const makeTestPool = () =>
  new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader' });

export const truncateAll = async (pool) => {
  await pool.query('TRUNCATE page_words, document_pages, documents, sessions, users RESTART IDENTITY CASCADE');
};

export const seedUser = async (pool, { email = `doc-test-${Date.now()}@test.com`, name = 'Doc Test User' } = {}) => {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, locale) VALUES ($1, 'hash', $2, 'tr') RETURNING id`,
    [email, name],
  );
  return rows[0].id;
};
```

- [ ] **Step 6: document.repository.integration.test.js**

```js
import { makeDocumentRepository } from '../../../../services/pdf-service-document/src/infrastructure/persistence/document.repository.js';
import { makeTestPool, truncateAll, seedUser } from './config/db-setup.js';

describe('document.repository (integration)', () => {
  const pool = makeTestPool();
  const documentRepo = makeDocumentRepository({ pool });
  let userId;

  beforeEach(async () => {
    await truncateAll(pool);
    userId = await seedUser(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a document with status processing by default', async () => {
    const doc = await documentRepo.create({ userId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });

    expect(doc.status).toBe('processing');
    expect(doc.originalName).toBe('a.pdf');
  });

  it('updates status to ready with page count and text layer flag', async () => {
    const doc = await documentRepo.create({ userId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });

    const updated = await documentRepo.updateStatus(doc.id, { status: 'ready', pageCount: 3, hasTextLayer: true });

    expect(updated.status).toBe('ready');
    expect(updated.pageCount).toBe(3);
    expect(updated.hasTextLayer).toBe(true);
  });

  it('findByIdAndUser returns null for a document belonging to a different user', async () => {
    const doc = await documentRepo.create({ userId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });
    const otherUserId = await seedUser(pool, { email: `other-${Date.now()}@test.com` });

    const found = await documentRepo.findByIdAndUser(doc.id, otherUserId);

    expect(found).toBeNull();
  });

  it('listByUser returns documents ordered by newest first', async () => {
    const doc1 = await documentRepo.create({ userId, originalName: 'first.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/1.pdf' });
    await new Promise((r) => setTimeout(r, 10));
    const doc2 = await documentRepo.create({ userId, originalName: 'second.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/2.pdf' });

    const list = await documentRepo.listByUser(userId);

    expect(list.map((d) => d.id)).toEqual([doc2.id, doc1.id]);
  });
});
```

- [ ] **Step 7: page-word.repository.integration.test.js**

```js
import { makeDocumentRepository } from '../../../../services/pdf-service-document/src/infrastructure/persistence/document.repository.js';
import { makeDocumentPageRepository } from '../../../../services/pdf-service-document/src/infrastructure/persistence/document-page.repository.js';
import { makePageWordRepository } from '../../../../services/pdf-service-document/src/infrastructure/persistence/page-word.repository.js';
import { makeTestPool, truncateAll, seedUser } from './config/db-setup.js';

describe('page-word.repository (integration)', () => {
  const pool = makeTestPool();
  const documentRepo = makeDocumentRepository({ pool });
  const pageRepo = makeDocumentPageRepository({ pool });
  const wordRepo = makePageWordRepository({ pool });
  let userId;

  beforeEach(async () => {
    await truncateAll(pool);
    userId = await seedUser(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('bulk-creates words for a page and finds them via searchByUser', async () => {
    const doc = await documentRepo.create({ userId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });
    const [page] = await pageRepo.createMany(doc.id, [{ pageNo: 1, width: 612, height: 792 }]);

    await wordRepo.createMany(page.id, [
      { text: 'Hello', textNormalized: 'hello', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 },
      { text: 'World', textNormalized: 'world', x: 2, y: 2, w: 5, h: 5, wordIndex: 1 },
    ]);

    const results = await wordRepo.searchByUser(userId, { normalizedQuery: 'hello', documentIds: [] });

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('Hello');
    expect(results[0].pageNo).toBe(1);
    expect(results[0].documentId).toBe(doc.id);
  });

  it('searchByUser filters by documentIds when provided', async () => {
    const doc1 = await documentRepo.create({ userId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });
    const doc2 = await documentRepo.create({ userId, originalName: 'b.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/b.pdf' });
    const [page1] = await pageRepo.createMany(doc1.id, [{ pageNo: 1, width: 612, height: 792 }]);
    const [page2] = await pageRepo.createMany(doc2.id, [{ pageNo: 1, width: 612, height: 792 }]);

    await wordRepo.createMany(page1.id, [{ text: 'shared', textNormalized: 'shared', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }]);
    await wordRepo.createMany(page2.id, [{ text: 'shared', textNormalized: 'shared', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }]);

    const results = await wordRepo.searchByUser(userId, { normalizedQuery: 'shared', documentIds: [doc1.id] });

    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe(doc1.id);
  });

  it('searchByUser never returns another user\'s words', async () => {
    const otherUserId = await seedUser(pool, { email: `other-${Date.now()}@test.com` });
    const doc = await documentRepo.create({ userId: otherUserId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });
    const [page] = await pageRepo.createMany(doc.id, [{ pageNo: 1, width: 612, height: 792 }]);
    await wordRepo.createMany(page.id, [{ text: 'secret', textNormalized: 'secret', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }]);

    const results = await wordRepo.searchByUser(userId, { normalizedQuery: 'secret', documentIds: [] });

    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 8: Run both integration test files**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader node --experimental-vm-modules node_modules/.bin/jest test/services/document/integration/document.repository test/services/document/integration/page-word.repository --no-coverage
```

Expected: PASS (4 + 3 = 7 tests)

- [ ] **Step 9: Commit**

```bash
git add services/pdf-service-document/src/infrastructure test/services/document/integration
git commit -m "feat(document-service): add Postgres repositories for documents, pages, words"
```

---

## Task 9: HTTP layer, container, boot, main

**Files:**
- Create: `services/pdf-service-document/src/interfaces/http/document.controller.js`
- Create: `services/pdf-service-document/src/interfaces/http/routes.js`
- Create: `services/pdf-service-document/src/container.js`
- Create: `services/pdf-service-document/src/boot.js`
- Create: `services/pdf-service-document/main.js`
- Create: `services/pdf-service-document/ecosystem.config.js`
- Create: `test/services/document/integration/document.e2e.test.js`

- [ ] **Step 1: document.controller.js**

```js
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { translateDomainError } from '@pdf-reader/core-service-document/src/interfaces/http/translate-domain-error.js';

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
});

export const makeDocumentController = ({ uploadDocument, getDocument, listDocuments, searchDocuments, storageDir }) => ({
  upload: async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { message: 'No file uploaded, or file was not a PDF', details: null } });
        return;
      }

      const storagePath = join(storageDir, 'documents', `${randomUUID()}.pdf`);
      mkdirSync(join(storageDir, 'documents'), { recursive: true });
      writeFileSync(storagePath, req.file.buffer);

      const document = await uploadDocument({
        userId: req.user.sub,
        originalName: req.file.originalname,
        mime: req.file.mimetype,
        sizeBytes: req.file.size,
        storagePath,
        fileBuffer: req.file.buffer,
      });

      res.status(201).json({ document: toPublicDocument(document) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  get: async (req, res, next) => {
    try {
      const document = await getDocument({ documentId: req.params.id, userId: req.user.sub });
      res.status(200).json({ document: toPublicDocument(document) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  list: async (req, res, next) => {
    try {
      const documents = await listDocuments({ userId: req.user.sub });
      res.status(200).json({ documents: documents.map(toPublicDocument) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  search: async (req, res, next) => {
    try {
      const { query, documentIds } = req.body;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: { message: 'query is required', details: null } });
        return;
      }

      const result = await searchDocuments({
        userId: req.user.sub,
        query,
        documentIds: Array.isArray(documentIds) ? documentIds : [],
      });

      res.status(200).json(result);
    } catch (err) {
      next(translateDomainError(err));
    }
  },
});
```

Note: `req.user.sub` is the JWT payload's subject claim (user id), set by a `requireAuth`-equivalent middleware — see Step 3 below. This mirrors the gateway's `req.user` convention exactly (same JWT shape, same `sub` field, issued by the identity service).

- [ ] **Step 2: routes.js**

```js
import { Router } from 'express';

export const makeDocumentRoutes = ({ documentController, requireAuth, uploadMiddleware }) => {
  const router = Router();

  router.post('/', requireAuth, uploadMiddleware, documentController.upload);
  router.get('/', requireAuth, documentController.list);
  router.get('/:id', requireAuth, documentController.get);
  router.post('/search', requireAuth, documentController.search);

  return router;
};
```

- [ ] **Step 3: A local requireAuth middleware (this service verifies JWTs independently, same as the gateway does)**

Add this to `services/pdf-service-document/src/interfaces/http/require-auth.js`:

```js
import jwt from 'jsonwebtoken';

export const makeRequireAuth = ({ jwtAccessSecret }) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ error: { message: 'Not authenticated', details: null } });
    return;
  }

  try {
    req.user = jwt.verify(token, jwtAccessSecret);
    next();
  } catch {
    res.status(401).json({ error: { message: 'Not authenticated', details: null } });
  }
};
```

**Design note — why this service verifies its own JWTs instead of trusting a header from the gateway:** in phase 3, this service is directly reachable (not yet proxied through the gateway with its cookie-based session — that wiring happens in Task 10). It expects a standard `Authorization: Bearer <token>` header, matching how any non-browser API client (mobile app, `curl`, automated tests) would call it. This is the same `jsonwebtoken` verify pattern already used in the gateway's `require-auth.js`, just header-based instead of cookie-based, because this is a backend service, not a browser-facing boundary.

Add `jsonwebtoken` to `services/pdf-service-document/package.json` dependencies:
```json
"jsonwebtoken": "^9.0.2"
```
Run `npm install` at repo root.

- [ ] **Step 4: container.js**

```js
import { makeUploadDocument } from '@pdf-reader/core-service-document/src/application/use-cases/upload-document/upload-document.use-case.js';
import { makeGetDocument } from '@pdf-reader/core-service-document/src/application/use-cases/get-document/get-document.use-case.js';
import { makeListDocuments } from '@pdf-reader/core-service-document/src/application/use-cases/list-documents/list-documents.use-case.js';
import { makeSearchDocuments } from '@pdf-reader/core-service-document/src/application/use-cases/search-documents/search-documents.use-case.js';
import { normalize } from '@pdf-reader/core-service-document/src/domain/text/normalize.js';
import { makePool } from './infrastructure/persistence/db.js';
import { makeDocumentRepository } from './infrastructure/persistence/document.repository.js';
import { makeDocumentPageRepository } from './infrastructure/persistence/document-page.repository.js';
import { makePageWordRepository } from './infrastructure/persistence/page-word.repository.js';
import { extractPdfText } from './extraction/extract-pdf-text.js';
import { makeDocumentController } from './interfaces/http/document.controller.js';
import { makeRequireAuth } from './interfaces/http/require-auth.js';
import { makeUploadMiddleware } from './interfaces/http/upload.middleware.js';

export const buildContainer = (config) => {
  const pool = makePool({ connectionString: config.databaseUrl });
  const documentRepo = makeDocumentRepository({ pool });
  const pageRepo = makeDocumentPageRepository({ pool });
  const wordRepo = makePageWordRepository({ pool });
  const extractor = { extract: extractPdfText };

  const uploadDocument = makeUploadDocument({ documentRepo, pageRepo, wordRepo, extractor, normalize });
  const getDocument = makeGetDocument({ documentRepo });
  const listDocuments = makeListDocuments({ documentRepo });
  const searchDocuments = makeSearchDocuments({ documentRepo, wordRepo, normalize });

  const documentController = makeDocumentController({
    uploadDocument,
    getDocument,
    listDocuments,
    searchDocuments,
    storageDir: config.storageDir,
  });

  const requireAuth = makeRequireAuth({ jwtAccessSecret: config.jwtAccessSecret });
  const uploadMiddleware = makeUploadMiddleware({ storageDir: config.storageDir, maxUploadBytes: config.maxUploadBytes });

  return { pool, documentController, requireAuth, uploadMiddleware };
};
```

- [ ] **Step 5: boot.js**

```js
import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeDocumentRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  app.use(jsonBody());
  app.use(
    '/api/documents',
    makeDocumentRoutes({
      documentController: container.documentController,
      requireAuth: container.requireAuth,
      uploadMiddleware: container.uploadMiddleware,
    }),
  );
  app.use(notFound());
  app.use(handleErrors);

  return { app, pool: container.pool };
};
```

- [ ] **Step 6: main.js**

```js
import { loadEnv } from '@pdf-reader/config';
import { makeLogger } from '@pdf-reader/helper';
import { getAppConfig } from './configs/app-config.js';
import { boot } from './src/boot.js';

loadEnv();
const config = getAppConfig();
const logger = makeLogger({ serviceName: 'pdf-service-document' });
const { app } = boot(config);

app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});
```

- [ ] **Step 7: ecosystem.config.js**

```js
export default {
  apps: [
    {
      name: 'pdf-service-document',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
```

- [ ] **Step 8: e2e test**

```js
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../../../../services/pdf-service-document/src/boot.js';
import { truncateAll, seedUser, makeTestPool } from './config/db-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', 'fixtures');

const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-shared-secret';

const testConfig = {
  port: 0,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader',
  jwtAccessSecret: JWT_SECRET,
  storageDir: process.env.STORAGE_DIR ?? '/tmp/pdf-reader-storage-test',
  maxUploadBytes: 50 * 1024 * 1024,
};

describe('document HTTP API (e2e)', () => {
  const { app, pool } = boot(testConfig);
  let userId;
  let authHeader;

  beforeEach(async () => {
    await truncateAll(pool);
    userId = await seedUser(pool);
    const token = jwt.sign({ sub: userId, email: 'doc-e2e@test.com' }, JWT_SECRET, { expiresIn: '15m' });
    authHeader = `Bearer ${token}`;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejects upload without authentication', async () => {
    const res = await request(app)
      .post('/api/documents')
      .attach('file', join(fixturesDir, 'sample-text.pdf'));

    expect(res.status).toBe(401);
  });

  it('uploads a PDF, extracts text, and returns a ready document', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', authHeader)
      .attach('file', join(fixturesDir, 'sample-text.pdf'));

    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe('ready');
    expect(res.body.document.pageCount).toBe(1);
    expect(res.body.document.hasTextLayer).toBe(true);
  });

  it('lists only the uploading user\'s documents', async () => {
    await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));

    const res = await request(app).get('/api/documents').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });

  it('gets a single document by id', async () => {
    const uploadRes = await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));
    const documentId = uploadRes.body.document.id;

    const res = await request(app).get(`/api/documents/${documentId}`).set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.document.id).toBe(documentId);
  });

  it('returns 404 for a document belonging to another user', async () => {
    const uploadRes = await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));
    const documentId = uploadRes.body.document.id;

    const otherUserId = await seedUser(makeTestPool(), { email: `other-doc-${Date.now()}@test.com` });
    const otherToken = jwt.sign({ sub: otherUserId, email: 'other@test.com' }, JWT_SECRET, { expiresIn: '15m' });

    const res = await request(app).get(`/api/documents/${documentId}`).set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it('searches for a word that appears in an uploaded document and returns coordinates', async () => {
    await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));

    const res = await request(app)
      .post('/api/documents/search')
      .set('Authorization', authHeader)
      .send({ query: 'Hello' });

    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBeGreaterThanOrEqual(1);
    expect(res.body.matches[0]).toEqual(
      expect.objectContaining({ text: expect.any(String), x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it('search is case-insensitive', async () => {
    await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));

    const res = await request(app).post('/api/documents/search').set('Authorization', authHeader).send({ query: 'HELLO' });

    expect(res.body.totalMatches).toBeGreaterThanOrEqual(1);
  });

  it('returns zero matches for a word not present', async () => {
    await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));

    const res = await request(app).post('/api/documents/search').set('Authorization', authHeader).send({ query: 'xyzxyzxyz' });

    expect(res.body.totalMatches).toBe(0);
  });

  it('rejects a search with no query', async () => {
    const res = await request(app).post('/api/documents/search').set('Authorization', authHeader).send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 9: Run the e2e suite**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
JWT_ACCESS_SECRET=test-shared-secret \
node --experimental-vm-modules node_modules/.bin/jest test/services/document/integration/document.e2e --no-coverage
```

Expected: PASS (9 tests).

- [ ] **Step 10: Manual smoke test**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader

# Get a real access token by logging in through the already-running identity service
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"doc-smoke@test.com","password":"abcd1234","name":"Doc Smoke"}' > /dev/null
curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"doc-smoke@test.com","password":"abcd1234"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")

(cd services/pdf-service-document && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret DOCUMENT_PORT=3002 STORAGE_DIR=/tmp/pdf-reader-storage node main.js &)
sleep 1.5

curl -s -X POST http://localhost:3002/api/documents -H "Authorization: Bearer $TOKEN" -F "file=@test/fixtures/sample-text.pdf"
echo ""
curl -s -X POST http://localhost:3002/api/documents/search -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"query":"World"}'
echo ""

pkill -f "services/pdf-service-document/main.js" 2>/dev/null || true
```

Expected: upload returns 201 with `status: "ready"`, search returns `totalMatches >= 1` with a `matches` array containing coordinate data.

- [ ] **Step 11: Commit**

```bash
git add services/pdf-service-document/src services/pdf-service-document/main.js services/pdf-service-document/ecosystem.config.js test/services/document/integration/document.e2e.test.js package-lock.json
git commit -m "feat(document-service): add HTTP layer, container, boot, main — full upload/search flow"
```

---

## Task 10: Wire into the gateway's route table

**Files:**
- Modify: `services/pdf-web-gateway/src/route-table.js`
- Modify: `services/pdf-web-gateway/configs/app-config.js`
- Modify: `.env.example`

- [ ] **Step 1: Add documentServiceUrl to gateway config**

Edit `services/pdf-web-gateway/configs/app-config.js`, add one line inside the returned object:

```js
documentServiceUrl: requireEnv('DOCUMENT_SERVICE_URL', 'http://localhost:3002'),
```

- [ ] **Step 2: Add the route table entry**

Edit `services/pdf-web-gateway/src/route-table.js` to:

```js
export const buildRouteTable = (config) => [
  { prefix: '/api/documents', target: config.documentServiceUrl },
];
```

(This removes the `_config` param rename from the earlier phase — `config` is genuinely used now. Also remove the two `// Future:` comment lines since one of them is no longer future, it's now real.)

- [ ] **Step 3: Add to .env.example**

```
DOCUMENT_PORT=3002
DOCUMENT_SERVICE_URL=http://localhost:3002
STORAGE_DIR=/tmp/pdf-reader-storage
MAX_UPLOAD_BYTES=52428800
```

- [ ] **Step 4: Verify gateway proxying works end-to-end**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader

# ensure identity (3001) and document (3002) services are running with matching secrets
pkill -f "services/pdf-service-identity/main.js" 2>/dev/null || true
pkill -f "services/pdf-service-document/main.js" 2>/dev/null || true
sleep 1
(cd services/pdf-service-identity && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret JWT_REFRESH_SECRET=test-refresh-secret IDENTITY_PORT=3001 node main.js &)
(cd services/pdf-service-document && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret DOCUMENT_PORT=3002 STORAGE_DIR=/tmp/pdf-reader-storage node main.js &)
sleep 1.5
(cd services/pdf-web-gateway && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader IDENTITY_SERVICE_URL=http://localhost:3001 DOCUMENT_SERVICE_URL=http://localhost:3002 JWT_ACCESS_SECRET=test-shared-secret GATEWAY_PORT=3000 node main.js &)
sleep 1.5

COOKIES=$(mktemp)
curl -s -c "$COOKIES" http://localhost:3000/api/gateway/me > /dev/null
XSRF=$(grep XSRF-TOKEN "$COOKIES" | awk '{print $NF}')

curl -s -b "$COOKIES" -c "$COOKIES" -X POST http://localhost:3000/api/gateway/register \
  -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"email":"gw-doc-smoke@test.com","password":"abcd1234","name":"GW Doc Smoke"}'
echo ""
curl -s -b "$COOKIES" -c "$COOKIES" -X POST http://localhost:3000/api/gateway/login \
  -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"email":"gw-doc-smoke@test.com","password":"abcd1234"}'
echo ""

# now hit the document service THROUGH the gateway, using the access_token cookie set by login
curl -s -b "$COOKIES" -X POST http://localhost:3000/api/documents -F "file=@test/fixtures/sample-text.pdf"
echo ""

kill %1 %2 %3 2>/dev/null
rm -f "$COOKIES"
```

**Important note for whoever runs this:** the gateway's `require-auth.js` reads the `access_token` COOKIE and passes it through to the proxy as-is (via `http-proxy-middleware`'s default cookie forwarding) — but the document service's `require-auth.js` expects an `Authorization: Bearer` HEADER, not a cookie. **This mismatch means the proxied upload call above will get a 401 from the document service even though the gateway's own `requireAuth` passed.** This is a real integration gap between this phase and the gateway phase — document it as a known issue rather than silently working around it with a hack. Do NOT attempt to fix this by making document-service accept cookies (that couples it to browser-specific concerns it shouldn't have) or by having the gateway blindly trust its own auth (security regression). The correct fix is for the gateway's proxy layer to translate the verified cookie into an `Authorization` header when forwarding — that is explicitly OUT OF SCOPE for this task and is captured as a TODO for Task 11.

- [ ] **Step 5: Commit the route table changes regardless of the header/cookie gap (that's Task 11's job to close)**

```bash
git add services/pdf-web-gateway/src/route-table.js services/pdf-web-gateway/configs/app-config.js .env.example
git commit -m "feat(gateway): wire document service into route table"
```

---

## Task 11: Fix gateway proxy to forward Authorization header

**Files:**
- Modify: `services/pdf-web-gateway/src/interfaces/http/proxy-routes.js`

- [ ] **Step 1: Update proxy-routes.js to inject the Authorization header from the verified cookie**

```js
import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export const makeProxyRoutes = ({ routeTable, requireAuth, readAuthCookies }) => {
  const router = Router();

  for (const { prefix, target } of routeTable) {
    router.use(
      prefix,
      requireAuth,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        on: {
          proxyReq: (proxyReq, req) => {
            const { accessToken } = readAuthCookies(req);
            if (accessToken) {
              proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
            }
          },
        },
      }),
    );
  }

  return router;
};
```

- [ ] **Step 2: Update boot.js to pass readAuthCookies into makeProxyRoutes**

Edit `services/pdf-web-gateway/src/boot.js`: add the import `import { readAuthCookies } from './auth/cookies.js';` (note `setAuthCookies`/`clearAuthCookies` are likely already imported elsewhere — check, don't duplicate the import line, just add `readAuthCookies` to the existing import from `./auth/cookies.js` if boot.js already imports from that path, otherwise add a new import line), and update the `makeProxyRoutes` call:

```js
app.use(makeProxyRoutes({ routeTable, requireAuth, readAuthCookies }));
```

- [ ] **Step 3: Re-run the gateway e2e suite to confirm nothing broke**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
IDENTITY_SERVICE_URL=http://localhost:3001 \
JWT_ACCESS_SECRET=test-shared-secret \
node --experimental-vm-modules node_modules/.bin/jest test/services/gateway/integration/gateway.e2e --no-coverage
```

Expected: still 5/5 pass (this task doesn't change gateway auth endpoints, only the proxy layer).

- [ ] **Step 4: Re-run the full manual smoke test from Task 10 Step 4**

Run the exact same curl sequence from Task 10 Step 4. This time the final `curl -X POST http://localhost:3000/api/documents` call should succeed (201, not 401) because the gateway now forwards the verified identity as a Bearer header to the document service.

- [ ] **Step 5: Write an e2e test in the gateway's test suite proving the proxy forwards auth correctly**

Add to `test/services/gateway/integration/gateway.e2e.test.js` (append as a new `it` block, requires the document service to be running — add a `describe.skip` fallback note if it's not, but for this task assume it IS running per Task 10's setup):

```js
  it('proxies an authenticated request to the document service with a translated Authorization header', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const csrfProbe = await agent.get('/api/gateway/me');
    const xsrfToken = csrfProbe.headers['set-cookie']
      .find((c) => c.startsWith('XSRF-TOKEN='))
      .split('XSRF-TOKEN=')[1]
      .split(';')[0];

    await agent.post('/api/gateway/register').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234', name: 'Ada' });
    await agent.post('/api/gateway/login').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234' });

    const res = await agent.get('/api/documents');

    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });
```

This requires `DOCUMENT_SERVICE_URL` to be set correctly in the test environment and the document service to actually be running — run it with:

```bash
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
IDENTITY_SERVICE_URL=http://localhost:3001 \
DOCUMENT_SERVICE_URL=http://localhost:3002 \
JWT_ACCESS_SECRET=test-shared-secret \
node --experimental-vm-modules node_modules/.bin/jest test/services/gateway/integration/gateway.e2e --no-coverage
```

Expected: 6/6 pass (5 original + 1 new).

- [ ] **Step 6: Commit**

```bash
git add services/pdf-web-gateway/src/interfaces/http/proxy-routes.js services/pdf-web-gateway/src/boot.js test/services/gateway/integration/gateway.e2e.test.js
git commit -m "fix(gateway): forward verified identity as Authorization header when proxying"
```

---

## Verification (end of phase 3)

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader

# 1. Lint clean
npm run lint

# 2. Unit tests
node --experimental-vm-modules node_modules/.bin/jest --selectProjects unit --no-coverage

# 3. Integration tests — start all 3 services with matching secrets, then run everything
docker compose -f docker-compose.dev.yml up -d
pkill -f "services/pdf-service-identity/main.js" 2>/dev/null || true
pkill -f "services/pdf-service-document/main.js" 2>/dev/null || true
sleep 1
(cd services/pdf-service-identity && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret JWT_REFRESH_SECRET=test-refresh-secret IDENTITY_PORT=3001 node main.js &)
(cd services/pdf-service-document && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret DOCUMENT_PORT=3002 STORAGE_DIR=/tmp/pdf-reader-storage node main.js &)
sleep 1.5

DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
IDENTITY_SERVICE_URL=http://localhost:3001 \
DOCUMENT_SERVICE_URL=http://localhost:3002 \
JWT_ACCESS_SECRET=test-shared-secret \
node --experimental-vm-modules node_modules/.bin/jest --selectProjects integration --no-coverage
```

Expected: lint clean, all unit tests pass, all integration tests pass (identity + gateway + document, including the new proxy-forwarding test).

**Manual acceptance check:** run Task 10 Step 4's full curl sequence (register → login → upload through gateway) and confirm the upload succeeds with 201 and `status: "ready"`.

**Not covered by this phase (deferred):** OCR for scanned PDFs, `conversion` service, page rendering/thumbnails, PDF→image/text export, frontend, `.wolf/` layer, `docker-compose.e2e.yml`.
