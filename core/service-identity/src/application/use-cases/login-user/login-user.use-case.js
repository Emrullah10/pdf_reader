import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error.js';

export const makeLoginUser = ({ userRepo, sessionRepo, hasher, tokenIssuer, clock, refreshTtlMs }) => {
  return async ({ email, password, userAgent, ip }) => {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await hasher.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const accessToken = tokenIssuer.issueAccessToken(user);
    const refreshToken = tokenIssuer.issueRefreshToken(user);
    const refreshTokenHash = tokenIssuer.hashRefreshToken(refreshToken);
    const expiresAt = new Date(clock.now().getTime() + refreshTtlMs);

    await sessionRepo.create({ userId: user.id, refreshTokenHash, userAgent, ip, expiresAt });

    return { user, accessToken, refreshToken };
  };
};
