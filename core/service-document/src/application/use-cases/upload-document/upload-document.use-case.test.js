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
