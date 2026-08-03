import { loadEnv } from '@pdf-reader/config';
import { getAppConfig } from './configs/app-config.js';
import { runWorker } from './src/worker/run-worker.js';

loadEnv();
const config = getAppConfig();

runWorker(config).catch((err) => {
  console.error('[document-worker] fatal error, exiting:', err);
  process.exit(1);
});
