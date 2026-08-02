import { makeDeleteDocument } from './delete-document.use-case.js';
import { makeFakeDocumentRepository } from '../../../../test/fakes/fake-document-repository.js';
import { DocumentNotFoundError } from '../../../domain/errors/document-not-found.error.js';

const makeFakeFileStore = ({ shouldThrow = false } = {}) => {
  const removed = [];
  return {
    removed,
    remove: async (path) => {
      if (shouldThrow) throw new Error('disk error');
      removed.push(path);
    },
  };
};

describe('makeDeleteDocument', () => {
  it('deletes the document row and removes the stored file', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', originalName: 'a.pdf', status: 'ready', storagePath: '/tmp/a.pdf' },
    ]);
    const fileStore = makeFakeFileStore();

    const deleteDocument = makeDeleteDocument({ documentRepo, fileStore });
    await deleteDocument({ documentId: 'doc-1', userId: 'user-1' });

    expect(documentRepo._all).toHaveLength(0);
    expect(fileStore.removed).toEqual(['/tmp/a.pdf']);
  });

  it('throws DocumentNotFoundError for a document the user does not own', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'other-user', originalName: 'a.pdf', status: 'ready', storagePath: '/tmp/a.pdf' },
    ]);
    const deleteDocument = makeDeleteDocument({ documentRepo, fileStore: makeFakeFileStore() });

    await expect(deleteDocument({ documentId: 'doc-1', userId: 'user-1' })).rejects.toThrow(DocumentNotFoundError);
  });

  it('does not throw if removing the file from disk fails', async () => {
    const documentRepo = makeFakeDocumentRepository([
      { id: 'doc-1', userId: 'user-1', originalName: 'a.pdf', status: 'ready', storagePath: '/tmp/a.pdf' },
    ]);
    const fileStore = makeFakeFileStore({ shouldThrow: true });

    const deleteDocument = makeDeleteDocument({ documentRepo, fileStore });

    await expect(deleteDocument({ documentId: 'doc-1', userId: 'user-1' })).resolves.toBeUndefined();
  });
});
