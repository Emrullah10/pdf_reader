import { jest } from '@jest/globals';
import { AppError, NotFoundError, ValidationError, ConflictError, UnauthorizedError, handleErrors } from './index.js';

describe('AppError hierarchy', () => {
  it('AppError defaults to status 500', () => {
    const err = new AppError('boom');
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });

  it('NotFoundError has status 404', () => {
    expect(new NotFoundError('missing').status).toBe(404);
  });

  it('ValidationError has status 400 and carries details', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('ConflictError has status 409', () => {
    expect(new ConflictError('dup').status).toBe(409);
  });

  it('UnauthorizedError has status 401', () => {
    expect(new UnauthorizedError('nope').status).toBe(401);
  });
});

describe('handleErrors middleware', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('translates an AppError to its status + JSON body', () => {
    const res = makeRes();
    const err = new ValidationError('bad input', { field: 'email' });
    handleErrors(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'bad input', details: { field: 'email' } },
    });
  });

  it('falls back to 500 for unknown errors and hides the message', () => {
    const res = makeRes();
    handleErrors(new Error('leaked internal detail'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Internal server error', details: null },
    });
  });
});
