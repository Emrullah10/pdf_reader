export const testGatewayConfig = {
  port: 0,
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001',
  documentServiceUrl: process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3002',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'test-shared-secret',
  cookieSecret: 'test-cookie-secret',
  isProduction: false,
};
