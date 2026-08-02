import { jest } from '@jest/globals';
import { makeLogger } from './index.js';

describe('makeLogger', () => {
  it('prefixes info logs with the service name', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = makeLogger({ serviceName: 'test-svc' });
    logger.info('hello', { foo: 'bar' });
    expect(spy).toHaveBeenCalledWith('[test-svc] INFO hello', { foo: 'bar' });
    spy.mockRestore();
  });

  it('prefixes error logs with the service name', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = makeLogger({ serviceName: 'test-svc' });
    logger.error('boom');
    expect(spy).toHaveBeenCalledWith('[test-svc] ERROR boom', '');
    spy.mockRestore();
  });
});
