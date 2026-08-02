# Phase 2: Web Gateway Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `pdf-web-gateway` — the single HTTP entry point the frontend will talk to. It authenticates requests via signed cookies + JWT, issues/rotates refresh tokens against the identity service, applies CSRF protection and rate limiting, and reverse-proxies everything else to backend services by path prefix. After this phase, a browser client can register/login/logout/refresh entirely through cookies (no manual Authorization headers), and the gateway is ready to proxy to `document`/`conversion` services once they exist.

**Architecture:** `pdf-web-gateway` is a thin Express app with no business logic and no database of its own — it's a security boundary. It calls the identity service's existing HTTP API (`http://localhost:3001/api/auth/*`) as an internal HTTP client to perform login/register/refresh/logout, then wraps the results in httpOnly signed cookies (`access_token`, `refresh_token`) for the browser. A static route table (`ROUTE_TABLE` — no Redis/service-discovery yet, since only one backend service exists) maps public path prefixes to backend service base URLs for proxying. CSRF protection uses the double-submit-cookie pattern (a non-httpOnly `XSRF-TOKEN` cookie + required `X-XSRF-TOKEN` header on mutating requests). Rate limiting is in-memory (`express-rate-limit`), scoped to auth endpoints.

**Tech Stack:** Node.js 22 (ESM), Express 4, `cookie-parser`, `jsonwebtoken` (to verify access tokens issued by identity service — same `JWT_ACCESS_SECRET`), `http-proxy-middleware` (reverse proxy), `express-rate-limit`, `node-fetch`-free (use built-in `fetch`), Jest 29 (unit + integration + e2e), following the same `core/`-free "thin service" pattern (this service has no `core/pdf-web-gateway` — it's pure infrastructure/glue, unlike identity which had real domain logic to isolate).

---

## Context

`services/pdf-service-identity` already exists, is fully tested, and runs on port 3001 (`IDENTITY_PORT`). It exposes:
- `POST /api/auth/register` → `201 { user }`
- `POST /api/auth/login` → `200 { user, accessToken, refreshToken }`
- `POST /api/auth/refresh` → `200 { accessToken, user }` (body: `{ refreshToken }`)
- `POST /api/auth/logout` → `204` (body: `{ refreshToken }`)

The gateway does NOT reimplement auth logic — it calls these exact endpoints as an HTTP client, then translates the JSON token response into cookies for the browser, and translates incoming cookies back into an `Authorization: Bearer <token>` header (or a decoded user identity) when proxying to backend services.

**Why cookies at the gateway but JSON tokens at the identity service:** the identity service is a pure JSON API (usable by any client — mobile, CLI, tests). The gateway is the one component that understands "browser" as a client and handles the browser-specific concerns (CSRF, httpOnly cookies, same-site policy).

---

## File Structure

```
services/pdf-web-gateway/
├── package.json
├── main.js
├── ecosystem.config.js
├── configs/
│   └── app-config.js              # env: port, identityServiceUrl, cookie/jwt secrets, cors origin
├── src/
│   ├── boot.js                    # Express app assembly
│   ├── route-table.js             # static path-prefix → backend base URL map
│   ├── auth/
│   │   ├── cookies.js             # setAuthCookies, clearAuthCookies, readAuthCookies
│   │   └── verify-access-token.js # jwt.verify wrapper, returns decoded payload or null
│   ├── clients/
│   │   └── identity-client.js     # thin fetch wrapper: register/login/refresh/logout against identity service
│   ├── middlewares/
│   │   ├── csrf.js                # issueCsrfCookie, requireCsrfToken
│   │   ├── rate-limit.js          # strictAuthLimiter
│   │   └── require-auth.js        # verifies access_token cookie, 401s if missing/invalid, attaches req.user
│   └── interfaces/http/
│       ├── gateway.controller.js  # register/login/refresh/logout/me handlers
│       ├── gateway-routes.js      # /api/gateway/* routes
│       └── proxy-routes.js        # catch-all reverse proxy using route-table.js
test/
└── services/
    └── gateway/
        └── integration/
            ├── config/
            │   └── test-config.js      # shared test config + a running identity-service test instance
            └── gateway.e2e.test.js     # supertest against boot()'d gateway + a real running identity service
```

**Boundary note:** no `core/pdf-web-gateway` package — this service is pure HTTP glue with no reusable domain logic worth isolating (consistent with `MONOREPO-ARCHITECTURE-TEMPLATE.md` §12.2's single/thin-service guidance). Everything lives directly under `services/pdf-web-gateway/src/`.

---

## Task 1: Gateway service skeleton + config

**Files:**
- Create: `services/pdf-web-gateway/package.json`
- Create: `services/pdf-web-gateway/configs/app-config.js`
- Create: `services/pdf-web-gateway/ecosystem.config.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pdf-reader/service-gateway",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js"
  },
  "dependencies": {
    "@pdf-reader/config": "*",
    "@pdf-reader/errors": "*",
    "@pdf-reader/helper": "*",
    "@pdf-reader/middlewares": "*",
    "cookie-parser": "^1.4.6",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "http-proxy-middleware": "^3.0.3",
    "jsonwebtoken": "^9.0.2"
  }
}
```

- [ ] **Step 2: Write app-config.js**

`services/pdf-web-gateway/configs/app-config.js`:

```js
import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('GATEWAY_PORT', '3000')),
  identityServiceUrl: requireEnv('IDENTITY_SERVICE_URL', 'http://localhost:3001'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  cookieSecret: requireEnv('COOKIE_SECRET', 'dev-cookie-secret-change-me'),
  isProduction: requireEnv('NODE_ENV', 'development') === 'production',
});
```

Note: `jwtAccessSecret` MUST be the same value as the identity service's `JWT_ACCESS_SECRET` — the gateway verifies tokens the identity service signs, it doesn't sign its own. This will be enforced by both services reading from the same root `.env` in local dev.

- [ ] **Step 3: Write ecosystem.config.js**

```js
export default {
  apps: [
    {
      name: 'pdf-web-gateway',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
```

- [ ] **Step 4: Run `npm install` at repo root to link the new workspace package**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npm install
```

Expected: no errors; `cookie-parser`, `express-rate-limit`, `http-proxy-middleware` installed.

- [ ] **Step 5: Commit**

```bash
git add services/pdf-web-gateway/package.json services/pdf-web-gateway/configs services/pdf-web-gateway/ecosystem.config.js package-lock.json
git commit -m "chore(gateway): initialize service skeleton"
```

---

## Task 2: Identity service HTTP client

**Files:**
- Create: `services/pdf-web-gateway/src/clients/identity-client.js`
- Create: `test/services/gateway/integration/identity-client.integration.test.js`

This is a thin wrapper around `fetch` calling the identity service's real HTTP API. It's tested as an integration test (requires a running identity service), not mocked, because its entire job is correctly shaping HTTP calls to a real contract.

- [ ] **Step 1: Write the client**

`services/pdf-web-gateway/src/clients/identity-client.js`:

```js
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
```

- [ ] **Step 2: Write the integration test**

`test/services/gateway/integration/identity-client.integration.test.js`:

```js
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
```

- [ ] **Step 3: Start the identity service and run the test**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
(cd services/pdf-service-identity && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret JWT_REFRESH_SECRET=test-refresh-secret IDENTITY_PORT=3001 node main.js &)
sleep 1.5
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader IDENTITY_SERVICE_URL=http://localhost:3001 node --experimental-vm-modules node_modules/.bin/jest test/services/gateway/integration/identity-client --no-coverage
```

Expected: PASS (3 tests). Leave the identity service running in the background — subsequent tasks' tests need it too. If you started it with `&`, note its background job so you can manage it, but do not kill it at the end of this task.

- [ ] **Step 4: Commit**

```bash
git add services/pdf-web-gateway/src/clients test/services/gateway/integration/identity-client.integration.test.js
git commit -m "feat(gateway): add identity service HTTP client"
```

---

## Task 3: Auth cookies + access token verification

**Files:**
- Create: `services/pdf-web-gateway/src/auth/cookies.js`
- Create: `services/pdf-web-gateway/src/auth/verify-access-token.js`
- Create: `services/pdf-web-gateway/src/auth/verify-access-token.test.js`

- [ ] **Step 1: Write cookies.js**

`services/pdf-web-gateway/src/auth/cookies.js`:

```js
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
```

No dedicated unit test for `cookies.js` — it's a thin wrapper over Express's `res.cookie`/`res.clearCookie`, exercised by the e2e test in Task 6.

- [ ] **Step 2: Write the failing test for verify-access-token.js**

`services/pdf-web-gateway/src/auth/verify-access-token.test.js`:

```js
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from './verify-access-token.js';

const SECRET = 'test-secret';

describe('verifyAccessToken', () => {
  it('returns the decoded payload for a valid token', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, SECRET, { expiresIn: '15m' });

    const result = verifyAccessToken(token, SECRET);

    expect(result).not.toBeNull();
    expect(result.sub).toBe('user-1');
    expect(result.email).toBe('a@b.com');
  });

  it('returns null for an invalid token', () => {
    const result = verifyAccessToken('not-a-real-token', SECRET);
    expect(result).toBeNull();
  });

  it('returns null for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret', { expiresIn: '15m' });
    const result = verifyAccessToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', () => {
    const token = jwt.sign({ sub: 'user-1' }, SECRET, { expiresIn: '-1s' });
    const result = verifyAccessToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for a null token', () => {
    expect(verifyAccessToken(null, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-web-gateway/src/auth/verify-access-token --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement verify-access-token.js**

`services/pdf-web-gateway/src/auth/verify-access-token.js`:

```js
import jwt from 'jsonwebtoken';

export const verifyAccessToken = (token, secret) => {
  if (!token) return null;
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-web-gateway/src/auth/verify-access-token --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add services/pdf-web-gateway/src/auth
git commit -m "feat(gateway): add auth cookie helpers and access token verification"
```

---

## Task 4: CSRF protection + rate limiting middleware

**Files:**
- Create: `services/pdf-web-gateway/src/middlewares/csrf.js`
- Create: `services/pdf-web-gateway/src/middlewares/csrf.test.js`
- Create: `services/pdf-web-gateway/src/middlewares/rate-limit.js`

CSRF uses the double-submit-cookie pattern: `issueCsrfCookie` sets a readable (non-httpOnly) `XSRF-TOKEN` cookie with a random value; `requireCsrfToken` checks that mutating requests (`POST`/`PUT`/`PATCH`/`DELETE`) include a matching `X-XSRF-TOKEN` header. GET requests are exempt (they can't carry a body-based CSRF attack in this API design since there are no state-changing GETs).

- [ ] **Step 1: Write the failing test for csrf.js**

`services/pdf-web-gateway/src/middlewares/csrf.test.js`:

```js
import { jest } from '@jest/globals';
import { requireCsrfToken } from './csrf.js';

const makeReqRes = ({ method = 'POST', cookies = {}, headers = {} } = {}) => {
  const req = { method, cookies, headers };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};

describe('requireCsrfToken', () => {
  it('calls next() when the header matches the cookie', () => {
    const { req, res, next } = makeReqRes({
      cookies: { 'XSRF-TOKEN': 'abc123' },
      headers: { 'x-xsrf-token': 'abc123' },
    });

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 403 when the header is missing', () => {
    const { req, res, next } = makeReqRes({ cookies: { 'XSRF-TOKEN': 'abc123' }, headers: {} });

    requireCsrfToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 403 when the header does not match the cookie', () => {
    const { req, res, next } = makeReqRes({
      cookies: { 'XSRF-TOKEN': 'abc123' },
      headers: { 'x-xsrf-token': 'wrong-value' },
    });

    requireCsrfToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('skips the check for GET requests', () => {
    const { req, res, next } = makeReqRes({ method: 'GET', cookies: {}, headers: {} });

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-web-gateway/src/middlewares/csrf --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 2: Implement csrf.js**

`services/pdf-web-gateway/src/middlewares/csrf.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-web-gateway/src/middlewares/csrf --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 4: Write rate-limit.js (no dedicated test — thin wrapper over a well-tested library)**

`services/pdf-web-gateway/src/middlewares/rate-limit.js`:

```js
import rateLimit from 'express-rate-limit';

export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please try again later', details: null } },
});
```

- [ ] **Step 5: Commit**

```bash
git add services/pdf-web-gateway/src/middlewares
git commit -m "feat(gateway): add CSRF protection and rate limiting middleware"
```

---

## Task 5: require-auth middleware + static route table

**Files:**
- Create: `services/pdf-web-gateway/src/middlewares/require-auth.js`
- Create: `services/pdf-web-gateway/src/middlewares/require-auth.test.js`
- Create: `services/pdf-web-gateway/src/route-table.js`

- [ ] **Step 1: Write the failing test for require-auth.js**

`services/pdf-web-gateway/src/middlewares/require-auth.test.js`:

```js
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { makeRequireAuth } from './require-auth.js';

const SECRET = 'test-secret';

const makeReqRes = (cookies = {}) => {
  const req = { cookies };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};

describe('makeRequireAuth', () => {
  const requireAuth = makeRequireAuth({ jwtAccessSecret: SECRET });

  it('attaches req.user and calls next() for a valid access token cookie', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'a@b.com' }, SECRET, { expiresIn: '15m' });
    const { req, res, next } = makeReqRes({ access_token: token });

    requireAuth(req, res, next);

    expect(req.user).toEqual(expect.objectContaining({ sub: 'user-1', email: 'a@b.com' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('responds 401 when there is no access token cookie', () => {
    const { req, res, next } = makeReqRes({});

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 for an invalid access token cookie', () => {
    const { req, res, next } = makeReqRes({ access_token: 'garbage' });

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 1b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-web-gateway/src/middlewares/require-auth --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 2: Implement require-auth.js**

`services/pdf-web-gateway/src/middlewares/require-auth.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node --experimental-vm-modules node_modules/.bin/jest services/pdf-web-gateway/src/middlewares/require-auth --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 4: Write route-table.js**

`services/pdf-web-gateway/src/route-table.js`:

```js
export const buildRouteTable = (config) => [
  // Future: { prefix: '/api/documents', target: config.documentServiceUrl }
  // Future: { prefix: '/api/conversion', target: config.conversionServiceUrl }
];
```

No proxy targets exist yet in phase 2 — only the identity service exists, and it's accessed via the dedicated `/api/gateway/*` auth endpoints (Task 6), not raw-proxied. `buildRouteTable` returns an empty array for now; later phases will add entries here as `document`/`conversion` services come online. Written now (rather than skipped) to establish the extension point and keep `proxy-routes.js` (Task 7) generic from day one.

- [ ] **Step 5: Commit**

```bash
git add services/pdf-web-gateway/src/middlewares/require-auth.js services/pdf-web-gateway/src/middlewares/require-auth.test.js services/pdf-web-gateway/src/route-table.js
git commit -m "feat(gateway): add require-auth middleware and route table extension point"
```

---

## Task 6: Gateway auth controller + routes

**Files:**
- Create: `services/pdf-web-gateway/src/interfaces/http/gateway.controller.js`
- Create: `services/pdf-web-gateway/src/interfaces/http/gateway-routes.js`

This controller is the browser-facing translation layer: it calls `identity-client.js` (Task 2) and wraps JSON token responses into cookies (Task 3). No dedicated unit test — fully exercised by the e2e test in Task 8.

- [ ] **Step 1: Write gateway.controller.js**

`services/pdf-web-gateway/src/interfaces/http/gateway.controller.js`:

```js
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
```

Note: `refresh` re-uses the SAME refresh token cookie rather than rotating it, because the identity service's `refresh-session` use-case doesn't issue a new refresh token (only a new access token) — see `core/service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.js`. This matches the existing identity service contract exactly; refresh token rotation is a possible future hardening step, not part of this phase's scope.

- [ ] **Step 2: Write gateway-routes.js**

`services/pdf-web-gateway/src/interfaces/http/gateway-routes.js`:

```js
import { Router } from 'express';

export const makeGatewayRoutes = ({ gatewayController, requireAuth, requireCsrfToken, strictAuthLimiter }) => {
  const router = Router();

  router.post('/register', strictAuthLimiter, requireCsrfToken, gatewayController.register);
  router.post('/login', strictAuthLimiter, requireCsrfToken, gatewayController.login);
  router.post('/refresh', strictAuthLimiter, requireCsrfToken, gatewayController.refresh);
  router.post('/logout', requireCsrfToken, gatewayController.logout);
  router.get('/me', requireAuth, gatewayController.me);

  return router;
};
```

- [ ] **Step 3: Commit**

```bash
git add services/pdf-web-gateway/src/interfaces
git commit -m "feat(gateway): add gateway auth controller and routes"
```

---

## Task 7: Proxy routes (catch-all reverse proxy)

**Files:**
- Create: `services/pdf-web-gateway/src/interfaces/http/proxy-routes.js`

- [ ] **Step 1: Write proxy-routes.js**

`services/pdf-web-gateway/src/interfaces/http/proxy-routes.js`:

```js
import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export const makeProxyRoutes = ({ routeTable, requireAuth }) => {
  const router = Router();

  for (const { prefix, target } of routeTable) {
    router.use(prefix, requireAuth, createProxyMiddleware({ target, changeOrigin: true }));
  }

  return router;
};
```

Since `route-table.js` (Task 5) currently returns an empty array, this router has zero routes mounted in phase 2 — it's wired into `boot.js` (Task 8) now so that adding a `document` or `conversion` service later only requires adding one line to `route-table.js`, with no changes to `boot.js` or this file.

- [ ] **Step 2: Commit**

```bash
git add services/pdf-web-gateway/src/interfaces/http/proxy-routes.js
git commit -m "feat(gateway): add generic reverse-proxy route mounting"
```

---

## Task 8: boot.js, main.js, and full e2e test

**Files:**
- Create: `services/pdf-web-gateway/src/boot.js`
- Create: `services/pdf-web-gateway/main.js`
- Create: `test/services/gateway/integration/config/test-config.js`
- Create: `test/services/gateway/integration/gateway.e2e.test.js`

- [ ] **Step 1: Write boot.js**

`services/pdf-web-gateway/src/boot.js`:

```js
import express from 'express';
import cookieParser from 'cookie-parser';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeIdentityClient } from './clients/identity-client.js';
import { makeGatewayController } from './interfaces/http/gateway.controller.js';
import { makeGatewayRoutes } from './interfaces/http/gateway-routes.js';
import { makeProxyRoutes } from './interfaces/http/proxy-routes.js';
import { makeRequireAuth } from './middlewares/require-auth.js';
import { requireCsrfToken, issueCsrfCookie } from './middlewares/csrf.js';
import { strictAuthLimiter } from './middlewares/rate-limit.js';
import { buildRouteTable } from './route-table.js';

export const boot = (config) => {
  const identityClient = makeIdentityClient({ baseUrl: config.identityServiceUrl });
  const requireAuth = makeRequireAuth({ jwtAccessSecret: config.jwtAccessSecret });
  const gatewayController = makeGatewayController({ identityClient, isProduction: config.isProduction });
  const routeTable = buildRouteTable(config);

  const app = express();

  app.use(cookieParser());
  app.use(jsonBody());
  app.use(issueCsrfCookie({ isProduction: config.isProduction }));

  app.use(
    '/api/gateway',
    makeGatewayRoutes({ gatewayController, requireAuth, requireCsrfToken, strictAuthLimiter }),
  );
  app.use(makeProxyRoutes({ routeTable, requireAuth }));

  app.use(notFound());
  app.use(handleErrors);

  return { app };
};
```

- [ ] **Step 2: Write main.js**

`services/pdf-web-gateway/main.js`:

```js
import { loadEnv } from '@pdf-reader/config';
import { makeLogger } from '@pdf-reader/helper';
import { getAppConfig } from './configs/app-config.js';
import { boot } from './src/boot.js';

loadEnv();
const config = getAppConfig();
const logger = makeLogger({ serviceName: 'pdf-web-gateway' });
const { app } = boot(config);

app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});
```

- [ ] **Step 3: Write test-config.js**

`test/services/gateway/integration/config/test-config.js`:

```js
export const testGatewayConfig = {
  port: 0,
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'test-shared-secret',
  cookieSecret: 'test-cookie-secret',
  isProduction: false,
};
```

Note: `jwtAccessSecret` here MUST match whatever secret the identity service test instance (or the one you started manually in Task 2) was booted with, since the gateway verifies tokens the identity service signs. Use `test-shared-secret` consistently across every manual identity-service start command in this plan.

- [ ] **Step 4: Write the e2e test**

`test/services/gateway/integration/gateway.e2e.test.js`:

```js
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
});
```

- [ ] **Step 5: Ensure the identity service is running with the matching JWT secret, then run the e2e suite**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d

# Kill any previously-running identity service instance from earlier tasks in this plan, then restart with the exact secret the gateway test config expects:
pkill -f "services/pdf-service-identity/main.js" 2>/dev/null || true
sleep 1
(cd services/pdf-service-identity && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret JWT_REFRESH_SECRET=test-refresh-secret IDENTITY_PORT=3001 node main.js &)
sleep 1.5

DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
IDENTITY_SERVICE_URL=http://localhost:3001 \
JWT_ACCESS_SECRET=test-shared-secret \
node --experimental-vm-modules node_modules/.bin/jest test/services/gateway/integration/gateway.e2e --no-coverage
```

Expected: PASS (5 tests).

- [ ] **Step 6: Manual smoke test through curl with cookie jar**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader/services/pdf-web-gateway
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
IDENTITY_SERVICE_URL=http://localhost:3001 \
JWT_ACCESS_SECRET=test-shared-secret \
GATEWAY_PORT=3000 \
node main.js &
sleep 1

COOKIES=$(mktemp)
curl -s -c "$COOKIES" http://localhost:3000/api/gateway/me > /dev/null
XSRF=$(grep XSRF-TOKEN "$COOKIES" | awk '{print $NF}')

curl -s -b "$COOKIES" -c "$COOKIES" -X POST http://localhost:3000/api/gateway/register \
  -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"email":"gateway-smoke@test.com","password":"abcd1234","name":"Gateway Smoke"}'
echo ""

curl -s -b "$COOKIES" -c "$COOKIES" -X POST http://localhost:3000/api/gateway/login \
  -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $XSRF" \
  -d '{"email":"gateway-smoke@test.com","password":"abcd1234"}'
echo ""

curl -s -b "$COOKIES" http://localhost:3000/api/gateway/me
echo ""

kill %1 2>/dev/null
rm -f "$COOKIES"
```

Expected: register returns 201 with user JSON, login returns 200 with user JSON (no tokens in body — they're in cookies), `/me` returns 200 with the same user.

- [ ] **Step 7: Commit**

```bash
git add services/pdf-web-gateway/src/boot.js services/pdf-web-gateway/main.js test/services/gateway/integration/config test/services/gateway/integration/gateway.e2e.test.js
git commit -m "feat(gateway): add boot, main, and full e2e auth flow test"
```

---

## Task 9: Root .env.example update + docker-compose.dev.yml note

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add gateway env vars to the root .env.example**

Read the current `.env.example`, then add these lines (keep all existing lines unchanged):

```
GATEWAY_PORT=3000
IDENTITY_SERVICE_URL=http://localhost:3001
COOKIE_SECRET=dev-cookie-secret-change-me
NODE_ENV=development
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add gateway env vars to .env.example"
```

---

## Verification (end of phase 2)

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader

# 1. Lint clean
npm run lint

# 2. Full unit test suite green (no services need to be running)
node --experimental-vm-modules node_modules/.bin/jest --selectProjects unit --no-coverage

# 3. Start Postgres + identity service with a shared secret, then run all integration tests
docker compose -f docker-compose.dev.yml up -d
pkill -f "services/pdf-service-identity/main.js" 2>/dev/null || true
sleep 1
(cd services/pdf-service-identity && DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader JWT_ACCESS_SECRET=test-shared-secret JWT_REFRESH_SECRET=test-refresh-secret IDENTITY_PORT=3001 node main.js &)
sleep 1.5

DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader \
IDENTITY_SERVICE_URL=http://localhost:3001 \
JWT_ACCESS_SECRET=test-shared-secret \
node --experimental-vm-modules node_modules/.bin/jest --selectProjects integration --no-coverage

pkill -f "services/pdf-service-identity/main.js" 2>/dev/null || true
```

Expected: lint clean, all unit tests pass, all integration tests pass (including the new gateway ones).

**Manual acceptance check:** run Task 8 Step 6's curl smoke test sequence end-to-end and confirm register → login → /me all succeed through the gateway, with tokens never appearing in the JSON body (only in cookies).

**Not covered by this phase (deferred):** `document` and `conversion` services (and their route-table entries), frontend, `.wolf/` layer, `docker-compose.e2e.yml`, refresh token rotation on use, Redis-based service discovery (deferred until 3+ backend services exist, per `MONOREPO-ARCHITECTURE-TEMPLATE.md` §4.1's stated rationale).
