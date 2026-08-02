import { makeRegisterUser } from '@pdf-reader/core-service-identity/src/application/use-cases/register-user/register-user.use-case.js';
import { makeLoginUser } from '@pdf-reader/core-service-identity/src/application/use-cases/login-user/login-user.use-case.js';
import { makeRefreshSession } from '@pdf-reader/core-service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.js';
import { makeRevokeSession } from '@pdf-reader/core-service-identity/src/application/use-cases/revoke-session/revoke-session.use-case.js';
import { makePool } from './infrastructure/persistence/db.js';
import { makeUserRepository } from './infrastructure/persistence/user.repository.js';
import { makeSessionRepository } from './infrastructure/persistence/session.repository.js';
import { makeTokenIssuer, makeHasher } from './interfaces/http/auth-token.js';
import { makeAuthController } from './interfaces/http/auth.controller.js';

export const buildContainer = (config) => {
  const pool = makePool({ connectionString: config.databaseUrl });
  const userRepo = makeUserRepository({ pool });
  const sessionRepo = makeSessionRepository({ pool });
  const hasher = makeHasher();
  const tokenIssuer = makeTokenIssuer({ jwtAccessSecret: config.jwtAccessSecret, jwtAccessTtl: config.jwtAccessTtl });
  const clock = { now: () => new Date() };

  const registerUser = makeRegisterUser({ userRepo, hasher });
  const loginUser = makeLoginUser({ userRepo, sessionRepo, hasher, tokenIssuer, clock, refreshTtlMs: config.refreshTtlMs });
  const refreshSession = makeRefreshSession({ userRepo, sessionRepo, tokenIssuer, clock });
  const revokeSession = makeRevokeSession({ sessionRepo, tokenIssuer });

  const authController = makeAuthController({ registerUser, loginUser, refreshSession, revokeSession });

  return { pool, authController };
};
