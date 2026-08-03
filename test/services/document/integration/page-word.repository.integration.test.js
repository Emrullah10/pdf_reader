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

    await wordRepo.createMany([page.id, page.id], [
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

    await wordRepo.createMany([page1.id], [{ text: 'shared', textNormalized: 'shared', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }]);
    await wordRepo.createMany([page2.id], [{ text: 'shared', textNormalized: 'shared', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }]);

    const results = await wordRepo.searchByUser(userId, { normalizedQuery: 'shared', documentIds: [doc1.id] });

    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe(doc1.id);
  });

  it('searchByUser never returns another user\'s words', async () => {
    const otherUserId = await seedUser(pool, { email: `other-${Date.now()}@test.com` });
    const doc = await documentRepo.create({ userId: otherUserId, originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 100, storagePath: '/tmp/a.pdf' });
    const [page] = await pageRepo.createMany(doc.id, [{ pageNo: 1, width: 612, height: 792 }]);
    await wordRepo.createMany([page.id], [{ text: 'secret', textNormalized: 'secret', x: 1, y: 1, w: 5, h: 5, wordIndex: 0 }]);

    const results = await wordRepo.searchByUser(userId, { normalizedQuery: 'secret', documentIds: [] });

    expect(results).toHaveLength(0);
  });
});
