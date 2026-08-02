import jwt from 'jsonwebtoken';
import { verifyAccessToken } from './verify-access-token.js';

const SECRET = 'test-secret';

describe('verifyAccessToken', () => {
  it('returns the decoded payload for a valid token', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, SECRET, { expiresIn: '15m' });

    const result = verifyAccessToken(token, SECRET);

    expect(result).not.toBeNull();
    expect(result.sub).toBe('user-1');
    expect(result.email).toBe('a@b.com');
  });

  it('returns null for an invalid token', () => {
    const result = verifyAccessToken('not-a-real-token', SECRET);
    expect(result).toBeNull();
  });

  it('returns null for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret', { expiresIn: '15m' });
    const result = verifyAccessToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', () => {
    const token = jwt.sign({ sub: 'user-1' }, SECRET, { expiresIn: '-1s' });
    const result = verifyAccessToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for a null token', () => {
    expect(verifyAccessToken(null, SECRET)).toBeNull();
  });
});
