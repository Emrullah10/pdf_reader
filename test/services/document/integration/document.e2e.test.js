import request from 'supertest';
import jwt from 'jsonwebtoken';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../../../../services/pdf-service-document/src/boot.js';
import { runWorker } from '../../../../services/pdf-service-document/src/worker/run-worker.js';
import { truncateAll, seedUser } from './config/db-setup.js';

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
  let workerStopped = false;
  const workerDone = runWorker(testConfig, {
    shouldStop: () => workerStopped,
    pollIntervalMs: 50,
    closePoolOnExit: false,
  });

  // Extraction now runs after the upload response is sent, so anything that depends on its
  // output (page count, search hits) has to wait for the status to leave 'processing' first.
  const waitForStatus = async (documentId, targetStatus, { timeoutMs = 5000 } = {}) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await request(app).get(`/api/documents/${documentId}`).set('Authorization', authHeader);
      if (res.body.document.status === targetStatus) return res.body.document;
      if (res.body.document.status === 'failed' && targetStatus !== 'failed') {
        throw new Error(`Document failed while waiting for '${targetStatus}': ${res.body.document.errorMessage}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Timed out waiting for document ${documentId} to reach status '${targetStatus}'`);
  };

  const uploadAndWait = async (fixtureName) => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', authHeader)
      .attach('file', join(fixturesDir, fixtureName));

    return waitForStatus(res.body.document.id, 'ready');
  };

  beforeEach(async () => {
    await truncateAll(pool);
    userId = await seedUser(pool);
    const token = jwt.sign({ sub: userId, email: 'doc-e2e@test.com' }, JWT_SECRET, { expiresIn: '15m' });
    authHeader = `Bearer ${token}`;
  });

  afterAll(async () => {
    workerStopped = true;
    await workerDone;
    await pool.end();
  });

  it('rejects upload without authentication', async () => {
    const res = await request(app)
      .post('/api/documents')
      .attach('file', join(fixturesDir, 'sample-text.pdf'));

    expect(res.status).toBe(401);
  });

  it('uploads a PDF and returns immediately, then extracts text in the background', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', authHeader)
      .attach('file', join(fixturesDir, 'sample-text.pdf'));

    expect(res.status).toBe(201);
    // The response must not wait on extraction — that is what keeps a large PDF from timing out.
    expect(res.body.document.status).toBe('processing');

    const document = await waitForStatus(res.body.document.id, 'ready');
    expect(document.pageCount).toBe(1);
    expect(document.hasTextLayer).toBe(true);
  });

  it('lists only the uploading user\'s documents', async () => {
    const uploadRes = await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));

    const res = await request(app).get('/api/documents').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);

    // Drain background extraction before the next beforeEach TRUNCATEs (see 'gets a single document').
    await waitForStatus(uploadRes.body.document.id, 'ready');
  });

  it('gets a single document by id', async () => {
    const uploadRes = await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));
    const documentId = uploadRes.body.document.id;

    const res = await request(app).get(`/api/documents/${documentId}`).set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.document.id).toBe(documentId);

    // Background extraction is still writing in its own transaction at this point; letting it run
    // past the test would race the next test's beforeEach TRUNCATE and deadlock against it.
    await waitForStatus(documentId, 'ready');
  });

  it('returns 404 for a document belonging to another user', async () => {
    const uploadRes = await request(app).post('/api/documents').set('Authorization', authHeader).attach('file', join(fixturesDir, 'sample-text.pdf'));
    const documentId = uploadRes.body.document.id;

    const otherUserId = await seedUser(pool, { email: `other-doc-${Date.now()}@test.com` });
    const otherToken = jwt.sign({ sub: otherUserId, email: 'other@test.com' }, JWT_SECRET, { expiresIn: '15m' });

    const res = await request(app).get(`/api/documents/${documentId}`).set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);

    // Same reasoning as above: drain background extraction before the next beforeEach TRUNCATEs.
    await waitForStatus(documentId, 'ready');
  });

  it('searches for a word that appears in an uploaded document and returns coordinates', async () => {
    await uploadAndWait('sample-text.pdf');

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
    await uploadAndWait('sample-text.pdf');

    const res = await request(app).post('/api/documents/search').set('Authorization', authHeader).send({ query: 'HELLO' });

    expect(res.body.totalMatches).toBeGreaterThanOrEqual(1);
  });

  it('returns zero matches for a word not present', async () => {
    await uploadAndWait('sample-text.pdf');

    const res = await request(app).post('/api/documents/search').set('Authorization', authHeader).send({ query: 'xyzxyzxyz' });

    expect(res.body.totalMatches).toBe(0);
  });

  it('rejects a search with no query', async () => {
    const res = await request(app).post('/api/documents/search').set('Authorization', authHeader).send({});
    expect(res.status).toBe(400);
  });
});
