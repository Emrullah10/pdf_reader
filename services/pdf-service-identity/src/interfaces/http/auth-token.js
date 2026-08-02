import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const makeTokenIssuer = ({ jwtAccessSecret, jwtAccessTtl }) => ({
  issueAccessToken: (user) => jwt.sign({ sub: user.id, email: user.email }, jwtAccessSecret, { expiresIn: jwtAccessTtl }),
  issueRefreshToken: () => crypto.randomBytes(48).toString('hex'),
  hashRefreshToken: (token) => crypto.createHash('sha256').update(token).digest('hex'),
});

export const makeHasher = () => ({
  hash: (plain) => bcrypt.hash(plain, 10),
  compare: (plain, hash) => bcrypt.compare(plain, hash),
});
