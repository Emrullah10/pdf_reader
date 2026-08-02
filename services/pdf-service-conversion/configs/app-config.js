import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('CONVERSION_PORT', '3003')),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  documentServiceUrl: requireEnv('DOCUMENT_SERVICE_URL', 'http://localhost:3002'),
  storageDir: requireEnv('STORAGE_DIR', '/tmp/pdf-reader-storage'),
  maxUploadBytes: Number(requireEnv('MAX_UPLOAD_BYTES', String(50 * 1024 * 1024))),
});
