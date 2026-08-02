import request from 'supertest';
import { boot } from '../../../../services/pdf-service-identity/src/boot.js';
import { truncateAll } from './config/db-setup.js';

const testConfig = {
  port: 0,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader',
  jwtAccessSecret: 'test-secret',
  jwtAccessTtl: '15m',
  refreshTtlMs: 1000 * 60 * 60 * 24 * 30,
};

describe('auth HTTP API (e2e)', () => {
  const { app, pool } = boot(testConfig);

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registers a user', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('a@b.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects registration with an invalid email with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'abcd1234', name: 'Ada' });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate registration with 409', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada2' });

    expect(res.status).toBe(409);
  });

  it('logs in and returns access + refresh tokens', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'abcd1234' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects login with wrong password with 401', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrong1234' });

    expect(res.status).toBe(401);
  });

  it('refreshes an access token using a valid refresh token', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'abcd1234' });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: loginRes.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects refresh with an unknown token with 404', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });

    expect(res.status).toBe(404);
  });

  it('logs out and then rejects reuse of the same refresh token', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'abcd1234' });

    const logoutRes = await request(app).post('/api/auth/logout').send({ refreshToken: loginRes.body.refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: loginRes.body.refreshToken });
    expect(refreshRes.status).toBe(404);
  });
});
