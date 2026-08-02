export const makeLogger = ({ serviceName }) => {
  const log = (level, method) => (message, meta = '') => {
    console[method](`[${serviceName}] ${level} ${message}`, meta);
  };

  return {
    info: log('INFO', 'log'),
    warn: log('WARN', 'warn'),
    error: log('ERROR', 'error'),
  };
};
