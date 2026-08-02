const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

const baseCookieOptions = (isProduction) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
});

export const setAuthCookies = (res, { accessToken, refreshToken }, { isProduction }) => {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookieOptions(isProduction), maxAge: 1000 * 60 * 15 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...baseCookieOptions(isProduction), maxAge: 1000 * 60 * 60 * 24 * 30 });
};

export const clearAuthCookies = (res, { isProduction }) => {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions(isProduction));
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions(isProduction));
};

export const readAuthCookies = (req) => ({
  accessToken: req.cookies?.[ACCESS_COOKIE] ?? null,
  refreshToken: req.cookies?.[REFRESH_COOKIE] ?? null,
});
