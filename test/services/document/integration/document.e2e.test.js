import request from 'supertest';
import jwt from 'jsonwebtoken';
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
