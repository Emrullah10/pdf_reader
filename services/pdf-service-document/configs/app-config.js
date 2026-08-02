import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('DOCUMENT_PORT', '3002')),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  storageDir: requireEnv('STORAGE_DIR', '/tmp/pdf-reader-storage'),
  maxUploadBytes: Number(requireEnv('MAX_UPLOAD_BYTES', String(50 * 1024 * 1024))),
});
