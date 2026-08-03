import { makeUploadDocument, makeProcessDocument } from './upload-document.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { makeFakePageRepository, makeFakeWordRepository } from '../../../../test/fakes/fake-page-word-repository.js';
import { UnsupportedFileTypeError } from '../../../domain/errors/unsupported-file-type.error.js';

const makeExtractor = ({ pages = [{ pageNo: 1, width: 612, height: 792, words: [] }], hasTextLayer = true } = {}) => ({
  extractByPage: async (storagePath, onPage) => {
    for (const page of pages) await onPage(page);
    return { pageCount: pages.length, hasTextLayer };
  },
});

const buildProcessDocument = ({ documentRepo, extractor, pageRepo, wordRepo }) =>
  makeProcessDocument({
    documentRepo,
    pageRepo: pageRepo ?? makeFakePageRepository(),
    wordRepo: wordRepo ?? makeFakeWordRepository(),
    extractor,
    normalize: (s) => s.toLowerCase(),
    runInTransaction: (run) => run(null),
  });

describe('makeUploadDocument', () => {
  it('creates the document and leaves extraction to the returned startProcessing', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const pageRepo = makeFakePageRepository();
    const processDocument = buildProcessDocument({ documentRepo, extractor: makeExtractor(), pageRepo });

    const uploadDocument = makeUploadDocument({ documentRepo, processDocument });

    const { document, startProcessing } = await uploadDocument({
      userId: 'user-1',
      originalName: 'test.pdf',
      mime: 'application/pdf',
      sizeBytes: 1234,
      storagePath: '/tmp/test.pdf',
    });

    // The upload itself must not have parsed anything yet — that is what keeps the request fast.
    expect(document.id).toBeDefined();
    expect(pageRepo._all).toHaveLength(0);
    expect(typeof startProcessing).toBe('function');
  });

  it('rejects a non-PDF mime type', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const uploadDocument = makeUploadDocument({
      documentRepo,
      processDocument: buildProcessDocument({ documentRepo, extractor: makeExtractor() }),
    });

    await expect(
      uploadDocument({
        userId: 'user-1',
        originalName: 'test.exe',
        mime: 'application/x-msdownload',
        sizeBytes: 100,
        storagePath: '/tmp/test.exe',
      }),
    ).rejects.toThrow(UnsupportedFileTypeError);
  });
});

describe('makeProcessDocument', () => {
  it('extracts pages/words and marks the document ready', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const pageRepo = makeFakePageRepository();
    const wordRepo = makeFakeWordRepository();
    const extractor = makeExtractor({
      pages: [
        { pageNo: 1, width: 612, height: 792, words: [{ text: 'Hello', x: 0, y: 0, w: 10, h: 10, wordIndex: 0 }] },
      ],
    });

    const uploadDocument = makeUploadDocument({
      documentRepo,
      processDocument: buildProcessDocument({ documentRepo, extractor, pageRepo, wordRepo }),
    });

    const { startProcessing } = await uploadDocument({
      userId: 'user-1',
      originalName: 'test.pdf',
      mime: 'application/pdf',
      sizeBytes: 1234,
      storagePath: '/tmp/test.pdf',
    });

    const result = await startProcessing();

    expect(result.status).toBe('ready');
    expect(result.pageCount).toBe(1);
    expect(pageRepo._all).toHaveLength(1);
    expect(wordRepo._all).toHaveLength(1);
    expect(wordRepo._all[0].textNormalized).toBe('hello');
  });

  it('marks the document failed if extraction throws, without throwing itself', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const extractor = { extractByPage: async () => { throw new Error('corrupt pdf'); } };

    const uploadDocument = makeUploadDocument({
      documentRepo,
      processDocument: buildProcessDocument({ documentRepo, extractor }),
    });

    const { startProcessing } = await uploadDocument({
      userId: 'user-1',
      originalName: 'broken.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      storagePath: '/tmp/broken.pdf',
    });

    const result = await startProcessing();

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('corrupt pdf');
  });

  it('sets hasTextLayer to false when extraction finds no words on any page', async () => {
    const documentRepo = makeFakeDocumentRepository();
    const extractor = makeExtractor({ pages: [{ pageNo: 1, width: 612, height: 792, words: [] }], hasTextLayer: false });

    const uploadDocument = makeUploadDocument({
      documentRepo,
      processDocument: buildProcessDocument({ documentRepo, extractor }),
    });

    const { startProcessing } = await uploadDocument({
      userId: 'user-1',
      originalName: 'scanned.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      storagePath: '/tmp/scanned.pdf',
    });

    const result = await startProcessing();

    expect(result.hasTextLayer).toBe(false);
  });
});
