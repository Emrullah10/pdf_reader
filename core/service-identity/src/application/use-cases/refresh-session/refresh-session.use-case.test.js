import { makeRefreshSession } from './refresh-session.use-case.js';
import { makeFakeUserRepository } from '../../../../test/fakes/fake-user-repository.js';
import { makeFakeSessionRepository } from '../../../../test/fakes/fake-session-repository.js';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

const makeTokenIssuer = () => ({
  issueAccessToken: (user) => `access:${user.id}`,
  hashRefreshToken: (token) => `hashed:${token}`,
});

const fixedClock = { now: () => new Date('2026-01-01T00:00:00.000Z') };

describe('makeRefreshSession', () => {
  it('issues a new access token for a valid, unexpired session', async () => {
    const userRepo = makeFakeUserRepository([{ id: 'user-1', email: 'a@b.com', name: 'Ada', locale: 'tr' }]);
    const sessionRepo = makeFakeSessionRepository([
      {
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed:my-refresh-token',
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ]);
    const refreshSession = makeRefreshSession({
      userRepo,
      sessionRepo,
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    const result = await refreshSession({ refreshToken: 'my-refresh-token' });

    expect(result.accessToken).toBe('access:user-1');
  });

  it('throws SessionNotFoundError for an unknown refresh token', async () => {
    const refreshSession = makeRefreshSession({
      userRepo: makeFakeUserRepository(),
      sessionRepo: makeFakeSessionRepository(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    await expect(refreshSession({ refreshToken: 'unknown' })).rejects.toThrow(SessionNotFoundError);
  });

  it('throws SessionNotFoundError for a revoked session', async () => {
    const sessionRepo = makeFakeSessionRepository([
      {
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed:my-refresh-token',
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        revokedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    const refreshSession = makeRefreshSession({
      userRepo: makeFakeUserRepository([{ id: 'user-1', email: 'a@b.com', name: 'Ada', locale: 'tr' }]),
      sessionRepo,
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    await expect(refreshSession({ refreshToken: 'my-refresh-token' })).rejects.toThrow(SessionNotFoundError);
  });

  it('throws SessionNotFoundError for an expired session', async () => {
    const sessionRepo = makeFakeSessionRepository([
      {
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed:my-refresh-token',
        expiresAt: new Date('2025-01-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ]);
    const refreshSession = makeRefreshSession({
      userRepo: makeFakeUserRepository([{ id: 'user-1', email: 'a@b.com', name: 'Ada', locale: 'tr' }]),
      sessionRepo,
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    await expect(refreshSession({ refreshToken: 'my-refresh-token' })).rejects.toThrow(SessionNotFoundError);
  });
});
