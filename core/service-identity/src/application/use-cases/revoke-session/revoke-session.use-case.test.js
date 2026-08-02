import { makeRevokeSession } from './revoke-session.use-case.js';
import { makeFakeSessionRepository } from '../../../../test/fakes/fake-session-repository.js';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

const makeTokenIssuer = () => ({
  hashRefreshToken: (token) => `hashed:${token}`,
});

describe('makeRevokeSession', () => {
  it('revokes the session matching the refresh token', async () => {
    const sessionRepo = makeFakeSessionRepository([
      { id: 'session-1', userId: 'user-1', refreshTokenHash: 'hashed:my-refresh-token', revokedAt: null },
    ]);
    const revokeSession = makeRevokeSession({ sessionRepo, tokenIssuer: makeTokenIssuer() });

    await revokeSession({ refreshToken: 'my-refresh-token' });

    expect(sessionRepo._all[0].revokedAt).not.toBeNull();
  });

  it('throws SessionNotFoundError for an unknown refresh token', async () => {
    const revokeSession = makeRevokeSession({ sessionRepo: makeFakeSessionRepository(), tokenIssuer: makeTokenIssuer() });

    await expect(revokeSession({ refreshToken: 'unknown' })).rejects.toThrow(SessionNotFoundError);
  });
});
