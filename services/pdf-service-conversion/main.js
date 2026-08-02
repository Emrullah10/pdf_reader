import { loadEnv } from '@pdf-reader/config';
import { makeLogger } from '@pdf-reader/helper';
import { getAppConfig } from './configs/app-config.js';
import { boot } from './src/boot.js';

loadEnv();
const config = getAppConfig();
const logger = makeLogger({ serviceName: 'pdf-service-conversion' });
const { app } = boot(config);

app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});
