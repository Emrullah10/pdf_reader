import { makeIdentityClient } from '../../../../services/pdf-web-gateway/src/clients/identity-client.js';

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001';

describe('identity-client (integration)', () => {
  const client = makeIdentityClient({ baseUrl: IDENTITY_URL });

  it('registers a user and returns 201 with the user payload', async () => {
    const email = `gw-client-${Date.now()}@test.com`;
    const { status, data } = await client.register({ email, password: 'abcd1234', name: 'Gateway Client Test' });

    expect(status).toBe(201);
    expect(data.user.email).toBe(email);
  });

  it('returns 401 on login with wrong credentials', async () => {
    const { status } = await client.login({ email: 'nonexistent@test.com', password: 'wrongpass1' });
    expect(status).toBe(401);
  });

  it('logs in successfully after registering', async () => {
    const email = `gw-client-${Date.now()}@test.com`;
    await client.register({ email, password: 'abcd1234', name: 'Gateway Client Test' });

    const { status, data } = await client.login({ email, password: 'abcd1234' });

    expect(status).toBe(200);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });
});
