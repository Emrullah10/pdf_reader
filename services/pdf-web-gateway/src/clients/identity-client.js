export const makeIdentityClient = ({ baseUrl }) => {
  const post = async (path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json();
    return { status: res.status, data };
  };

  return {
    register: (input) => post('/api/auth/register', input),
    login: (input) => post('/api/auth/login', input),
    refresh: (refreshToken) => post('/api/auth/refresh', { refreshToken }),
    logout: (refreshToken) => post('/api/auth/logout', { refreshToken }),
  };
};
