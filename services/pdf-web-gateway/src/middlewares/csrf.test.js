import { jest } from '@jest/globals';
import { requireCsrfToken } from './csrf.js';

const makeReqRes = ({ method = 'POST', cookies = {}, headers = {} } = {}) => {
  const req = { method, cookies, headers };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};

describe('requireCsrfToken', () => {
  it('calls next() when the header matches the cookie', () => {
    const { req, res, next } = makeReqRes({
      cookies: { 'XSRF-TOKEN': 'abc123' },
      headers: { 'x-xsrf-token': 'abc123' },
    });

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 403 when the header is missing', () => {
    const { req, res, next } = makeReqRes({ cookies: { 'XSRF-TOKEN': 'abc123' }, headers: {} });

    requireCsrfToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 403 when the header does not match the cookie', () => {
    const { req, res, next } = makeReqRes({
      cookies: { 'XSRF-TOKEN': 'abc123' },
      headers: { 'x-xsrf-token': 'wrong-value' },
    });

    requireCsrfToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('skips the check for GET requests', () => {
    const { req, res, next } = makeReqRes({ method: 'GET', cookies: {}, headers: {} });

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
