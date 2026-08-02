import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('GATEWAY_PORT', '3000')),
  identityServiceUrl: requireEnv('IDENTITY_SERVICE_URL', 'http://localhost:3001'),
  documentServiceUrl: requireEnv('DOCUMENT_SERVICE_URL', 'http://localhost:3002'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  cookieSecret: requireEnv('COOKIE_SECRET', 'dev-cookie-secret-change-me'),
  isProduction: requireEnv('NODE_ENV', 'development') === 'production',
});
