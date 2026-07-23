# CI Ephemeral Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-secret GitHub Actions gate that builds GreenHome Kitchen, starts a disposable MongoDB replica set, verifies SL-001 and SL-002, runs the built application, and uploads HTTP/browser evidence on every pull request and push to `main`.

**Architecture:** Repository scripts own fixture safety and live HTTP assertions, while GitHub Actions owns disposable infrastructure, job-only secrets, process orchestration, and artifact upload. An official MongoDB 8 image runs as a single-node replica set; Express and Vite preview run on loopback; Playwright supplies a minimal browser check. Nothing is deployed or persisted after the runner exits.

**Tech Stack:** GitHub Actions, Node.js 22, npm, MongoDB 8 replica set, Express, Vite, Node test runner, Playwright 1.61.1, Docker on `ubuntu-latest`.

## Global Constraints

- This is CI with ephemeral staging, not continuous deployment and not a persistent staging URL.
- Use branch `ci/ephemeral-staging`; do not use a `codex/` branch name.
- Use `MONGODB_URI=mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0`.
- Reject `NODE_ENV=production`, non-loopback MongoDB hosts, and any database name other than `greenhome_kitchen`.
- Never call `dropDatabase`; the disposable container is the cleanup boundary.
- Generate credentials inside the job, mask them, and never print or upload them.
- Keep PayOS unconfigured, use `MAIL_PROVIDER=fake`, and make no external carrier or evidence-scanner request.
- Run the three migrations twice to prove idempotency before application startup.
- Keep required gates fail-closed; do not use `continue-on-error`.
- Upload diagnostic artifacts with `if: always()` and seven-day retention.
- Pin third-party workflow dependencies to immutable commit or image digests.
- Do not modify or stage files from the dirty root checkout.

---

### Task 1: Add the safe CI actor fixture

**Files:**
- Create: `server/src/scripts/ciEphemeralActors.js`
- Create: `server/src/scripts/ciEphemeralActors.test.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `MONGODB_URI`, `NODE_ENV`, `CI_EPHEMERAL_CONFIRM`, and `CI_STAGING_PASSWORD`.
- Produces: `assertSafeCiTarget(options)`, `prepareCiActors(options)`, the canonical three actor emails, and the `npm run ci:actors` command used by the workflow.

- [ ] **Step 1: Write the failing safety and contract tests**

Create `server/src/scripts/ciEphemeralActors.test.js`:

```js
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  ACTORS,
  CONFIRMATION,
  assertSafeCiTarget,
} = require('./ciEphemeralActors');

describe('CI ephemeral actor fixture', () => {
  it('accepts only the confirmed loopback greenhome_kitchen database outside production', () => {
    assert.doesNotThrow(() => assertSafeCiTarget({
      nodeEnv: 'test',
      mongoUri: 'mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0',
      confirmation: CONFIRMATION,
    }));
  });

  it('rejects production, a missing confirmation, a remote host, and a different database', () => {
    const base = {
      nodeEnv: 'test',
      mongoUri: 'mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0',
      confirmation: CONFIRMATION,
    };
    assert.throws(() => assertSafeCiTarget({ ...base, nodeEnv: 'production' }), /production/i);
    assert.throws(() => assertSafeCiTarget({ ...base, confirmation: '' }), /CI_EPHEMERAL_CONFIRM/i);
    assert.throws(
      () => assertSafeCiTarget({ ...base, mongoUri: 'mongodb://db.example/greenhome_kitchen' }),
      /loopback/i
    );
    assert.throws(
      () => assertSafeCiTarget({ ...base, mongoUri: 'mongodb://127.0.0.1/greenhome_staging' }),
      /greenhome_kitchen/i
    );
  });

  it('declares exactly the actors required by SL-001 and live role smoke checks', () => {
    assert.deepEqual(
      ACTORS.map(({ roleName, email }) => ({ roleName, email })),
      [
        { roleName: 'Customer', email: 'khachhang@greenhome.test' },
        { roleName: 'Staff', email: 'nhanvien@greenhome.test' },
        { roleName: 'WarehouseManager', email: 'quanlykho@greenhome.test' },
      ]
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
cd server
node --test src/scripts/ciEphemeralActors.test.js
```

Expected: exit code `1` with `MODULE_NOT_FOUND` for `./ciEphemeralActors`.

- [ ] **Step 3: Implement the guarded actor fixture**

Create `server/src/scripts/ciEphemeralActors.js`:

```js
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const { seedRoles } = require('../config/seedRoles');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const { hashPassword } = require('../utils/password');

const CONFIRMATION = 'CI-EPHEMERAL-STAGING';
const ACTORS = Object.freeze([
  Object.freeze({
    roleName: 'Customer',
    fullName: 'CI Customer',
    email: 'khachhang@greenhome.test',
    phone: '0902900101',
  }),
  Object.freeze({
    roleName: 'Staff',
    fullName: 'CI Staff',
    email: 'nhanvien@greenhome.test',
    phone: '0902900102',
  }),
  Object.freeze({
    roleName: 'WarehouseManager',
    fullName: 'CI Warehouse',
    email: 'quanlykho@greenhome.test',
    phone: '0902900103',
  }),
]);

function assertSafeCiTarget({
  nodeEnv = process.env.NODE_ENV,
  mongoUri = process.env.MONGODB_URI,
  confirmation = process.env.CI_EPHEMERAL_CONFIRM,
} = {}) {
  if (nodeEnv === 'production') {
    throw new Error('CI ephemeral actor fixture is disabled in production');
  }
  if (confirmation !== CONFIRMATION) {
    throw new Error(`Set CI_EPHEMERAL_CONFIRM=${CONFIRMATION}`);
  }
  const uri = String(mongoUri || '');
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(uri)) {
    throw new Error('CI ephemeral actor fixture requires a loopback MongoDB host');
  }
  if (!/^mongodb:\/\/[^/]+\/greenhome_kitchen(?:\?|$)/i.test(uri)) {
    throw new Error('CI ephemeral actor fixture requires the greenhome_kitchen database');
  }
}

async function prepareCiActors({
  password = process.env.CI_STAGING_PASSWORD,
  seed = seedRoles,
  roleModel = Role,
  userModel = User,
  passwordHasher = hashPassword,
} = {}) {
  assertSafeCiTarget();
  if (String(password || '').length < 12) {
    throw new Error('CI_STAGING_PASSWORD must contain at least 12 characters');
  }

  await seed();
  const roles = await roleModel.find({
    roleName: { $in: ACTORS.map((actor) => actor.roleName) },
  }).lean();
  const roleByName = new Map(roles.map((role) => [role.roleName, role]));
  const missing = ACTORS.find((actor) => !roleByName.has(actor.roleName));
  if (missing) throw new Error(`Missing required role ${missing.roleName}`);

  const passwordHash = await passwordHasher(password);
  const actorIds = {};
  for (const actor of ACTORS) {
    const user = await userModel.findOneAndUpdate(
      { email: actor.email },
      {
        $set: {
          fullName: actor.fullName,
          email: actor.email,
          phone: actor.phone,
          address: 'CI ephemeral staging only',
          passwordHash,
          roleId: roleByName.get(actor.roleName)._id,
          status: 'Active',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    actorIds[actor.roleName] = String(user._id);
  }

  return {
    actorCount: ACTORS.length,
    actors: ACTORS.map((actor) => ({
      roleName: actor.roleName,
      email: actor.email,
      id: actorIds[actor.roleName],
    })),
  };
}

async function runCli() {
  require('dotenv').config();
  assertSafeCiTarget();
  await connectDatabase();
  try {
    const result = await prepareCiActors();
    console.log(JSON.stringify(result));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  ACTORS,
  CONFIRMATION,
  assertSafeCiTarget,
  prepareCiActors,
};
```

Add this script to `server/package.json`:

```json
"ci:actors": "node src/scripts/ciEphemeralActors.js"
```

- [ ] **Step 4: Run the focused and full backend tests**

Run:

```powershell
cd server
node --test src/scripts/ciEphemeralActors.test.js
npm test
```

Expected: focused tests report `3` passed and `0` failed; the full suite exits `0`.

- [ ] **Step 5: Commit Task 1**

```powershell
git add server/package.json server/src/scripts/ciEphemeralActors.js server/src/scripts/ciEphemeralActors.test.js
git commit -m "test(ci): add guarded ephemeral actors"
```

---

### Task 2: Add the live HTTP smoke verifier

**Files:**
- Create: `server/src/scripts/verifyEphemeralHttp.js`
- Create: `server/src/scripts/verifyEphemeralHttp.test.js`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `CI_API_BASE_URL`, `CI_FRONTEND_URL`, `CI_STAGING_PASSWORD`, and the actors from Task 1.
- Produces: `runEphemeralHttpSmoke(options)`, a redacted `smoke-report.json`, and `npm run verify:ephemeral-http`.

- [ ] **Step 1: Write failing tests for success, redaction, and failed-step reporting**

Create `server/src/scripts/verifyEphemeralHttp.test.js` with a fake fetcher that
returns the expected sequence of frontend, health, CORS, unauthenticated,
login, role endpoint, and cross-role responses:

```js
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { runEphemeralHttpSmoke } = require('./verifyEphemeralHttp');

function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    async json() { return body; },
    async text() { return String(body); },
  };
}

describe('ephemeral HTTP smoke verifier', () => {
  it('records successful live checks without tokens or passwords', async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (url === 'http://front/') return response(200, '<div id="root"></div>');
      if (url === 'http://api/health' && !options.headers?.Origin) {
        return response(200, { success: true, data: null, requestId: 'health-id' });
      }
      if (url === 'http://api/health' && options.headers?.Origin === 'http://front') {
        return response(200, { success: true }, { 'access-control-allow-origin': 'http://front' });
      }
      if (url === 'http://api/health' && options.headers?.Origin === 'https://evil.example') {
        return response(200, { success: true });
      }
      if (url === 'http://api/profile' && !options.headers?.Authorization) {
        return response(401, { success: false, errorCode: 'AUTH_TOKEN_MISSING' });
      }
      if (url.endsWith('/auth/login')) {
        const role = JSON.parse(options.body).email.startsWith('khachhang')
          ? 'Customer'
          : JSON.parse(options.body).email.startsWith('nhanvien')
            ? 'Staff'
            : 'WarehouseManager';
        return response(200, {
          success: true,
          data: { token: `token-${role}`, user: { role: { id: `role-${role}`, roleName: role } } },
        });
      }
      if (url.endsWith('/orders/my')) return response(200, { success: true, data: [] });
      if (url.endsWith('/staff/orders') && options.headers?.Authorization === 'Bearer token-Customer') {
        return response(403, { success: false, errorCode: 'FORBIDDEN' });
      }
      if (url.endsWith('/staff/orders')) return response(200, { success: true, data: [] });
      if (url.endsWith('/warehouse/inventory')) return response(200, { success: true, data: [] });
      throw new Error(`Unexpected request ${url}`);
    };

    const report = await runEphemeralHttpSmoke({
      fetcher,
      apiBaseUrl: 'http://api',
      frontendUrl: 'http://front',
      password: 'not-recorded-password',
      now: (() => {
        let value = 0;
        return () => value++;
      })(),
    });

    assert.equal(report.outcome, 'passed');
    assert.equal(report.steps.every((step) => step.outcome === 'passed'), true);
    assert.equal(JSON.stringify(report).includes('not-recorded-password'), false);
    assert.equal(JSON.stringify(report).includes('token-Customer'), false);
    assert.equal(calls.length > 8, true);
  });

  it('records the failed step and rethrows without leaking credentials', async () => {
    try {
      await runEphemeralHttpSmoke({
        fetcher: async () => response(500, { success: false }),
        apiBaseUrl: 'http://api',
        frontendUrl: 'http://front',
        password: 'not-recorded-password',
      });
      assert.fail('Expected the smoke verifier to reject');
    } catch (error) {
      assert.match(error.message, /frontend root/i);
      assert.equal(error.report.outcome, 'failed');
      assert.equal(error.report.steps[0].name, 'frontend root');
      assert.equal(JSON.stringify(error.report).includes('not-recorded-password'), false);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
cd server
node --test src/scripts/verifyEphemeralHttp.test.js
```

Expected: exit code `1` with `MODULE_NOT_FOUND` for `./verifyEphemeralHttp`.

- [ ] **Step 3: Implement the verifier and redacted report**

Create `server/src/scripts/verifyEphemeralHttp.js`. The implementation must:

```js
const fs = require('node:fs/promises');
const path = require('node:path');

const ACTORS = [
  { roleName: 'Customer', email: 'khachhang@greenhome.test', endpoint: '/orders/my' },
  { roleName: 'Staff', email: 'nhanvien@greenhome.test', endpoint: '/staff/orders' },
  { roleName: 'WarehouseManager', email: 'quanlykho@greenhome.test', endpoint: '/warehouse/inventory' },
];

function assertStatus(response, expected, name) {
  if (response.status !== expected) {
    throw new Error(`${name} expected HTTP ${expected}, received ${response.status}`);
  }
}

async function readJson(response, name) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${name} returned non-JSON content`);
  }
}

async function runEphemeralHttpSmoke({
  fetcher = fetch,
  apiBaseUrl = process.env.CI_API_BASE_URL,
  frontendUrl = process.env.CI_FRONTEND_URL,
  password = process.env.CI_STAGING_PASSWORD,
  now = Date.now,
} = {}) {
  if (!apiBaseUrl || !frontendUrl) throw new Error('CI_API_BASE_URL and CI_FRONTEND_URL are required');
  if (String(password || '').length < 12) throw new Error('CI_STAGING_PASSWORD is required');

  const report = { outcome: 'running', startedAt: new Date().toISOString(), steps: [] };
  async function step(name, operation) {
    const started = now();
    try {
      const metadata = await operation();
      report.steps.push({ name, outcome: 'passed', durationMs: now() - started, ...metadata });
      return metadata;
    } catch (error) {
      report.steps.push({ name, outcome: 'failed', durationMs: now() - started, error: error.message });
      report.outcome = 'failed';
      const wrapped = new Error(`${name}: ${error.message}`);
      wrapped.report = report;
      throw wrapped;
    }
  }

  const frontendOrigin = new URL(frontendUrl).origin;
  await step('frontend root', async () => {
    const response = await fetcher(`${frontendUrl.replace(/\/$/, '')}/`);
    assertStatus(response, 200, 'frontend root');
    const html = await response.text();
    if (!html.includes('id="root"')) throw new Error('React root markup is missing');
    return { httpStatus: response.status };
  });

  await step('API health', async () => {
    const response = await fetcher(`${apiBaseUrl}/health`);
    assertStatus(response, 200, 'API health');
    const payload = await readJson(response, 'API health');
    if (payload.success !== true) throw new Error('success must be true');
    return { httpStatus: response.status, requestId: payload.requestId || null };
  });

  await step('allowed CORS origin', async () => {
    const response = await fetcher(`${apiBaseUrl}/health`, { headers: { Origin: frontendOrigin } });
    assertStatus(response, 200, 'allowed CORS origin');
    if (response.headers.get('access-control-allow-origin') !== frontendOrigin) {
      throw new Error('allow-origin header does not match the frontend origin');
    }
    return { httpStatus: response.status };
  });

  await step('untrusted CORS origin', async () => {
    const response = await fetcher(`${apiBaseUrl}/health`, { headers: { Origin: 'https://evil.example' } });
    assertStatus(response, 200, 'untrusted CORS origin');
    if (response.headers.get('access-control-allow-origin')) {
      throw new Error('untrusted origin received an allow-origin header');
    }
    return { httpStatus: response.status };
  });

  await step('unauthenticated boundary', async () => {
    const response = await fetcher(`${apiBaseUrl}/profile`);
    assertStatus(response, 401, 'unauthenticated boundary');
    const payload = await readJson(response, 'unauthenticated boundary');
    if (payload.errorCode !== 'AUTH_TOKEN_MISSING') throw new Error('unexpected auth error code');
    return { httpStatus: response.status, requestId: payload.requestId || null };
  });

  const tokens = new Map();
  for (const actor of ACTORS) {
    await step(`${actor.roleName} login and role endpoint`, async () => {
      const login = await fetcher(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: actor.email, password }),
      });
      assertStatus(login, 200, `${actor.roleName} login`);
      const loginPayload = await readJson(login, `${actor.roleName} login`);
      if (loginPayload.data?.user?.role?.roleName !== actor.roleName || !loginPayload.data?.token) {
        throw new Error('login role or token is invalid');
      }
      tokens.set(actor.roleName, loginPayload.data.token);
      const protectedResponse = await fetcher(`${apiBaseUrl}${actor.endpoint}`, {
        headers: { Authorization: `Bearer ${loginPayload.data.token}` },
      });
      assertStatus(protectedResponse, 200, `${actor.roleName} role endpoint`);
      return { httpStatus: protectedResponse.status };
    });
  }

  await step('cross-role denial', async () => {
    const response = await fetcher(`${apiBaseUrl}/staff/orders`, {
      headers: { Authorization: `Bearer ${tokens.get('Customer')}` },
    });
    assertStatus(response, 403, 'cross-role denial');
    return { httpStatus: response.status };
  });

  report.outcome = 'passed';
  report.finishedAt = new Date().toISOString();
  return report;
}

async function runCli() {
  const reportPath = path.resolve(
    process.cwd(),
    '..',
    'artifacts',
    'ephemeral-staging',
    'smoke-report.json'
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  try {
    const report = await runEphemeralHttpSmoke();
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`HTTP smoke passed with ${report.steps.length} checks`);
  } catch (error) {
    const report = error.report || {
      outcome: 'failed',
      startedAt: new Date().toISOString(),
      steps: [{ name: 'initialization', outcome: 'failed', error: error.message }],
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw error;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { ACTORS, runEphemeralHttpSmoke };
```

Add to `server/package.json`:

```json
"verify:ephemeral-http": "node src/scripts/verifyEphemeralHttp.js"
```

- [ ] **Step 4: Run focused and full backend tests**

```powershell
cd server
node --test src/scripts/verifyEphemeralHttp.test.js
npm test
```

Expected: focused tests report `2` passed and `0` failed; full backend tests exit `0`.
The full backend total is `428` passed and `0` failed after Tasks 1 and 2.

- [ ] **Step 5: Commit Task 2**

```powershell
git add server/package.json server/src/scripts/verifyEphemeralHttp.js server/src/scripts/verifyEphemeralHttp.test.js
git commit -m "test(ci): add live ephemeral HTTP smoke"
```

---

### Task 3: Add the minimal Playwright browser smoke

**Files:**
- Modify: `.gitignore`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Create: `client/playwright.config.js`
- Create: `client/e2e/ephemeral-staging.spec.js`

**Interfaces:**
- Consumes: `CI_FRONTEND_URL`, `CI_STAGING_PASSWORD`, and the Customer actor created by Task 1.
- Produces: `npm run test:ephemeral-browser`, screenshots, browser console logs, traces on failure, and an HTML report under `artifacts/ephemeral-staging`.

- [ ] **Step 1: Install the exact Playwright test dependency**

Run:

```powershell
cd client
npm install --save-dev --save-exact @playwright/test@1.61.1
```

Expected: `client/package.json` and `client/package-lock.json` contain version `1.61.1`.

- [ ] **Step 2: Add the Playwright config and browser test**

Add `/artifacts/` to the root `.gitignore`.

Create `client/playwright.config.js`:

```js
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const artifactRoot = path.resolve(process.cwd(), '..', 'artifacts', 'ephemeral-staging');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['line'],
    ['html', { outputFolder: path.join(artifactRoot, 'playwright-report'), open: 'never' }],
  ],
  outputDir: path.join(artifactRoot, 'playwright-results'),
  use: {
    baseURL: process.env.CI_FRONTEND_URL || 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
```

Create `client/e2e/ephemeral-staging.spec.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const artifactRoot = path.resolve(process.cwd(), '..', 'artifacts', 'ephemeral-staging');
const screenshotRoot = path.join(artifactRoot, 'screenshots');
const consoleEntries = [];

test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      url: page.url(),
    });
  });
});

test.afterAll(async () => {
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(
    path.join(artifactRoot, 'browser-console.json'),
    `${JSON.stringify(consoleEntries, null, 2)}\n`
  );
});

test('public home renders without an uncaught page error', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('Trang chủ GreenHome Kitchen')).toBeVisible();
  await fs.mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({ path: path.join(screenshotRoot, 'home.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
});

test('Customer can sign in and open order history', async ({ page }) => {
  const password = process.env.CI_STAGING_PASSWORD;
  expect(password?.length).toBeGreaterThanOrEqual(12);
  await page.goto('/login');
  await page.locator('#login-email').fill('khachhang@greenhome.test');
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('heading', { name: 'Lịch sử mua hàng' })).toBeVisible();
  await fs.mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({ path: path.join(screenshotRoot, 'customer-orders.png'), fullPage: true });
});
```

Add to `client/package.json`:

```json
"test:ephemeral-browser": "playwright test --config=playwright.config.js"
```

- [ ] **Step 3: Verify discovery before running against live services**

Run:

```powershell
cd client
npx playwright test --config=playwright.config.js --list
```

Expected: exactly `2 tests in 1 file` are listed.

- [ ] **Step 4: Run existing client tests and build**

```powershell
cd client
npm test
npm run build
```

Expected: `140` client tests pass, `0` fail, and Vite exits `0`. The existing bundle-size warning is non-blocking.

- [ ] **Step 5: Commit Task 3**

```powershell
git add .gitignore client/package.json client/package-lock.json client/playwright.config.js client/e2e/ephemeral-staging.spec.js
git commit -m "test(ci): add ephemeral browser smoke"
```

---

### Task 4: Assemble the zero-secret GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci-ephemeral-staging.yml`

**Interfaces:**
- Consumes: scripts from Tasks 1–3 and the existing migration/SL-001/SL-002 package commands.
- Produces: the required `CI and ephemeral staging` check on pull requests, pushes to `main`, and manual dispatches.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci-ephemeral-staging.yml`:

```yaml
name: CI and ephemeral staging

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ephemeral-staging-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      CI: 'true'
      NODE_ENV: test
      PORT: '5000'
      MONGODB_URI: mongodb://127.0.0.1:27017/greenhome_kitchen?replicaSet=rs0
      CORS_ORIGINS: http://127.0.0.1:4173
      APP_PUBLIC_URL: http://127.0.0.1:4173
      MAIL_PROVIDER: fake
      CI_EPHEMERAL_CONFIRM: CI-EPHEMERAL-STAGING
      CI_API_BASE_URL: http://127.0.0.1:5000/api
      CI_FRONTEND_URL: http://127.0.0.1:4173
      VITE_API_BASE_URL: http://127.0.0.1:5000/api

    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: |
            server/package-lock.json
            client/package-lock.json

      - name: Create artifact directory
        run: mkdir -p artifacts/ephemeral-staging

      - name: Generate job-only secrets
        shell: bash
        run: |
          set -euo pipefail
          make_secret() {
            local name="$1"
            local value
            value="$(openssl rand -hex 32)"
            echo "::add-mask::$value"
            echo "$name=$value" >> "$GITHUB_ENV"
          }
          make_secret JWT_SECRET
          make_secret RESET_OTP_SECRET
          make_secret CARRIER_WEBHOOK_SECRET
          make_secret REFUND_DESTINATION_ENCRYPTION_KEY
          make_secret RETURN_EVIDENCE_CLAIM_SECRET
          make_secret CI_STAGING_PASSWORD

      - name: Install backend dependencies
        run: npm ci
        working-directory: server

      - name: Install frontend dependencies
        run: npm ci
        working-directory: client

      - name: Run backend tests
        id: backend_tests
        shell: bash
        run: |
          set -o pipefail
          npm test 2>&1 | tee ../artifacts/ephemeral-staging/backend-tests.log
        working-directory: server

      - name: Audit backend production dependencies
        id: backend_audit
        shell: bash
        run: |
          set -o pipefail
          npm audit --omit=dev 2>&1 | tee ../artifacts/ephemeral-staging/backend-audit.log
        working-directory: server

      - name: Run frontend tests
        id: frontend_tests
        shell: bash
        run: |
          set -o pipefail
          npm test 2>&1 | tee ../artifacts/ephemeral-staging/frontend-tests.log
        working-directory: client

      - name: Audit frontend production dependencies
        id: frontend_audit
        shell: bash
        run: |
          set -o pipefail
          npm audit --omit=dev 2>&1 | tee ../artifacts/ephemeral-staging/frontend-audit.log
        working-directory: client

      - name: Build production frontend
        id: frontend_build
        shell: bash
        run: |
          set -o pipefail
          npm run build 2>&1 | tee ../artifacts/ephemeral-staging/frontend-build.log
        working-directory: client

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
        working-directory: client

      - name: Start MongoDB replica set
        id: mongodb
        shell: bash
        run: |
          set -euo pipefail
          docker run --detach \
            --name greenhome-ci-mongo \
            --publish 27017:27017 \
            mongo@sha256:5351bff2b5d1563e3fa603a74b9be85ef9323e10aeb0b45cea933a93876e77fd \
            --replSet rs0 --bind_ip_all
          for attempt in $(seq 1 30); do
            if docker exec greenhome-ci-mongo mongosh --quiet --eval \
              'try { rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}) } catch (error) { if (error.codeName !== "AlreadyInitialized") throw error }' \
              >/dev/null 2>&1; then
              if docker exec greenhome-ci-mongo mongosh --quiet --eval \
                'quit(rs.status().myState === 1 ? 0 : 1)' >/dev/null 2>&1; then
                docker exec greenhome-ci-mongo mongosh --quiet --eval \
                  'JSON.stringify({ok:rs.status().ok,myState:rs.status().myState})' \
                  | tee artifacts/ephemeral-staging/mongodb-status.log
                exit 0
              fi
            fi
            sleep 2
          done
          docker logs greenhome-ci-mongo > artifacts/ephemeral-staging/mongodb.log 2>&1 || true
          echo "MongoDB replica set did not become primary" >&2
          exit 1

      - name: Run migrations twice
        id: migrations
        shell: bash
        run: |
          set -euo pipefail
          for pass in 1 2; do
            {
              echo "migration_pass=$pass"
              npm --prefix server run migrate:product-sku-index
              npm --prefix server run migrate:cod-reconciliation
              npm --prefix server run migrate:sl002
            } 2>&1 | tee -a artifacts/ephemeral-staging/migrations.log
          done

      - name: Prepare CI actors
        id: actors
        shell: bash
        run: |
          set -o pipefail
          npm --prefix server run ci:actors 2>&1 \
            | tee artifacts/ephemeral-staging/actors.log

      - name: Verify SL-001
        id: sl001
        shell: bash
        run: |
          set -o pipefail
          npm --prefix server run verify:sl001 2>&1 \
            | tee artifacts/ephemeral-staging/sl001-verification.log

      - name: Verify SL-002
        id: sl002
        shell: bash
        run: |
          set -o pipefail
          npm --prefix server run verify:sl002 2>&1 \
            | tee artifacts/ephemeral-staging/sl002-verification.log

      - name: Start API and production frontend preview
        id: start_apps
        shell: bash
        run: |
          set -euo pipefail
          npm --prefix server start > artifacts/ephemeral-staging/api.log 2>&1 &
          echo "$!" > artifacts/ephemeral-staging/api.pid
          npm --prefix client run preview -- --host 127.0.0.1 --port 4173 \
            > artifacts/ephemeral-staging/frontend.log 2>&1 &
          echo "$!" > artifacts/ephemeral-staging/frontend.pid

          for attempt in $(seq 1 30); do
            if curl --fail --silent http://127.0.0.1:5000/api/health >/dev/null \
              && curl --fail --silent http://127.0.0.1:4173/ >/dev/null; then
              exit 0
            fi
            sleep 2
          done
          echo "API or frontend preview did not become ready" >&2
          exit 1

      - name: Run live HTTP smoke
        id: http_smoke
        run: npm run verify:ephemeral-http
        working-directory: server

      - name: Run browser smoke
        id: browser_smoke
        run: npm run test:ephemeral-browser
        working-directory: client

      - name: Stop disposable services
        if: always()
        shell: bash
        run: |
          for pid_file in artifacts/ephemeral-staging/api.pid artifacts/ephemeral-staging/frontend.pid; do
            if [[ -f "$pid_file" ]]; then
              kill "$(cat "$pid_file")" 2>/dev/null || true
            fi
          done
          docker logs greenhome-ci-mongo > artifacts/ephemeral-staging/mongodb.log 2>&1 || true
          docker rm --force greenhome-ci-mongo >/dev/null 2>&1 || true

      - name: Write workflow summary
        if: always()
        shell: bash
        run: |
          {
            echo "## GreenHome CI and ephemeral staging"
            echo
            echo "| Phase | Outcome |"
            echo "| --- | --- |"
            echo "| Backend tests | ${{ steps.backend_tests.outcome }} |"
            echo "| Backend audit | ${{ steps.backend_audit.outcome }} |"
            echo "| Frontend tests | ${{ steps.frontend_tests.outcome }} |"
            echo "| Frontend audit | ${{ steps.frontend_audit.outcome }} |"
            echo "| Frontend build | ${{ steps.frontend_build.outcome }} |"
            echo "| MongoDB replica set | ${{ steps.mongodb.outcome }} |"
            echo "| Migrations | ${{ steps.migrations.outcome }} |"
            echo "| CI actors | ${{ steps.actors.outcome }} |"
            echo "| SL-001 | ${{ steps.sl001.outcome }} |"
            echo "| SL-002 | ${{ steps.sl002.outcome }} |"
            echo "| HTTP smoke | ${{ steps.http_smoke.outcome }} |"
            echo "| Browser smoke | ${{ steps.browser_smoke.outcome }} |"
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload ephemeral staging evidence
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: ephemeral-staging-${{ github.run_id }}
          path: artifacts/ephemeral-staging
          if-no-files-found: warn
          retention-days: 7
```

- [ ] **Step 2: Check the workflow for secret exposure and mutable dependencies**

Run:

```powershell
rg -n "secrets\\.|PAYOS_|SMTP_|continue-on-error|uses: .*@(main|master|v[0-9]+)$" .github/workflows/ci-ephemeral-staging.yml
```

Expected: no output.

Run:

```powershell
rg -n "actions/checkout@3d3c42e5|actions/setup-node@8207627|actions/upload-artifact@043fb46|mongo@sha256:5351bff" .github/workflows/ci-ephemeral-staging.yml
```

Expected: all four immutable references are found.

- [ ] **Step 3: Verify YAML structure locally**

Parse the workflow with Ruby's bundled YAML parser:

```powershell
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci-ephemeral-staging.yml', aliases: true); puts 'workflow yaml parsed'"
```

Expected: `workflow yaml parsed`.

If Ruby is unavailable, use Node with a temporary no-save parser and remove it
after the command:

```powershell
npx --yes yaml-lint@1.7.0 .github/workflows/ci-ephemeral-staging.yml
```

Expected: exit code `0`.

- [ ] **Step 4: Commit Task 4**

```powershell
git add .github/workflows/ci-ephemeral-staging.yml
git commit -m "ci: add ephemeral staging gate"
```

---

### Task 5: Verify locally, execute the real PR run, merge, and verify `main`

**Files:**
- Modify only if the real workflow exposes a proven defect in Tasks 1–4.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: a green pull-request workflow run, a merge commit on `main`, and a green post-merge workflow run with evidence artifacts.

- [ ] **Step 1: Run fresh local verification**

```powershell
npm test --prefix server
npm audit --prefix server --omit=dev
npm test --prefix client
npm audit --prefix client --omit=dev
npm run build --prefix client
npx --prefix client playwright test --config=playwright.config.js --list
git diff --check
git status --short
```

Expected:

- backend exits `0` with all tests passed and zero failures;
- both production dependency audits report zero vulnerabilities;
- frontend reports `140` tests passed and zero failures;
- Vite build exits `0`;
- Playwright lists exactly two tests;
- `git diff --check` exits `0`;
- only intended CI/staging files are modified relative to `origin/main`.

- [ ] **Step 2: Review the complete branch diff**

```powershell
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected files:

```text
.github/workflows/ci-ephemeral-staging.yml
.gitignore
client/e2e/ephemeral-staging.spec.js
client/package-lock.json
client/package.json
client/playwright.config.js
docs/superpowers/plans/2026-07-23-ci-ephemeral-staging-implementation.md
docs/superpowers/specs/2026-07-23-ci-ephemeral-staging-design.md
server/package.json
server/src/scripts/ciEphemeralActors.js
server/src/scripts/ciEphemeralActors.test.js
server/src/scripts/verifyEphemeralHttp.js
server/src/scripts/verifyEphemeralHttp.test.js
```

- [ ] **Step 3: Push and open the pull request**

```powershell
git push -u origin ci/ephemeral-staging
gh pr create `
  --base main `
  --head ci/ephemeral-staging `
  --title "ci: add ephemeral staging verification" `
  --body "Adds a zero-secret GitHub Actions gate with a disposable MongoDB replica set, migrations, SL-001/SL-002 verification, live HTTP smoke, Playwright evidence, and no persistent deployment."
```

Expected: GitHub returns a new pull request URL.

- [ ] **Step 4: Watch the pull-request workflow to completion**

```powershell
$pr = gh pr view --json number,headRefOid,url | ConvertFrom-Json
gh pr checks $pr.number --watch
gh run list --branch ci/ephemeral-staging --limit 5
```

Expected: `CI and ephemeral staging / verify` completes successfully.

If it fails, inspect evidence before changing code:

```powershell
$run = gh run list --branch ci/ephemeral-staging --workflow "CI and ephemeral staging" --limit 1 --json databaseId | ConvertFrom-Json
gh run view $run[0].databaseId --log-failed
```

Apply only a root-cause fix, rerun the focused local check, commit it, push it,
and wait for the replacement run.

- [ ] **Step 5: Merge the green PR using the repository's merge-commit convention**

```powershell
$pr = gh pr view --json number,headRefOid | ConvertFrom-Json
gh pr merge $pr.number --merge --match-head-commit $pr.headRefOid
```

Expected: the pull request reports `merged=true`.

- [ ] **Step 6: Verify the post-merge `main` run**

```powershell
git fetch origin main
$mergeSha = git rev-parse origin/main
$run = gh run list --branch main --workflow "CI and ephemeral staging" --limit 10 `
  --json databaseId,headSha,status,conclusion,url `
  | ConvertFrom-Json `
  | Where-Object { $_.headSha -eq $mergeSha } `
  | Select-Object -First 1
gh run watch $run.databaseId --exit-status
$runState = gh run view $run.databaseId --json status,conclusion,url | ConvertFrom-Json
$artifacts = gh api "repos/ngocthanhhx7/GreenHouse_System/actions/runs/$($run.databaseId)/artifacts" | ConvertFrom-Json
$runState
$artifacts.artifacts | Select-Object name,expired,expires_at
```

Expected:

- the run head SHA equals `origin/main`;
- status is `completed`;
- conclusion is `success`;
- an `ephemeral-staging-<run-id>` evidence artifact exists.

- [ ] **Step 7: Record the final evidence**

Report:

- pull request URL and merge commit;
- post-merge workflow URL;
- backend/frontend test counts;
- migration pass count `2`;
- SL-001 and SL-002 outcomes;
- HTTP and browser smoke outcomes;
- artifact name and seven-day retention;
- the explicit limitation that no persistent staging URL exists.
