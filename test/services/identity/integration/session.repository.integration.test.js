import { makeUserRepository } from '../../../../services/pdf-service-identity/src/infrastructure/persistence/user.repository.js';
import { makeSessionRepository } from '../../../../services/pdf-service-identity/src/infrastructure/persistence/session.repository.js';
import { makeTestPool, truncateAll } from './config/db-setup.js';

describe('session.repository (integration)', () => {
  const pool = makeTestPool();
  const userRepo = makeUserRepository({ pool });
  const sessionRepo = makeSessionRepository({ pool });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a session and finds it by refresh token hash', async () => {
    const user = await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await sessionRepo.create({ userId: user.id, refreshTokenHash: 'hash-1', userAgent: 'jest', ip: '127.0.0.1', expiresAt });
    const found = await sessionRepo.findByRefreshTokenHash('hash-1');

    expect(found.userId).toBe(user.id);
    expect(found.revokedAt).toBeNull();
  });

  it('revokes a session', async () => {
    const user = await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    const session = await sessionRepo.create({ userId: user.id, refreshTokenHash: 'hash-1', expiresAt });

    await sessionRepo.revoke(session.id);
    const found = await sessionRepo.findByRefreshTokenHash('hash-1');

    expect(found.revokedAt).not.toBeNull();
  });
});
