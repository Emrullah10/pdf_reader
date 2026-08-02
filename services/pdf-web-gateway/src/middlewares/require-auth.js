import { verifyAccessToken } from '../auth/verify-access-token.js';
import { readAuthCookies } from '../auth/cookies.js';

export const makeRequireAuth = ({ jwtAccessSecret }) => (req, res, next) => {
  const { accessToken } = readAuthCookies(req);
  const payload = verifyAccessToken(accessToken, jwtAccessSecret);

  if (!payload) {
    res.status(401).json({ error: { message: 'Not authenticated', details: null } });
    return;
  }

  req.user = payload;
  next();
};
