# Phase 1: Monorepo Skeleton + Shared Packages + Identity Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo skeleton (npm workspaces, lint/format, `.gitignore`, `docs/`), the four foundational shared packages (`config`, `errors`, `helper`, `middlewares`), the `db-schemas` + migration tooling, and a fully working `identity` service (core + service shell) with register/login/refresh/logout — all behind the gateway is NOT part of this phase (gateway comes in phase 2). This phase ends with a running, tested HTTP service you can `curl` directly.

**Architecture:** npm workspaces monorepo. `core/service-identity` holds framework-free domain/application/infrastructure/interfaces layers (hexagonal). `services/pdf-service-identity` is the runnable shell (`main.js → boot.js → container.js`) that depends on `core/service-identity` and wires concrete Postgres repositories via a composition-root `container.js` using `make*` factory closures (no DI framework, no classes). `packages/modules/*` are small independent npm packages imported by name (e.g. `import { makeLogger } from '@pdf-reader/helper'`).

**Tech Stack:** Node.js 22 (ESM), Express 4, PostgreSQL 16 (`pg` driver, raw SQL — no ORM), `bcryptjs`, `jsonwebtoken`, `zod` (request validation), Jest 29 (unit/integration), `dotenv`, ESLint + Prettier, Docker Compose (Postgres only, for local dev + integration tests).

---

## File Structure

```
pdf_reader/
├── package.json                          # root workspaces + lint/format/test scripts
├── .gitignore                            # node_modules, .env, docs/, dist, coverage
├── .eslintrc.json
├── .prettierrc.json
├── .nvmrc                                # "22"
├── docker-compose.dev.yml                # postgres only, for local dev + integration tests
├── docs/
│   └── MONOREPO-ARCHITECTURE-TEMPLATE.md # copied reference doc (gitignored dir)
├── db-schemas/
│   ├── 00-enums-schema.sql
│   ├── 01-identity-schema.sql
│   ├── combined-schema.sql               # generated
│   └── migrations/
│       └── .gitkeep
├── scripts/
│   └── build-schema.js                   # concatenates numbered SQL files → combined-schema.sql
├── packages/
│   └── modules/
│       ├── config/
│       │   ├── package.json
│       │   ├── src/index.js              # loadEnv(), requireEnv()
│       │   └── src/index.test.js
│       ├── errors/
│       │   ├── package.json
│       │   ├── src/index.js              # AppError + subclasses, handleErrors middleware
│       │   └── src/index.test.js
│       ├── helper/
│       │   ├── package.json
│       │   ├── src/index.js              # makeLogger()
│       │   └── src/index.test.js
│       └── middlewares/
│           ├── package.json
│           └── src/index.js              # jsonBody(), notFound()
├── core/
│   └── service-identity/
│       ├── package.json
│       ├── src/
│       │   ├── domain/
│       │   │   ├── errors/
│       │   │   │   ├── invalid-credentials.error.js
│       │   │   │   ├── email-already-registered.error.js
│       │   │   │   └── session-not-found.error.js
│       │   │   └── password/
│       │   │       ├── password-policy.js
│       │   │       └── password-policy.test.js
│       │   ├── application/
│       │   │   └── use-cases/
│       │   │       ├── register-user/
│       │   │       │   ├── register-user.use-case.js
│       │   │       │   └── register-user.use-case.test.js
│       │   │       ├── login-user/
│       │   │       │   ├── login-user.use-case.js
│       │   │       │   └── login-user.use-case.test.js
│       │   │       ├── refresh-session/
│       │   │       │   ├── refresh-session.use-case.js
│       │   │       │   └── refresh-session.use-case.test.js
│       │   │       └── revoke-session/
│       │   │           ├── revoke-session.use-case.js
│       │   │           └── revoke-session.use-case.test.js
│       │   └── interfaces/
│       │       └── http/
│       │           └── translate-domain-error.js
│       └── test/
│           └── fakes/
│               ├── fake-user-repository.js
│               └── fake-session-repository.js
├── services/
│   └── pdf-service-identity/
│       ├── package.json
│       ├── main.js
│       ├── ecosystem.config.js
│       ├── configs/
│       │   └── app-config.js
│       └── src/
│           ├── boot.js
│           ├── container.js
│           ├── infrastructure/
│           │   └── persistence/
│           │       ├── db.js                          # pg Pool factory
│           │       ├── user.repository.js
│           │       └── session.repository.js
│           └── interfaces/
│               └── http/
│                   ├── routes.js
│                   ├── auth.controller.js
│                   └── auth-token.js                    # JWT sign/verify helpers
└── test/
    └── services/
        └── identity/
            ├── unit/                                    # (covered inline in core/, see above)
            └── integration/
                ├── config/
                │   └── db-setup.js                      # migrate + truncate helpers
                ├── user.repository.integration.test.js
                ├── session.repository.integration.test.js
                └── auth.e2e.test.js                      # supertest against boot()'d app
```

**Boundary note:** `core/service-identity` never imports Express, `pg`, or anything HTTP/DB-specific. It only imports from `packages/modules/errors` (for base `AppError`) and Node built-ins. `services/pdf-service-identity` is the only place that imports `pg`, `express`, `jsonwebtoken`, `bcryptjs`.

---

## Task 1: Root workspace skeleton

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.eslintrc.json`
- Create: `.prettierrc.json`
- Create: `.nvmrc`

- [ ] **Step 1: Create the directory and root `package.json`**

```bash
mkdir -p /Users/emrullah/developer/fullStack/pdf_reader
cd /Users/emrullah/developer/fullStack/pdf_reader
```

Write `package.json`:

```json
{
  "name": "pdf-reader-mono-repo",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/modules/*",
    "core/*",
    "services/*"
  ],
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "lint": "eslint . --ext .js",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test:unit": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration",
    "test": "jest",
    "db:build-schema": "node scripts/build-schema.js"
  },
  "devDependencies": {
    "eslint": "^9.9.0",
    "prettier": "^3.3.3",
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Create `.nvmrc`**

Content: `22`

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.env
.env.*
!.env.example
dist/
coverage/
docs/
*.log
.DS_Store
```

- [ ] **Step 4: Create `.eslintrc.json`**

```json
{
  "root": true,
  "env": { "node": true, "es2022": true, "jest": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "extends": "eslint:recommended",
  "rules": {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 5: Create `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 6: Install root devDependencies**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Initialize git and commit**

```bash
git init
git add package.json .gitignore .eslintrc.json .prettierrc.json .nvmrc
git commit -m "chore: initialize monorepo workspace skeleton"
```

---

## Task 2: docs/ directory with reference architecture

**Files:**
- Create: `docs/MONOREPO-ARCHITECTURE-TEMPLATE.md`

- [ ] **Step 1: Create docs directory and copy the reference file**

The user already provided the reference architecture document content (Tropiq monorepo template) earlier in conversation. Write it verbatim to `docs/MONOREPO-ARCHITECTURE-TEMPLATE.md`.

```bash
mkdir -p /Users/emrullah/developer/fullStack/pdf_reader/docs
```

Use the Write tool to save the full content of the document the user pasted (the "Monorepo Mimari Şablonu — Tropiq" markdown) to `docs/MONOREPO-ARCHITECTURE-TEMPLATE.md`.

- [ ] **Step 2: Verify it's gitignored (not committed)**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
git status --short
```

Expected: `docs/` does NOT appear in the output (it's in `.gitignore`).

No commit for this task — `docs/` is intentionally excluded from version control per the design.

---

## Task 3: `packages/modules/config` — env loading

**Files:**
- Create: `packages/modules/config/package.json`
- Create: `packages/modules/config/src/index.js`
- Create: `packages/modules/config/src/index.test.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pdf-reader/config",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "dependencies": {
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/modules/config/src/index.test.js`:

```js
import { requireEnv } from './index.js';

describe('requireEnv', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the value when the env var is set', () => {
    process.env.FOO = 'bar';
    expect(requireEnv('FOO')).toBe('bar');
  });

  it('returns the fallback when the env var is unset and a fallback is given', () => {
    delete process.env.FOO;
    expect(requireEnv('FOO', 'default')).toBe('default');
  });

  it('throws when the env var is unset and no fallback is given', () => {
    delete process.env.FOO;
    expect(() => requireEnv('FOO')).toThrow('Missing required environment variable: FOO');
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest packages/modules/config --no-coverage
```

Expected: FAIL — `Cannot find module './index.js'`

- [ ] **Step 3: Write the implementation**

`packages/modules/config/src/index.js`:

```js
import dotenv from 'dotenv';

export const loadEnv = () => {
  dotenv.config();
};

export const requireEnv = (key, fallback) => {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${key}`);
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest packages/modules/config --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/modules/config
git commit -m "feat(config): add requireEnv/loadEnv package"
```

---

## Task 4: `packages/modules/errors` — AppError hierarchy + Express handler

**Files:**
- Create: `packages/modules/errors/package.json`
- Create: `packages/modules/errors/src/index.js`
- Create: `packages/modules/errors/src/index.test.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pdf-reader/errors",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js"
}
```

- [ ] **Step 2: Write the failing test**

`packages/modules/errors/src/index.test.js`:

```js
import { AppError, NotFoundError, ValidationError, ConflictError, UnauthorizedError, handleErrors } from './index.js';

describe('AppError hierarchy', () => {
  it('AppError defaults to status 500', () => {
    const err = new AppError('boom');
    expect(err.status).toBe(500);
    expect(err.message).toBe('boom');
  });

  it('NotFoundError has status 404', () => {
    expect(new NotFoundError('missing').status).toBe(404);
  });

  it('ValidationError has status 400 and carries details', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('ConflictError has status 409', () => {
    expect(new ConflictError('dup').status).toBe(409);
  });

  it('UnauthorizedError has status 401', () => {
    expect(new UnauthorizedError('nope').status).toBe(401);
  });
});

describe('handleErrors middleware', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('translates an AppError to its status + JSON body', () => {
    const res = makeRes();
    const err = new ValidationError('bad input', { field: 'email' });
    handleErrors(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'bad input', details: { field: 'email' } },
    });
  });

  it('falls back to 500 for unknown errors and hides the message', () => {
    const res = makeRes();
    handleErrors(new Error('leaked internal detail'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Internal server error', details: null },
    });
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest packages/modules/errors --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/modules/errors/src/index.js`:

```js
export class AppError extends Error {
  constructor(message, { status = 500, details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message, details) {
    super(message, { status: 404, details });
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { status: 400, details });
  }
}

export class ConflictError extends AppError {
  constructor(message, details) {
    super(message, { status: 409, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message, details) {
    super(message, { status: 401, details });
  }
}

export const handleErrors = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details ?? null } });
    return;
  }
  res.status(500).json({ error: { message: 'Internal server error', details: null } });
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest packages/modules/errors --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/modules/errors
git commit -m "feat(errors): add AppError hierarchy and Express error handler"
```

---

## Task 5: `packages/modules/helper` — logger

**Files:**
- Create: `packages/modules/helper/package.json`
- Create: `packages/modules/helper/src/index.js`
- Create: `packages/modules/helper/src/index.test.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pdf-reader/helper",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js"
}
```

- [ ] **Step 2: Write the failing test**

`packages/modules/helper/src/index.test.js`:

```js
import { makeLogger } from './index.js';

describe('makeLogger', () => {
  it('prefixes info logs with the service name', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = makeLogger({ serviceName: 'test-svc' });
    logger.info('hello', { foo: 'bar' });
    expect(spy).toHaveBeenCalledWith('[test-svc] INFO hello', { foo: 'bar' });
    spy.mockRestore();
  });

  it('prefixes error logs with the service name', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = makeLogger({ serviceName: 'test-svc' });
    logger.error('boom');
    expect(spy).toHaveBeenCalledWith('[test-svc] ERROR boom', '');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest packages/modules/helper --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/modules/helper/src/index.js`:

```js
export const makeLogger = ({ serviceName }) => {
  const log = (level, method) => (message, meta = '') => {
    console[method](`[${serviceName}] ${level} ${message}`, meta);
  };

  return {
    info: log('INFO', 'log'),
    warn: log('WARN', 'warn'),
    error: log('ERROR', 'error'),
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest packages/modules/helper --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/modules/helper
git commit -m "feat(helper): add makeLogger"
```

---

## Task 6: `packages/modules/middlewares` — jsonBody + notFound

**Files:**
- Create: `packages/modules/middlewares/package.json`
- Create: `packages/modules/middlewares/src/index.js`

No dedicated unit test — this package is a thin wrapper over `express.json()` and is exercised by the identity service's integration/e2e tests in Task 12.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pdf-reader/middlewares",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 2: Write the implementation**

`packages/modules/middlewares/src/index.js`:

```js
import express from 'express';

export const jsonBody = () => express.json({ limit: '1mb' });

export const notFound = () => (req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}`, details: null } });
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/modules/middlewares
git commit -m "feat(middlewares): add jsonBody and notFound middlewares"
```

---

## Task 7: `db-schemas/` — identity schema + build script

**Files:**
- Create: `db-schemas/00-enums-schema.sql`
- Create: `db-schemas/01-identity-schema.sql`
- Create: `scripts/build-schema.js`
- Create: `db-schemas/migrations/.gitkeep`

- [ ] **Step 1: Write the enums schema**

`db-schemas/00-enums-schema.sql`:

```sql
-- Enums shared across services. Extended in later phases (document/conversion).
```

(Empty placeholder file with only a comment is fine here — no cross-service enums exist yet in phase 1. It establishes the numbered-file convention for later phases.)

- [ ] **Step 2: Write the identity schema**

`db-schemas/01-identity-schema.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'tr',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);
```

- [ ] **Step 3: Write the build script**

`scripts/build-schema.js`:

```js
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, '..', 'db-schemas');
const outputFile = join(schemasDir, 'combined-schema.sql');

const files = readdirSync(schemasDir)
  .filter((f) => /^\d{2}-.*\.sql$/.test(f))
  .sort();

const combined = files
  .map((f) => `-- === ${f} ===\n${readFileSync(join(schemasDir, f), 'utf-8')}`)
  .join('\n\n');

writeFileSync(outputFile, combined);
console.log(`Combined ${files.length} schema files into ${outputFile}`);
```

- [ ] **Step 4: Create the migrations placeholder**

```bash
mkdir -p /Users/emrullah/developer/fullStack/pdf_reader/db-schemas/migrations
touch /Users/emrullah/developer/fullStack/pdf_reader/db-schemas/migrations/.gitkeep
```

- [ ] **Step 5: Run the build script and verify output**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
node scripts/build-schema.js
cat db-schemas/combined-schema.sql
```

Expected: prints combined SQL containing both `00-enums-schema.sql` and `01-identity-schema.sql` content, `CREATE TABLE IF NOT EXISTS users` and `CREATE TABLE IF NOT EXISTS sessions` visible.

- [ ] **Step 6: Commit**

```bash
git add db-schemas scripts/build-schema.js
git commit -m "feat(db-schemas): add identity schema and build-schema script"
```

---

## Task 8: Local Postgres for dev + integration tests

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `.env.example`

- [ ] **Step 1: Write docker-compose.dev.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pdf_reader
      POSTGRES_PASSWORD: pdf_reader
      POSTGRES_DB: pdf_reader
    ports:
      - '5432:5432'
    volumes:
      - pdf_reader_pg_data:/var/lib/postgresql/data

volumes:
  pdf_reader_pg_data:
```

- [ ] **Step 2: Write `.env.example`**

```
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader
IDENTITY_PORT=3001
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
```

- [ ] **Step 3: Start Postgres and load the schema**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
sleep 3
docker exec -i $(docker compose -f docker-compose.dev.yml ps -q postgres) \
  psql -U pdf_reader -d pdf_reader < db-schemas/combined-schema.sql
```

Expected: `CREATE EXTENSION`, `CREATE TABLE`, `CREATE INDEX` messages, no errors.

- [ ] **Step 4: Verify tables exist**

```bash
docker exec -i $(docker compose -f docker-compose.dev.yml ps -q postgres) \
  psql -U pdf_reader -d pdf_reader -c '\dt'
```

Expected: lists `users` and `sessions`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dev.yml .env.example
git commit -m "chore: add local Postgres dev environment"
```

---

## Task 9: `core/service-identity` — domain layer (errors + password policy)

**Files:**
- Create: `core/service-identity/package.json`
- Create: `core/service-identity/src/domain/errors/invalid-credentials.error.js`
- Create: `core/service-identity/src/domain/errors/email-already-registered.error.js`
- Create: `core/service-identity/src/domain/errors/session-not-found.error.js`
- Create: `core/service-identity/src/domain/password/password-policy.js`
- Create: `core/service-identity/src/domain/password/password-policy.test.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pdf-reader/core-service-identity",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js"
}
```

- [ ] **Step 2: Write the domain error classes**

`core/service-identity/src/domain/errors/invalid-credentials.error.js`:

```js
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}
```

`core/service-identity/src/domain/errors/email-already-registered.error.js`:

```js
export class EmailAlreadyRegisteredError extends Error {
  constructor(email) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyRegisteredError';
    this.email = email;
  }
}
```

`core/service-identity/src/domain/errors/session-not-found.error.js`:

```js
export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found or already revoked');
    this.name = 'SessionNotFoundError';
  }
}
```

- [ ] **Step 3: Write the failing test for password policy**

`core/service-identity/src/domain/password/password-policy.test.js`:

```js
import { assertPasswordIsValid } from './password-policy.js';

describe('assertPasswordIsValid', () => {
  it('accepts a password with 8+ chars, one letter and one digit', () => {
    expect(() => assertPasswordIsValid('abcd1234')).not.toThrow();
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(() => assertPasswordIsValid('ab1')).toThrow('Password must be at least 8 characters');
  });

  it('rejects a password with no digit', () => {
    expect(() => assertPasswordIsValid('abcdefgh')).toThrow('Password must contain at least one digit');
  });

  it('rejects a password with no letter', () => {
    expect(() => assertPasswordIsValid('12345678')).toThrow('Password must contain at least one letter');
  });
});
```

- [ ] **Step 3b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest core/service-identity/src/domain/password --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

`core/service-identity/src/domain/password/password-policy.js`:

```js
export const assertPasswordIsValid = (password) => {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!/\d/.test(password)) {
    throw new Error('Password must contain at least one digit');
  }
  if (!/[a-zA-Z]/.test(password)) {
    throw new Error('Password must contain at least one letter');
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest core/service-identity/src/domain/password --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add core/service-identity/package.json core/service-identity/src/domain
git commit -m "feat(identity-core): add domain errors and password policy"
```

---

## Task 10: `core/service-identity` — application use-cases

**Files:**
- Create: `core/service-identity/test/fakes/fake-user-repository.js`
- Create: `core/service-identity/test/fakes/fake-session-repository.js`
- Create: `core/service-identity/src/application/use-cases/register-user/register-user.use-case.js`
- Create: `core/service-identity/src/application/use-cases/register-user/register-user.use-case.test.js`
- Create: `core/service-identity/src/application/use-cases/login-user/login-user.use-case.js`
- Create: `core/service-identity/src/application/use-cases/login-user/login-user.use-case.test.js`
- Create: `core/service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.js`
- Create: `core/service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.test.js`
- Create: `core/service-identity/src/application/use-cases/revoke-session/revoke-session.use-case.js`
- Create: `core/service-identity/src/application/use-cases/revoke-session/revoke-session.use-case.test.js`

Use-cases receive their dependencies (repositories, a `hasher`, a `tokenIssuer`, a `clock`) as parameters — this keeps them framework-free and trivially testable with fakes, per the composition-root pattern in the design doc.

**Shared collaborator shapes used throughout this task:**
- `userRepo`: `{ findByEmail(email), create({ email, passwordHash, name, locale }), findById(id) }`
- `sessionRepo`: `{ create({ userId, refreshTokenHash, userAgent, ip, expiresAt }), findByRefreshTokenHash(hash), revoke(sessionId) }`
- `hasher`: `{ hash(plain), compare(plain, hash) }`
- `clock`: `{ now() }` returns a `Date`

- [ ] **Step 1: Write the fake repositories**

`core/service-identity/test/fakes/fake-user-repository.js`:

```js
export const makeFakeUserRepository = (initialUsers = []) => {
  const users = [...initialUsers];
  let nextId = users.length + 1;

  return {
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create({ email, passwordHash, name, locale }) {
      const user = { id: `user-${nextId++}`, email, passwordHash, name, locale, createdAt: new Date() };
      users.push(user);
      return user;
    },
    _all: users,
  };
};
```

`core/service-identity/test/fakes/fake-session-repository.js`:

```js
export const makeFakeSessionRepository = (initialSessions = []) => {
  const sessions = [...initialSessions];
  let nextId = sessions.length + 1;

  return {
    async create({ userId, refreshTokenHash, userAgent, ip, expiresAt }) {
      const session = {
        id: `session-${nextId++}`,
        userId,
        refreshTokenHash,
        userAgent,
        ip,
        expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      sessions.push(session);
      return session;
    },
    async findByRefreshTokenHash(hash) {
      return sessions.find((s) => s.refreshTokenHash === hash) ?? null;
    },
    async revoke(sessionId) {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) session.revokedAt = new Date();
    },
    _all: sessions,
  };
};
```

- [ ] **Step 2: Write the failing test for register-user**

`core/service-identity/src/application/use-cases/register-user/register-user.use-case.test.js`:

```js
import { makeRegisterUser } from './register-user.use-case.js';
import { makeFakeUserRepository } from '../../../../test/fakes/fake-user-repository.js';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error.js';

const makeHasher = () => ({
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
});

describe('makeRegisterUser', () => {
  it('creates a user with a hashed password', async () => {
    const userRepo = makeFakeUserRepository();
    const registerUser = makeRegisterUser({ userRepo, hasher: makeHasher() });

    const user = await registerUser({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    expect(user.email).toBe('a@b.com');
    expect(user.passwordHash).toBe('hashed:abcd1234');
    expect(user.password).toBeUndefined();
  });

  it('rejects a weak password', async () => {
    const userRepo = makeFakeUserRepository();
    const registerUser = makeRegisterUser({ userRepo, hasher: makeHasher() });

    await expect(registerUser({ email: 'a@b.com', password: 'weak', name: 'Ada' })).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });

  it('throws EmailAlreadyRegisteredError when the email exists', async () => {
    const userRepo = makeFakeUserRepository([
      { id: 'user-1', email: 'a@b.com', passwordHash: 'x', name: 'Existing', locale: 'tr' },
    ]);
    const registerUser = makeRegisterUser({ userRepo, hasher: makeHasher() });

    await expect(registerUser({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' })).rejects.toThrow(
      EmailAlreadyRegisteredError,
    );
  });
});
```

- [ ] **Step 2b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest register-user.use-case --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement register-user use-case**

`core/service-identity/src/application/use-cases/register-user/register-user.use-case.js`:

```js
import { assertPasswordIsValid } from '../../../domain/password/password-policy.js';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/email-already-registered.error.js';

export const makeRegisterUser = ({ userRepo, hasher }) => {
  return async ({ email, password, name, locale = 'tr' }) => {
    assertPasswordIsValid(password);

    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyRegisteredError(email);
    }

    const passwordHash = await hasher.hash(password);
    return userRepo.create({ email, passwordHash, name, locale });
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest register-user.use-case --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for login-user**

`core/service-identity/src/application/use-cases/login-user/login-user.use-case.test.js`:

```js
import { makeLoginUser } from './login-user.use-case.js';
import { makeFakeUserRepository } from '../../../../test/fakes/fake-user-repository.js';
import { makeFakeSessionRepository } from '../../../../test/fakes/fake-session-repository.js';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error.js';

const makeHasher = () => ({
  compare: async (plain, hash) => hash === `hashed:${plain}`,
});

const makeTokenIssuer = () => ({
  issueAccessToken: (user) => `access:${user.id}`,
  issueRefreshToken: () => 'refresh-plain-token',
  hashRefreshToken: (token) => `hashed:${token}`,
});

const fixedClock = { now: () => new Date('2026-01-01T00:00:00.000Z') };

describe('makeLoginUser', () => {
  it('returns tokens and creates a session for valid credentials', async () => {
    const userRepo = makeFakeUserRepository([
      { id: 'user-1', email: 'a@b.com', passwordHash: 'hashed:abcd1234', name: 'Ada', locale: 'tr' },
    ]);
    const sessionRepo = makeFakeSessionRepository();
    const loginUser = makeLoginUser({
      userRepo,
      sessionRepo,
      hasher: makeHasher(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
      refreshTtlMs: 1000 * 60 * 60 * 24 * 30,
    });

    const result = await loginUser({ email: 'a@b.com', password: 'abcd1234', userAgent: 'jest', ip: '127.0.0.1' });

    expect(result.accessToken).toBe('access:user-1');
    expect(result.refreshToken).toBe('refresh-plain-token');
    expect(sessionRepo._all).toHaveLength(1);
    expect(sessionRepo._all[0].refreshTokenHash).toBe('hashed:refresh-plain-token');
  });

  it('throws InvalidCredentialsError for a wrong password', async () => {
    const userRepo = makeFakeUserRepository([
      { id: 'user-1', email: 'a@b.com', passwordHash: 'hashed:abcd1234', name: 'Ada', locale: 'tr' },
    ]);
    const loginUser = makeLoginUser({
      userRepo,
      sessionRepo: makeFakeSessionRepository(),
      hasher: makeHasher(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
      refreshTtlMs: 1000,
    });

    await expect(
      loginUser({ email: 'a@b.com', password: 'wrong-pass', userAgent: 'jest', ip: '127.0.0.1' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for an unknown email', async () => {
    const loginUser = makeLoginUser({
      userRepo: makeFakeUserRepository(),
      sessionRepo: makeFakeSessionRepository(),
      hasher: makeHasher(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
      refreshTtlMs: 1000,
    });

    await expect(
      loginUser({ email: 'nobody@b.com', password: 'abcd1234', userAgent: 'jest', ip: '127.0.0.1' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});
```

- [ ] **Step 5b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest login-user.use-case --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 6: Implement login-user use-case**

`core/service-identity/src/application/use-cases/login-user/login-user.use-case.js`:

```js
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error.js';

export const makeLoginUser = ({ userRepo, sessionRepo, hasher, tokenIssuer, clock, refreshTtlMs }) => {
  return async ({ email, password, userAgent, ip }) => {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await hasher.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const accessToken = tokenIssuer.issueAccessToken(user);
    const refreshToken = tokenIssuer.issueRefreshToken(user);
    const refreshTokenHash = tokenIssuer.hashRefreshToken(refreshToken);
    const expiresAt = new Date(clock.now().getTime() + refreshTtlMs);

    await sessionRepo.create({ userId: user.id, refreshTokenHash, userAgent, ip, expiresAt });

    return { user, accessToken, refreshToken };
  };
};
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest login-user.use-case --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 8: Write the failing test for refresh-session**

`core/service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.test.js`:

```js
import { makeRefreshSession } from './refresh-session.use-case.js';
import { makeFakeUserRepository } from '../../../../test/fakes/fake-user-repository.js';
import { makeFakeSessionRepository } from '../../../../test/fakes/fake-session-repository.js';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

const makeTokenIssuer = () => ({
  issueAccessToken: (user) => `access:${user.id}`,
  hashRefreshToken: (token) => `hashed:${token}`,
});

const fixedClock = { now: () => new Date('2026-01-01T00:00:00.000Z') };

describe('makeRefreshSession', () => {
  it('issues a new access token for a valid, unexpired session', async () => {
    const userRepo = makeFakeUserRepository([{ id: 'user-1', email: 'a@b.com', name: 'Ada', locale: 'tr' }]);
    const sessionRepo = makeFakeSessionRepository([
      {
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed:my-refresh-token',
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ]);
    const refreshSession = makeRefreshSession({
      userRepo,
      sessionRepo,
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    const result = await refreshSession({ refreshToken: 'my-refresh-token' });

    expect(result.accessToken).toBe('access:user-1');
  });

  it('throws SessionNotFoundError for an unknown refresh token', async () => {
    const refreshSession = makeRefreshSession({
      userRepo: makeFakeUserRepository(),
      sessionRepo: makeFakeSessionRepository(),
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    await expect(refreshSession({ refreshToken: 'unknown' })).rejects.toThrow(SessionNotFoundError);
  });

  it('throws SessionNotFoundError for a revoked session', async () => {
    const sessionRepo = makeFakeSessionRepository([
      {
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed:my-refresh-token',
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        revokedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    const refreshSession = makeRefreshSession({
      userRepo: makeFakeUserRepository([{ id: 'user-1', email: 'a@b.com', name: 'Ada', locale: 'tr' }]),
      sessionRepo,
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    await expect(refreshSession({ refreshToken: 'my-refresh-token' })).rejects.toThrow(SessionNotFoundError);
  });

  it('throws SessionNotFoundError for an expired session', async () => {
    const sessionRepo = makeFakeSessionRepository([
      {
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed:my-refresh-token',
        expiresAt: new Date('2025-01-01T00:00:00.000Z'),
        revokedAt: null,
      },
    ]);
    const refreshSession = makeRefreshSession({
      userRepo: makeFakeUserRepository([{ id: 'user-1', email: 'a@b.com', name: 'Ada', locale: 'tr' }]),
      sessionRepo,
      tokenIssuer: makeTokenIssuer(),
      clock: fixedClock,
    });

    await expect(refreshSession({ refreshToken: 'my-refresh-token' })).rejects.toThrow(SessionNotFoundError);
  });
});
```

- [ ] **Step 8b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest refresh-session.use-case --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 9: Implement refresh-session use-case**

`core/service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.js`:

```js
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

export const makeRefreshSession = ({ userRepo, sessionRepo, tokenIssuer, clock }) => {
  return async ({ refreshToken }) => {
    const refreshTokenHash = tokenIssuer.hashRefreshToken(refreshToken);
    const session = await sessionRepo.findByRefreshTokenHash(refreshTokenHash);

    if (!session || session.revokedAt || session.expiresAt.getTime() <= clock.now().getTime()) {
      throw new SessionNotFoundError();
    }

    const user = await userRepo.findById(session.userId);
    if (!user) {
      throw new SessionNotFoundError();
    }

    const accessToken = tokenIssuer.issueAccessToken(user);
    return { accessToken, user };
  };
};
```

- [ ] **Step 10: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest refresh-session.use-case --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 11: Write the failing test for revoke-session**

`core/service-identity/src/application/use-cases/revoke-session/revoke-session.use-case.test.js`:

```js
import { makeRevokeSession } from './revoke-session.use-case.js';
import { makeFakeSessionRepository } from '../../../../test/fakes/fake-session-repository.js';
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

const makeTokenIssuer = () => ({
  hashRefreshToken: (token) => `hashed:${token}`,
});

describe('makeRevokeSession', () => {
  it('revokes the session matching the refresh token', async () => {
    const sessionRepo = makeFakeSessionRepository([
      { id: 'session-1', userId: 'user-1', refreshTokenHash: 'hashed:my-refresh-token', revokedAt: null },
    ]);
    const revokeSession = makeRevokeSession({ sessionRepo, tokenIssuer: makeTokenIssuer() });

    await revokeSession({ refreshToken: 'my-refresh-token' });

    expect(sessionRepo._all[0].revokedAt).not.toBeNull();
  });

  it('throws SessionNotFoundError for an unknown refresh token', async () => {
    const revokeSession = makeRevokeSession({ sessionRepo: makeFakeSessionRepository(), tokenIssuer: makeTokenIssuer() });

    await expect(revokeSession({ refreshToken: 'unknown' })).rejects.toThrow(SessionNotFoundError);
  });
});
```

- [ ] **Step 11b: Run test to verify it fails**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest revoke-session.use-case --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 12: Implement revoke-session use-case**

`core/service-identity/src/application/use-cases/revoke-session/revoke-session.use-case.js`:

```js
import { SessionNotFoundError } from '../../../domain/errors/session-not-found.error.js';

export const makeRevokeSession = ({ sessionRepo, tokenIssuer }) => {
  return async ({ refreshToken }) => {
    const refreshTokenHash = tokenIssuer.hashRefreshToken(refreshToken);
    const session = await sessionRepo.findByRefreshTokenHash(refreshTokenHash);

    if (!session || session.revokedAt) {
      throw new SessionNotFoundError();
    }

    await sessionRepo.revoke(session.id);
  };
};
```

- [ ] **Step 13: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest revoke-session.use-case --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 14: Run the entire core/service-identity test suite**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npx jest core/service-identity --no-coverage
```

Expected: all suites PASS (password-policy + 4 use-cases, 17 tests total)

- [ ] **Step 15: Commit**

```bash
git add core/service-identity/src/application core/service-identity/test
git commit -m "feat(identity-core): add register/login/refresh/revoke use-cases"
```

---

## Task 11: `core/service-identity` — HTTP error translation

**Files:**
- Create: `core/service-identity/src/interfaces/http/translate-domain-error.js`

- [ ] **Step 1: Write the implementation**

This maps domain errors to the `@pdf-reader/errors` HTTP error classes, keeping the domain itself HTTP-agnostic. No dedicated unit test — it's a 3-branch pure mapping function fully exercised by the `auth.e2e.test.js` in Task 12.

`core/service-identity/src/interfaces/http/translate-domain-error.js`:

```js
import { ConflictError, UnauthorizedError, NotFoundError } from '@pdf-reader/errors';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error.js';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error.js';
import { SessionNotFoundError } from '../../domain/errors/session-not-found.error.js';

export const translateDomainError = (err) => {
  if (err instanceof EmailAlreadyRegisteredError) {
    return new ConflictError(err.message);
  }
  if (err instanceof InvalidCredentialsError) {
    return new UnauthorizedError(err.message);
  }
  if (err instanceof SessionNotFoundError) {
    return new NotFoundError(err.message);
  }
  return err;
};
```

- [ ] **Step 2: Commit**

```bash
git add core/service-identity/src/interfaces
git commit -m "feat(identity-core): add domain-to-HTTP error translation"
```

---

## Task 12: `services/pdf-service-identity` — infrastructure (Postgres repositories)

**Files:**
- Create: `services/pdf-service-identity/package.json`
- Create: `services/pdf-service-identity/configs/app-config.js`
- Create: `services/pdf-service-identity/src/infrastructure/persistence/db.js`
- Create: `services/pdf-service-identity/src/infrastructure/persistence/user.repository.js`
- Create: `services/pdf-service-identity/src/infrastructure/persistence/session.repository.js`
- Create: `test/services/identity/integration/config/db-setup.js`
- Create: `test/services/identity/integration/user.repository.integration.test.js`
- Create: `test/services/identity/integration/session.repository.integration.test.js`

- [ ] **Step 1: Create service package.json**

```json
{
  "name": "@pdf-reader/service-identity",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js"
  },
  "dependencies": {
    "@pdf-reader/config": "*",
    "@pdf-reader/core-service-identity": "*",
    "@pdf-reader/errors": "*",
    "@pdf-reader/helper": "*",
    "@pdf-reader/middlewares": "*",
    "bcryptjs": "^2.4.3",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.12.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write app-config.js**

`services/pdf-service-identity/configs/app-config.js`:

```js
import { requireEnv } from '@pdf-reader/config';

export const getAppConfig = () => ({
  port: Number(requireEnv('IDENTITY_PORT', '3001')),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtAccessTtl: requireEnv('JWT_ACCESS_TTL', '15m'),
  refreshTtlMs: 1000 * 60 * 60 * 24 * 30,
});
```

- [ ] **Step 3: Write the Postgres pool factory**

`services/pdf-service-identity/src/infrastructure/persistence/db.js`:

```js
import pg from 'pg';

const { Pool } = pg;

export const makePool = ({ connectionString }) => new Pool({ connectionString });
```

- [ ] **Step 4: Write the user repository**

`services/pdf-service-identity/src/infrastructure/persistence/user.repository.js`:

```js
const rowToUser = (row) => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  name: row.name,
  locale: row.locale,
  createdAt: row.created_at,
});

export const makeUserRepository = ({ pool }) => ({
  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async create({ email, passwordHash, name, locale }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, locale)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, passwordHash, name, locale],
    );
    return rowToUser(rows[0]);
  },
});
```

- [ ] **Step 5: Write the session repository**

`services/pdf-service-identity/src/infrastructure/persistence/session.repository.js`:

```js
const rowToSession = (row) => ({
  id: row.id,
  userId: row.user_id,
  refreshTokenHash: row.refresh_token_hash,
  userAgent: row.user_agent,
  ip: row.ip,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
});

export const makeSessionRepository = ({ pool }) => ({
  async create({ userId, refreshTokenHash, userAgent, ip, expiresAt }) {
    const { rows } = await pool.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, refreshTokenHash, userAgent ?? null, ip ?? null, expiresAt],
    );
    return rowToSession(rows[0]);
  },

  async findByRefreshTokenHash(hash) {
    const { rows } = await pool.query('SELECT * FROM sessions WHERE refresh_token_hash = $1', [hash]);
    return rows[0] ? rowToSession(rows[0]) : null;
  },

  async revoke(sessionId) {
    await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
  },
});
```

- [ ] **Step 6: Write the integration test DB setup helper**

`test/services/identity/integration/config/db-setup.js`:

```js
import pg from 'pg';

const { Pool } = pg;

export const makeTestPool = () =>
  new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader' });

export const truncateAll = async (pool) => {
  await pool.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
};
```

- [ ] **Step 7: Write the failing integration test for user repository**

`test/services/identity/integration/user.repository.integration.test.js`:

```js
import { makeUserRepository } from '../../../../services/pdf-service-identity/src/infrastructure/persistence/user.repository.js';
import { makeTestPool, truncateAll } from './config/db-setup.js';

describe('user.repository (integration)', () => {
  const pool = makeTestPool();
  const userRepo = makeUserRepository({ pool });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates and finds a user by email', async () => {
    await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });

    const found = await userRepo.findByEmail('a@b.com');

    expect(found.email).toBe('a@b.com');
    expect(found.name).toBe('Ada');
    expect(found.id).toBeDefined();
  });

  it('returns null for an unknown email', async () => {
    const found = await userRepo.findByEmail('nobody@b.com');
    expect(found).toBeNull();
  });

  it('finds a user by id', async () => {
    const created = await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });

    const found = await userRepo.findById(created.id);

    expect(found.email).toBe('a@b.com');
  });
});
```

- [ ] **Step 7b: Run test to verify it fails (or errors — DB not migrated yet is fine, just confirm it doesn't false-pass)**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest test/services/identity/integration/user.repository --no-coverage
```

Expected: FAIL — module not found (repository file doesn't exist as an integration test target path yet — this confirms the test file itself runs and fails meaningfully, not silently passing).

- [ ] **Step 8: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest test/services/identity/integration/user.repository --no-coverage
```

Expected: PASS (3 tests) — requires Postgres running with the schema loaded (Task 8).

- [ ] **Step 9: Write and run the session repository integration test**

`test/services/identity/integration/session.repository.integration.test.js`:

```js
import { makeUserRepository } from '../../../../services/pdf-service-identity/src/infrastructure/persistence/user.repository.js';
import { makeSessionRepository } from '../../../../services/pdf-service-identity/src/infrastructure/persistence/session.repository.js';
import { makeTestPool, truncateAll } from './config/db-setup.js';

describe('session.repository (integration)', () => {
  const pool = makeTestPool();
  const userRepo = makeUserRepository({ pool });
  const sessionRepo = makeSessionRepository({ pool });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a session and finds it by refresh token hash', async () => {
    const user = await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await sessionRepo.create({ userId: user.id, refreshTokenHash: 'hash-1', userAgent: 'jest', ip: '127.0.0.1', expiresAt });
    const found = await sessionRepo.findByRefreshTokenHash('hash-1');

    expect(found.userId).toBe(user.id);
    expect(found.revokedAt).toBeNull();
  });

  it('revokes a session', async () => {
    const user = await userRepo.create({ email: 'a@b.com', passwordHash: 'hash', name: 'Ada', locale: 'tr' });
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    const session = await sessionRepo.create({ userId: user.id, refreshTokenHash: 'hash-1', expiresAt });

    await sessionRepo.revoke(session.id);
    const found = await sessionRepo.findByRefreshTokenHash('hash-1');

    expect(found.revokedAt).not.toBeNull();
  });
});
```

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest test/services/identity/integration/session.repository --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add services/pdf-service-identity/package.json services/pdf-service-identity/configs services/pdf-service-identity/src/infrastructure test/services/identity/integration
git commit -m "feat(identity-service): add Postgres user/session repositories"
```

---

## Task 13: `services/pdf-service-identity` — HTTP layer, container, boot, main

**Files:**
- Create: `services/pdf-service-identity/src/interfaces/http/auth-token.js`
- Create: `services/pdf-service-identity/src/interfaces/http/auth.controller.js`
- Create: `services/pdf-service-identity/src/interfaces/http/routes.js`
- Create: `services/pdf-service-identity/src/container.js`
- Create: `services/pdf-service-identity/src/boot.js`
- Create: `services/pdf-service-identity/main.js`
- Create: `services/pdf-service-identity/ecosystem.config.js`
- Create: `test/services/identity/integration/auth.e2e.test.js`

- [ ] **Step 1: Write the JWT + hashing token issuer**

`services/pdf-service-identity/src/interfaces/http/auth-token.js`:

```js
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
```

Note: this file is ESM (`"type": "module"`), so `bcryptjs` is imported via its ESM-compatible default export — never use `require()` here.

- [ ] **Step 2: Write the auth controller**

`services/pdf-service-identity/src/interfaces/http/auth.controller.js`:

```js
import { z } from 'zod';
import { translateDomainError } from '@pdf-reader/core-service-identity/src/interfaces/http/translate-domain-error.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const toPublicUser = (user) => ({ id: user.id, email: user.email, name: user.name, locale: user.locale });

export const makeAuthController = ({ registerUser, loginUser, refreshSession, revokeSession }) => ({
  register: async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      const user = await registerUser(input);
      res.status(201).json({ user: toPublicUser(user) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  login: async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await loginUser({
        ...input,
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip,
      });
      res.status(200).json({ user: toPublicUser(user), accessToken, refreshToken });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  refresh: async (req, res, next) => {
    try {
      const input = refreshSchema.parse(req.body);
      const { accessToken, user } = await refreshSession(input);
      res.status(200).json({ accessToken, user: toPublicUser(user) });
    } catch (err) {
      next(translateDomainError(err));
    }
  },

  logout: async (req, res, next) => {
    try {
      const input = refreshSchema.parse(req.body);
      await revokeSession(input);
      res.status(204).send();
    } catch (err) {
      next(translateDomainError(err));
    }
  },
});
```

- [ ] **Step 3: Write the routes**

`services/pdf-service-identity/src/interfaces/http/routes.js`:

```js
import { Router } from 'express';

export const makeAuthRoutes = ({ authController }) => {
  const router = Router();

  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.post('/refresh', authController.refresh);
  router.post('/logout', authController.logout);

  return router;
};
```

- [ ] **Step 4: Write the composition root**

`services/pdf-service-identity/src/container.js`:

```js
import { makeRegisterUser } from '@pdf-reader/core-service-identity/src/application/use-cases/register-user/register-user.use-case.js';
import { makeLoginUser } from '@pdf-reader/core-service-identity/src/application/use-cases/login-user/login-user.use-case.js';
import { makeRefreshSession } from '@pdf-reader/core-service-identity/src/application/use-cases/refresh-session/refresh-session.use-case.js';
import { makeRevokeSession } from '@pdf-reader/core-service-identity/src/application/use-cases/revoke-session/revoke-session.use-case.js';
import { makePool } from './infrastructure/persistence/db.js';
import { makeUserRepository } from './infrastructure/persistence/user.repository.js';
import { makeSessionRepository } from './infrastructure/persistence/session.repository.js';
import { makeTokenIssuer, makeHasher } from './interfaces/http/auth-token.js';
import { makeAuthController } from './interfaces/http/auth.controller.js';

export const buildContainer = (config) => {
  const pool = makePool({ connectionString: config.databaseUrl });
  const userRepo = makeUserRepository({ pool });
  const sessionRepo = makeSessionRepository({ pool });
  const hasher = makeHasher();
  const tokenIssuer = makeTokenIssuer({ jwtAccessSecret: config.jwtAccessSecret, jwtAccessTtl: config.jwtAccessTtl });
  const clock = { now: () => new Date() };

  const registerUser = makeRegisterUser({ userRepo, hasher });
  const loginUser = makeLoginUser({ userRepo, sessionRepo, hasher, tokenIssuer, clock, refreshTtlMs: config.refreshTtlMs });
  const refreshSession = makeRefreshSession({ userRepo, sessionRepo, tokenIssuer, clock });
  const revokeSession = makeRevokeSession({ sessionRepo, tokenIssuer });

  const authController = makeAuthController({ registerUser, loginUser, refreshSession, revokeSession });

  return { pool, authController };
};
```

- [ ] **Step 5: Write boot.js**

`services/pdf-service-identity/src/boot.js`:

```js
import express from 'express';
import { jsonBody, notFound } from '@pdf-reader/middlewares';
import { handleErrors } from '@pdf-reader/errors';
import { makeAuthRoutes } from './interfaces/http/routes.js';
import { buildContainer } from './container.js';

export const boot = (config) => {
  const container = buildContainer(config);
  const app = express();

  app.use(jsonBody());
  app.use('/api/auth', makeAuthRoutes({ authController: container.authController }));
  app.use(notFound());
  app.use(handleErrors);

  return { app, pool: container.pool };
};
```

- [ ] **Step 6: Write main.js**

`services/pdf-service-identity/main.js`:

```js
import { loadEnv } from '@pdf-reader/config';
import { makeLogger } from '@pdf-reader/helper';
import { getAppConfig } from './configs/app-config.js';
import { boot } from './src/boot.js';

loadEnv();
const config = getAppConfig();
const logger = makeLogger({ serviceName: 'pdf-service-identity' });
const { app } = boot(config);

app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});
```

- [ ] **Step 7: Write ecosystem.config.js**

`services/pdf-service-identity/ecosystem.config.js`:

```js
export default {
  apps: [
    {
      name: 'pdf-service-identity',
      script: './main.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
```

- [ ] **Step 8: Write the failing e2e test**

`test/services/identity/integration/auth.e2e.test.js`:

```js
import request from 'supertest';
import { boot } from '../../../../services/pdf-service-identity/src/boot.js';
import { truncateAll } from './config/db-setup.js';

const testConfig = {
  port: 0,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader',
  jwtAccessSecret: 'test-secret',
  jwtAccessTtl: '15m',
  refreshTtlMs: 1000 * 60 * 60 * 24 * 30,
};

describe('auth HTTP API (e2e)', () => {
  const { app, pool } = boot(testConfig);

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registers a user', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('a@b.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate registration with 409', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada2' });

    expect(res.status).toBe(409);
  });

  it('logs in and returns access + refresh tokens', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'abcd1234' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects login with wrong password with 401', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });

    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrong1234' });

    expect(res.status).toBe(401);
  });

  it('refreshes an access token using a valid refresh token', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'abcd1234' });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: loginRes.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects refresh with an unknown token with 404', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });

    expect(res.status).toBe(404);
  });

  it('logs out and then rejects reuse of the same refresh token', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abcd1234', name: 'Ada' });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'abcd1234' });

    const logoutRes = await request(app).post('/api/auth/logout').send({ refreshToken: loginRes.body.refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: loginRes.body.refreshToken });
    expect(refreshRes.status).toBe(404);
  });
});
```

- [ ] **Step 9: Add `supertest` as a root devDependency and install everything**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npm install --save-dev supertest
npm install
```

Expected: no errors; `node_modules` populated across all workspaces.

- [ ] **Step 9b: Run test against Postgres before it's up, to confirm the test suite itself is wired correctly**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml down
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest test/services/identity/integration/auth.e2e --no-coverage
```

Expected: FAIL — connection refused (Postgres is down). This confirms the e2e test actually exercises the real `boot()`'d app and a real DB connection, not a mock.

- [ ] **Step 10: Run test to verify it passes**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest test/services/identity/integration/auth.e2e --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 11: Manually smoke-test the running server**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader/services/pdf-service-identity
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader \
JWT_ACCESS_SECRET=dev-secret \
JWT_REFRESH_SECRET=dev-secret \
IDENTITY_PORT=3001 \
node main.js &
sleep 1
curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.com","password":"abcd1234","name":"Smoke Test"}'
kill %1
```

Expected: JSON response `{"user":{"id":"...","email":"smoke@test.com","name":"Smoke Test","locale":"tr"}}`, HTTP 201.

- [ ] **Step 12: Commit**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
git add services/pdf-service-identity test/services/identity/integration/auth.e2e.test.js package.json package-lock.json
git commit -m "feat(identity-service): add HTTP layer, container, boot, main — full register/login/refresh/logout flow"
```

---

## Task 14: Jest workspace configuration (unit vs integration projects)

**Files:**
- Create: `jest.config.js`

This task exists because Task 1's `test:unit` / `test:integration` scripts reference Jest "projects" that don't exist until this config is written. Doing it last (after all test files exist) avoids guessing file patterns blind.

- [ ] **Step 1: Write jest.config.js**

```js
export default {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testPathIgnorePatterns: ['/node_modules/', '/test/services/.*/integration/'],
      testMatch: ['**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['**/test/services/**/integration/**/*.test.js'],
    },
  ],
};
```

- [ ] **Step 2: Run the unit project and verify it excludes integration tests**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
npm run test:unit
```

Expected: PASS, and the output does NOT mention `auth.e2e`, `user.repository.integration`, or `session.repository.integration` (those only run under `test:integration`).

- [ ] **Step 3: Run the integration project**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npm run test:integration
```

Expected: PASS — all 12 integration tests (3 user repo + 2 session repo + 7 e2e).

- [ ] **Step 4: Run the full suite one more time to confirm everything is green together**

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest --no-coverage
```

Expected: PASS, all projects, no failures.

- [ ] **Step 5: Commit**

```bash
git add jest.config.js
git commit -m "chore: configure Jest unit/integration projects"
```

---

## Verification (end of phase 1)

```bash
cd /Users/emrullah/developer/fullStack/pdf_reader

# 1. Lint clean
npm run lint

# 2. Full test suite green
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader npx jest --no-coverage

# 3. Server boots and responds
cd services/pdf-service-identity
DATABASE_URL=postgres://pdf_reader:pdf_reader@localhost:5432/pdf_reader \
JWT_ACCESS_SECRET=dev-secret JWT_REFRESH_SECRET=dev-secret IDENTITY_PORT=3001 \
node main.js &
sleep 1
curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"verify@test.com","password":"abcd1234","name":"Verify"}' | grep -q '"email":"verify@test.com"' \
  && echo "REGISTER OK"
curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"verify@test.com","password":"abcd1234"}' | grep -q 'accessToken' \
  && echo "LOGIN OK"
kill %1
```

Expected: lint clean, all Jest projects green, both `REGISTER OK` and `LOGIN OK` printed.

**Not covered by this phase (deferred to phase 2+):** gateway service, service-discovery/Redis, `document` and `conversion` services, frontend, `.wolf/` AI memory layer, `docker-compose.e2e.yml`. These are separate plans per the phased approach.
