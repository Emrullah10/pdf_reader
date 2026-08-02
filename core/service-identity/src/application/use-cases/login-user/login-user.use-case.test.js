import { makeLoginUser } from './login-user.use-case.js';
import { makeFakeUserRepository } from '../../../../test/fakes/fake-user-repository.js';
import { makeFakeSessionRepository } from '../../../../test/fakes/fake-session-repository.js';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error.js';

const makeHasher = () => ({
  compare: async (plain, hash) => hash === `hashed:${plain}`,
});

const makeTokenIssuer = () => ({
  issueAccessToken: (user) => `access:${user.id}`,
  issueRefreshToken: () => 'refresh-plain-token',
  hashRefreshToken: (token) => `hashed:${token}`,
});

const fixedClock = { now: () => new Date('2026-01-01T00:00:00.000Z') };

describe('makeLoginUser', () => {
  it('returns tokens and creates a session for valid credentials', async () => {
    const userRepo = makeFakeUserRepository([
      { id: 'user-1', email: 'a@b.com', passwordHash: 'hashed:abcd1234', name: 'Ada', locale: 'tr' },
    ]);
    const sessionRepo = makeFakeSessionRepository();
    const loginUser = makeLoginUser({
      userRepo,
      sessionRepo,
      hasher: makeHasher(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
      refreshTtlMs: 1000 * 60 * 60 * 24 * 30,
    });

    const result = await loginUser({ email: 'a@b.com', password: 'abcd1234', userAgent: 'jest', ip: '127.0.0.1' });

    expect(result.accessToken).toBe('access:user-1');
    expect(result.refreshToken).toBe('refresh-plain-token');
    expect(sessionRepo._all).toHaveLength(1);
    expect(sessionRepo._all[0].refreshTokenHash).toBe('hashed:refresh-plain-token');
  });

  it('throws InvalidCredentialsError for a wrong password', async () => {
    const userRepo = makeFakeUserRepository([
      { id: 'user-1', email: 'a@b.com', passwordHash: 'hashed:abcd1234', name: 'Ada', locale: 'tr' },
    ]);
    const loginUser = makeLoginUser({
      userRepo,
      sessionRepo: makeFakeSessionRepository(),
      hasher: makeHasher(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
      refreshTtlMs: 1000,
    });

    await expect(
      loginUser({ email: 'a@b.com', password: 'wrong-pass', userAgent: 'jest', ip: '127.0.0.1' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for an unknown email', async () => {
    const loginUser = makeLoginUser({
      userRepo: makeFakeUserRepository(),
      sessionRepo: makeFakeSessionRepository(),
      hasher: makeHasher(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
      refreshTtlMs: 1000,
    });

    await expect(
      loginUser({ email: 'nobody@b.com', password: 'abcd1234', userAgent: 'jest', ip: '127.0.0.1' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});
