import { requireEnv } from './index.js';

describe('requireEnv', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the value when the env var is set', () => {
    process.env.FOO = 'bar';
    expect(requireEnv('FOO')).toBe('bar');
  });

  it('returns the fallback when the env var is unset and a fallback is given', () => {
    delete process.env.FOO;
    expect(requireEnv('FOO', 'default')).toBe('default');
  });

  it('throws when the env var is unset and no fallback is given', () => {
    delete process.env.FOO;
    expect(() => requireEnv('FOO')).toThrow('Missing required environment variable: FOO');
  });
});
