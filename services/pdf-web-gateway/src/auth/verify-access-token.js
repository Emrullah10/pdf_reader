import jwt from 'jsonwebtoken';

export const verifyAccessToken = (token, secret) => {
  if (!token) return null;
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
};
