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

  it('creates the page if it does not already exist', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', status: 'ready', hasTextLayer: false },
    ]);
    const pageRepo = makeFakePageRepository();
    const wordRepo = makeFakeWordRepository();

    const ingestOcrWords = makeIngestOcrWords({ documentRepo, pageRepo, wordRepo, normalize: (s) => s.toLowerCase() });

    await ingestOcrWords({
      documentId: 'doc-1',
      userId: 'user-1',
      pageNo: 3,
      words: [{ text: 'World', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }],
    });

    expect(pageRepo._all).toHaveLength(1);
    expect(pageRepo._all[0].pageNo).toBe(3);
  });

  it('throws DocumentNotFoundError for a document the user does not own', async () => {
    const documentRepo = makeFakeDocumentRepository([{ id: 'doc-1', userId: 'other-user', status: 'ready' }]);
    const ingestOcrWords = makeIngestOcrWords({
      documentRepo,
      pageRepo: makeFakePageRepository(),
      wordRepo: makeFakeWordRepository(),
      normalize: (s) => s.toLowerCase(),
    });

    await expect(ingestOcrWords({ documentId: 'doc-1', userId: 'user-1', pageNo: 1, words: [] })).rejects.toThrow(
      DocumentNotFoundError,
    );
  });
});
