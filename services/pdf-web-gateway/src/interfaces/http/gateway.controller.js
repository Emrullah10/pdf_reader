import { setAuthCookies, clearAuthCookies, readAuthCookies } from '../../auth/cookies.js';

export const makeGatewayController = ({ identityClient, isProduction }) => ({
  register: async (req, res) => {
    const { status, data } = await identityClient.register(req.body);
    res.status(status).json(data);
  },

  login: async (req, res) => {
    const { status, data } = await identityClient.login(req.body);

    if (status !== 200) {
      res.status(status).json(data);
      return;
    }

    setAuthCookies(res, { accessToken: data.accessToken, refreshToken: data.refreshToken }, { isProduction });
    res.status(200).json({ user: data.user });
  },

  refresh: async (req, res) => {
    const { refreshToken } = readAuthCookies(req);

    if (!refreshToken) {
      res.status(401).json({ error: { message: 'No refresh token', details: null } });
      return;
    }

    const { status, data } = await identityClient.refresh(refreshToken);

    if (status !== 200) {
      clearAuthCookies(res, { isProduction });
      res.status(status).json(data);
      return;
    }

    setAuthCookies(res, { accessToken: data.accessToken, refreshToken }, { isProduction });
    res.status(200).json({ user: data.user });
  },

  logout: async (req, res) => {
    const { refreshToken } = readAuthCookies(req);

    if (refreshToken) {
      await identityClient.logout(refreshToken);
    }

    clearAuthCookies(res, { isProduction });
    res.status(204).send();
  },

  me: (req, res) => {
    res.status(200).json({ user: req.user });
  },
});
