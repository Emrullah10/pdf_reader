import jwt from 'jsonwebtoken';

export const makeRequireAuth = ({ jwtAccessSecret }) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ error: { message: 'Not authenticated', details: null } });
    return;
  }

  try {
    req.user = jwt.verify(token, jwtAccessSecret);
    next();
  } catch {
    res.status(401).json({ error: { message: 'Not authenticated', details: null } });
  }
};
