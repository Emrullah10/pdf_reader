import { makeUserRepository } from '../../../../services/pdf-service-identity/src/infrastructure/persistence/user.repository.js';
import { makeTestPool, truncateAll } from './config/db-setup.js';

describe('user.repository (integration)', () => {
  const pool = makeTestPool();
  const userRepo = makeUserRepository({ pool });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates and finds a user by email', async () => {
    await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });

    const found = await userRepo.findByEmail('a@b.com');

    expect(found.email).toBe('a@b.com');
    expect(found.name).toBe('Ada');
    expect(found.id).toBeDefined();
  });

  it('returns null for an unknown email', async () => {
    const found = await userRepo.findByEmail('nobody@b.com');
    expect(found).toBeNull();
  });

  it('finds a user by id', async () => {
    const created = await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });

    const found = await userRepo.findById(created.id);

    expect(found.email).toBe('a@b.com');
  });
});
