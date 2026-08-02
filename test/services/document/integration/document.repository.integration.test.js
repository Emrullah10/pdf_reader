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
