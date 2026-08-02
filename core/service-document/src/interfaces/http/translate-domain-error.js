import { NotFoundError, ValidationError } from '@pdf-reader/errors';
import { DocumentNotFoundError } from '../../domain/errors/document-not-found.error.js';
import { UnsupportedFileTypeError } from '../../domain/errors/unsupported-file-type.error.js';
import { DocumentNotReadyError } from '../../domain/errors/document-not-ready.error.js';

export const translateDomainError = (err) => {
  if (err instanceof DocumentNotFoundError) {
    return new NotFoundError(err.message);
  }
  if (err instanceof UnsupportedFileTypeError) {
    return new ValidationError(err.message);
  }
  if (err instanceof DocumentNotReadyError) {
    return new ValidationError(err.message);
  }
  return err;
};
