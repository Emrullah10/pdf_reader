import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

export const makeRefreshSession = ({ userRepo, sessionRepo, tokenIssuer, clock }) => {
  return async ({ refreshToken }) => {
    const refreshTokenHash = tokenIssuer.hashRefreshToken(refreshToken);
    const session = await sessionRepo.findByRefreshTokenHash(refreshTokenHash);

    if (!session || session.revokedAt || session.expiresAt.getTime() <= clock.now().getTime()) {
      throw new SessionNotFoundError();
    }

    const user = await userRepo.findById(session.userId);
    if (!user) {
      throw new SessionNotFoundError();
    }

    const accessToken = tokenIssuer.issueAccessToken(user);
    return { accessToken, user };
  };
};
