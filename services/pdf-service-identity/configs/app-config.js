import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('IDENTITY_PORT', '3001')),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtAccessTtl: requireEnv('JWT_ACCESS_TTL', '15m'),
  refreshTtlMs: 1000 * 60 * 60 * 24 * 30,
});
