import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

export const makeRevokeSession = ({ sessionRepo, tokenIssuer }) => {
  return async ({ refreshToken }) => {
    const refreshTokenHash = tokenIssuer.hashRefreshToken(refreshToken);
    const session = await sessionRepo.findByRefreshTokenHash(refreshTokenHash);

    if (!session || session.revokedAt) {
      throw new SessionNotFoundError();
    }

    await sessionRepo.revoke(session.id);
  };
};
