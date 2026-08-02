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
