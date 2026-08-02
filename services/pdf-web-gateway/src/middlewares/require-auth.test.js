import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { makeRequireAuth } from './require-auth.js';

const SECRET = 'test-secret';

const makeReqRes = (cookies = {}) => {
  const req = { cookies };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};

describe('makeRequireAuth', () => {
  const requireAuth = makeRequireAuth({ jwtAccessSecret: SECRET });

  it('attaches req.user and calls next() for a valid access token cookie', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, SECRET, { expiresIn: '15m' });
    const { req, res, next } = makeReqRes({ access_token: token });

    requireAuth(req, res, next);

    expect(req.user).toEqual(expect.objectContaining({ sub: 'user-1', email: 'a@b.com' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('responds 401 when there is no access token cookie', () => {
    const { req, res, next } = makeReqRes({});

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 for an invalid access token cookie', () => {
    const { req, res, next } = makeReqRes({ access_token: 'garbage' });

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
