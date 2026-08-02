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
