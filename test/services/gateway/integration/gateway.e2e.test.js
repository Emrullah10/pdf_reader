import request from 'supertest';
import { boot } from '../../../../services/pdf-web-gateway/src/boot.js';
import { testGatewayConfig } from './config/test-config.js';

describe('gateway HTTP API (e2e)', () => {
  const { app } = boot(testGatewayConfig);

  const uniqueEmail = () => `gw-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;

  it('rejects register without a CSRF token with 403', async () => {
    const agent = request.agent(app);
    await agent.get('/api/gateway/me');

    const res = await agent.post('/api/gateway/register').send({ email: uniqueEmail(), password: 'abcd1234', name: 'Ada' });

    expect(res.status).toBe(403);
  });

  it('registers, logs in, sets cookies, and reads /me', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const csrfProbe = await agent.get('/api/gateway/me');
    const xsrfCookie = csrfProbe.headers['set-cookie']?.find((c) => c.startsWith('XSRF-TOKEN='));
    const xsrfToken = xsrfCookie.split('XSRF-TOKEN=')[1].split(';')[0];

    const registerRes = await agent
      .post('/api/gateway/register')
      .set('X-XSRF-TOKEN', xsrfToken)
      .send({ email, password: 'abcd1234', name: 'Ada' });
    expect(registerRes.status).toBe(201);

    const loginRes = await agent
      .post('/api/gateway/login')
      .set('X-XSRF-TOKEN', xsrfToken)
      .send({ email, password: 'abcd1234' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(email);
    expect(loginRes.headers['set-cookie'].some((c) => c.startsWith('access_token='))).toBe(true);
    expect(loginRes.headers['set-cookie'].some((c) => c.startsWith('refresh_token='))).toBe(true);

    const meRes = await agent.get('/api/gateway/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);
  });

  it('returns 401 from /me without a session', async () => {
    const res = await request(app).get('/api/gateway/me');
    expect(res.status).toBe(401);
  });

  it('refreshes the access token using the refresh cookie', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const csrfProbe = await agent.get('/api/gateway/me');
    const xsrfToken = csrfProbe.headers['set-cookie']
      .find((c) => c.startsWith('XSRF-TOKEN='))
      .split('XSRF-TOKEN=')[1]
      .split(';')[0];

    await agent.post('/api/gateway/register').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234', name: 'Ada' });
    await agent.post('/api/gateway/login').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234' });

    const refreshRes = await agent.post('/api/gateway/refresh').set('X-XSRF-TOKEN', xsrfToken).send({});
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.user.email).toBe(email);
  });

  it('logs out and clears the session so /me returns 401 again', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const csrfProbe = await agent.get('/api/gateway/me');
    const xsrfToken = csrfProbe.headers['set-cookie']
      .find((c) => c.startsWith('XSRF-TOKEN='))
      .split('XSRF-TOKEN=')[1]
      .split(';')[0];

    await agent.post('/api/gateway/register').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234', name: 'Ada' });
    await agent.post('/api/gateway/login').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234' });

    const logoutRes = await agent.post('/api/gateway/logout').set('X-XSRF-TOKEN', xsrfToken).send({});
    expect(logoutRes.status).toBe(204);

    const meRes = await agent.get('/api/gateway/me');
    expect(meRes.status).toBe(401);
  });

  it('proxies an authenticated request to the document service with a translated Authorization header', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const csrfProbe = await agent.get('/api/gateway/me');
    const xsrfToken = csrfProbe.headers['set-cookie']
      .find((c) => c.startsWith('XSRF-TOKEN='))
      .split('XSRF-TOKEN=')[1]
      .split(';')[0];

    await agent.post('/api/gateway/register').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234', name: 'Ada' });
    await agent.post('/api/gateway/login').set('X-XSRF-TOKEN', xsrfToken).send({ email, password: 'abcd1234' });

    const res = await agent.get('/api/documents');

    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
  });
});
