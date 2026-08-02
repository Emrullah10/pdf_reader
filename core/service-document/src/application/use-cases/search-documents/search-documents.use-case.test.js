import { makeSearchDocuments } from './search-documents.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { makeFakeWordRepository } from '../../../../test/fakes/fake-page-word-repository.js';

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

    const searchDocuments = makeSearchDocuments({ wordRepo, normalize: turkishNormalize });

    const result = await searchDocuments({ userId: 'user-1', query: 'istanbul', documentIds: [], _testContext: { pagesById, documentsById } });

    expect(result.totalMatches).toBe(3);
    expect(result.perDocument).toEqual([{ documentId: 'doc-1', matchCount: 3 }]);
    expect(result.matches).toHaveLength(3);
    expect(result.matches.map((m) => m.pageNo).sort()).toEqual([1, 1, 2]);
  });

  it('returns zero matches for a query that does not appear', async () => {
    const wordRepo = makeFakeWordRepository([]);
    const searchDocuments = makeSearchDocuments({ wordRepo, normalize: turkishNormalize });

    const result = await searchDocuments({ userId: 'user-1', query: 'nonexistent', documentIds: [], _testContext: { pagesById: {}, documentsById: {} } });

    expect(result.totalMatches).toBe(0);
    expect(result.perDocument).toEqual([]);
    expect(result.matches).toEqual([]);
  });
});
