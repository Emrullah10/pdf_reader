import { ConflictError, UnauthorizedError, NotFoundError } from '@pdf-reader/errors';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error.js';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error.js';
import { SessionNotFoundError } from '../../domain/errors/session-not-found.error.js';

export const translateDomainError = (err) => {
  if (err instanceof EmailAlreadyRegisteredError) {
    return new ConflictError(err.message);
  }
  if (err instanceof InvalidCredentialsError) {
    return new UnauthorizedError(err.message);
  }
  if (err instanceof SessionNotFoundError) {
    return new NotFoundError(err.message);
  }
  return err;
};
