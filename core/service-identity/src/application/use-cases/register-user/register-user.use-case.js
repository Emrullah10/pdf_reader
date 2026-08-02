import { assertPasswordIsValid } from '../../../domain/password/password-policy.js';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error.js';

export const makeRegisterUser = ({ userRepo, hasher }) => {
  return async ({ email, password, name, locale = 'tr' }) => {
    assertPasswordIsValid(password);

    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyRegisteredError(email);
    }

    const passwordHash = await hasher.hash(password);
    return userRepo.create({ email, passwordHash, name, locale });
  };
};
