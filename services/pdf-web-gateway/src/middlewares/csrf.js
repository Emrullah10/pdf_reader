import crypto from 'node:crypto';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const issueCsrfCookie = ({ isProduction }) => (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: isProduction, sameSite: 'lax', path: '/' });
  }
  next();
};

export const requireCsrfToken = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: { message: 'Invalid or missing CSRF token', details: null } });
    return;
  }

  next();
};
