import { makeRegisterUser } from './register-user.use-case.js';
import { makeFakeUserRepository } from '../../../../test/fakes/fake-user-repository.js';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error.js';

const makeHasher = () => ({
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
});

describe('makeRegisterUser', () => {
  it('creates a user with a hashed password', async () => {
    const userRepo = makeFakeUserRepository();
    const registerUser = makeRegisterUser({ userRepo, hasher: makeHasher() });

    const user = await registerUser({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    expect(user.email).toBe('a@b.com');
    expect(user.passwordHash).toBe('hashed:abcd1234');
    expect(user.password).toBeUndefined();
  });

  it('rejects a weak password', async () => {
    const userRepo = makeFakeUserRepository();
    const registerUser = makeRegisterUser({ userRepo, hasher: makeHasher() });

    await expect(registerUser({ email: 'a@b.com', password: 'weak', name: 'Ada' })).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });

  it('throws EmailAlreadyRegisteredError when the email exists', async () => {
    const userRepo = makeFakeUserRepository([
      { id: 'user-1', email: 'a@b.com', passwordHash: 'x', name: 'Existing', locale: 'tr' },
    ]);
    const registerUser = makeRegisterUser({ userRepo, hasher: makeHasher() });

    await expect(registerUser({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' })).rejects.toThrow(
      EmailAlreadyRegisteredError,
    );
  });
});
