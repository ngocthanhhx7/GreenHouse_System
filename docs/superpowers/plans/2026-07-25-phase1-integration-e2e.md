# GreenHouse Giai đoạn 1 Integration and E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the existing GreenHouse COD flow runnable and verifiable from Customer checkout through Customer order history on disposable MongoDB database `greenhouse_e2e`.

**Architecture:** Keep the existing Express/Mongoose services, route boundaries, transactions, state machine, and React pages. Add a guarded seed/reset write path, compose the latest manual Shipment into Customer order projections, and add repeatable real-HTTP/API plus browser verification without adding business states or external integrations.

**Tech Stack:** Node.js, Express, Mongoose, MongoDB replica set, React/Vite, Node test runner, Playwright.

## Global Constraints

- Use only the existing business rules from SL-003, SL-004, SL-005, SL-006 and SL-007.
- Use only disposable MongoDB database `greenhouse_e2e`.
- Never reset when `NODE_ENV=production`.
- Require `DEMO_SEED_ALLOW_RESET=true` and `--confirm=RESET:greenhouse_e2e` for reset.
- Do not delete the shared `roles` collection.
- Do not add online payment or carrier API integration.
- Do not trust frontend price, role, user ID, OrderStatus, PaymentStatus or ShippingStatus.
- Every production behavior change requires a failing regression test first.
- Preserve existing `docs/superpowers` artifacts even though the directory is ignored by Git; stage new artifacts explicitly with `git add -f`.
- Use the repository's actual Mongo collection handles (`model.collection.name`), not fixture property names such as `stockExports`, when deleting demo data.

---

### Task 1: Implement guarded seed and disposable reset

**Files:**

- Modify: `server/src/demo-data/demoSeedCli.js`
- Modify: `server/src/demo-data/demoSeedSafety.js`
- Create: `server/src/demo-data/demoReset.js`
- Test: `server/src/demo-data/demoSeedSafety.test.js`
- Test: `server/src/config/seedDemoData.test.js`

**Interfaces:**

- `runDemoSeedCli({ args, workspaceRoot, env, databaseProbe, imagePreflight, connect, disconnect, seed, reset })` continues to support `--dry-run`, `--reset`, and default upsert modes.
- `resetDemoDatabase({ connection, databaseName, models })` deletes only the ordered demo model collection handles inside a MongoDB session transaction.
- `npm run seed:demo` performs deterministic upsert.
- `npm run seed:demo -- --reset --confirm=RESET:greenhouse_e2e` performs guarded reset only.

- [ ] **Step 1: Add failing tests for real seed/reset contracts**

Add tests that assert:

```js
it('runs the injected seed adapter in default upsert mode', async () => {
  let seeded = 0;
  const result = await runDemoSeedCli({
    args: [],
    env: {
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/greenhouse_e2e?replicaSet=rs0',
    },
    imagePreflight: async () => ({ valid: true, count: 15 }),
    connect: async () => {},
    disconnect: async () => {},
    seed: async () => { seeded += 1; return { demoPassword: 'GreenHome@123' }; },
    logger: { log() {} },
  });
  assert.equal(seeded, 1);
  assert.equal(result.mode, 'upsert');
});

it('runs reset only after all disposable-target guards pass', async () => {
  let reset = 0;
  const result = await runDemoSeedCli({
    args: ['--reset', '--confirm=RESET:greenhouse_e2e'],
    env: {
      NODE_ENV: 'development',
      DEMO_SEED_ALLOW_RESET: 'true',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/greenhouse_e2e?replicaSet=rs0',
    },
    imagePreflight: async () => ({ valid: true, count: 15 }),
    databaseProbe: async () => ({
      databaseName: 'greenhouse_e2e',
      indexesReady: true,
      supportsTransactions: true,
    }),
    reset: async () => { reset += 1; },
    logger: { log() {} },
  });
  assert.equal(reset, 1);
  assert.equal(result.mode, 'reset');
});
```

Also add a rejection test for `greenhome_kitchen`, production mode, missing reset permission, wrong confirmation, and missing transaction support. Keep the static allow-list in `demoSeedSafety.js`; do not add a command-line database override.

- [ ] **Step 2: Run the focused tests and verify they fail for the missing write adapters**

Run:

```powershell
node --test src/demo-data/demoSeedSafety.test.js src/config/seedDemoData.test.js
```

Expected: the new default-upsert and reset-adapter tests fail because `runDemoSeedCli` currently throws “Upsert chưa được bật” and “write adapter ... chưa có”.

- [ ] **Step 3: Add the reset adapter**

Create `server/src/demo-data/demoReset.js` with a session-based transaction:

```js
const { DEMO_DELETE_ORDER } = require('./demoSeedSafety');

async function resetDemoDatabase({ connection, databaseName, models }) {
  if (!connection?.startSession) throw new Error('MongoDB transaction support is required');
  const session = await connection.startSession();
  try {
    let deleted = {};
    await session.withTransaction(async () => {
      for (const modelName of DEMO_DELETE_ORDER) {
        const model = models?.[modelName];
        if (!model?.collection) throw new Error(`Demo reset model ontbreekt: ${modelName}`);
        const result = await model.collection.deleteMany({}, { session });
        deleted[model.collection.name] = result.deletedCount;
      }
    });
    return { databaseName, deleted };
  } finally {
    await session.endSession();
  }
}

module.exports = { resetDemoDatabase };
```

`DEMO_DELETE_ORDER` must contain Mongoose model names in child-before-parent order and include the Phase 1 operational records (`PaymentCallbackEvent`, `OrderReservation`, `PackingRecord`, `ShipmentEvent`, `Shipment`, `FulfillmentCycle`, `StockExportRequest`, `InventoryTransaction`, `PaymentAttempt`, `Payment`, `OrderDetail`, `Order`, `CartItem`, `ShoppingCart`, `Inventory`, `Product`, `Category`, `UserAddress`, `User`) while excluding shared `Role`. Add/update safety tests for this dependency order. The adapter receives an explicit model map so a missing model cannot silently fall back to an incorrectly named raw collection.

- [ ] **Step 4: Connect the CLI to seed and reset adapters**

Update `runDemoSeedCli` so:

1. `--dry-run` remains offline.
2. Default mode validates the fixture graph, runs image preflight, connects through the injected/default `connectDatabase`, invokes `seedDemoData`, logs fixed account emails/password and counts, and disconnects in `finally`.
3. Reset mode validates the static target, runs image preflight and an actual database probe, invokes `resetDemoDatabase` with an explicit model map, and disconnects in `finally`.
4. The `databaseProbe` checks actual database name, required indexes and transaction capability using the connected Mongoose connection.
5. The CLI never accepts a database name from an untrusted command-line argument.

Keep `seedDemoData()` as the source of fixture records; do not duplicate account/product definitions in the CLI.

- [ ] **Step 5: Verify the seed/reset tests pass**

Run:

```powershell
node --test src/demo-data/demoSeedSafety.test.js src/config/seedDemoData.test.js
```

Expected: all focused seed tests pass, including the existing graph/safety tests.

- [ ] **Step 6: Commit the seed/reset slice**

```powershell
git add server/src/demo-data/demoSeedCli.js server/src/demo-data/demoReset.js server/src/demo-data/demoSeedSafety.js server/src/demo-data/demoSeedSafety.test.js server/src/config/seedDemoData.test.js
git commit -m "feat: enable guarded greenhouse e2e seed reset"
```

---

### Task 2: Add owned-order Shipment projection to backend responses

**Files:**

- Modify: `server/src/services/order.service.js` (response mapper, repository reads, list/detail service methods)
- Test: `server/src/services/order.service.test.js`
- Test: `server/src/controller/order.controller.test.js`
- Create: `server/src/routes/order.routes.test.js` only if the existing route-test harness does not already cover Customer order routes

**Interfaces:**

- `toOrderResponse(order, details, shipping)` returns `shippingStatus` and `shipping`.
- The model repository exposes `findLatestShipmentByOrder(orderId)` and `listLatestShipmentsByOrders(orderIds)`.
- Existing Customer endpoints remain unchanged:
  - `GET /api/orders/my`
  - `GET /api/orders/:id`

- [ ] **Step 1: Add a failing service test**

Extend the in-memory order repository with a latest shipment fixture and assert:

```js
const [result] = await service.listMyOrders('customer-1');
assert.equal(result.shippingStatus, 'HandedOff');
assert.deepEqual(result.shipping, {
  providerName: 'Manual Carrier',
  trackingCode: 'TRACK-001',
  handedOverAt: '2026-07-25T09:00:00.000Z',
  deliveredAt: null,
  note: 'Bàn giao tại quầy',
});
```

Add a second test proving the list does not include a shipment belonging to another order or customer.

- [ ] **Step 2: Run the service test and verify the projection fields fail**

Run:

```powershell
node --test src/services/order.service.test.js
```

Expected: the new assertions fail because `toOrderResponse` currently has no shipping projection.

- [ ] **Step 3: Implement repository shipment reads**

Import the existing `Shipment` model and add:

```js
async findLatestShipmentByOrder(orderId, session) {
  return withOptionalSession(
    Shipment.findOne({ orderId }).sort({ createdAt: -1, _id: -1 }),
    session,
  ).lean();
}

async listLatestShipmentsByOrders(orderIds) {
  const rows = await Shipment.find({ orderId: { $in: orderIds } })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const latest = new Map();
  for (const row of rows) {
    const key = String(row.orderId);
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}
```

Use the same `withOptionalSession` helper already used by the repository. Do not query Shipment by a Customer-supplied customer ID. If a service test double does not implement these optional methods, treat the projection as empty so existing tests remain valid.

- [ ] **Step 4: Extend the response projection**

Add a small pure mapper:

```js
function toShippingResponse(shipment) {
  if (!shipment) return { shippingStatus: null, shipping: null };
  return {
    shippingStatus: shipment.status || null,
    shipping: {
      providerName: shipment.carrierName || '',
      trackingCode: shipment.trackingReference || '',
      handedOverAt: shipment.handedOffAt || null,
      deliveredAt: shipment.deliveredAt || null,
      note: shipment.note || '',
    },
  };
}
```

Use the map in `listMyOrders` and the single latest shipment in `getMyOrder`. Preserve all existing fields and details behavior.

- [ ] **Step 5: Add ownership and invalid-ID route tests**

Assert:

- Customer A receives only Customer A orders.
- Customer A receives `404` for Customer B order ID.
- Invalid ObjectId receives the existing safe error response, not a 500.
- Staff, Warehouse Manager and Admin do not gain access to Customer routes.

- [ ] **Step 6: Verify backend projection tests and commit**

Run:

```powershell
node --test src/services/order.service.test.js src/controller/order.controller.test.js src/routes/order.routes.test.js
```

Commit:

```powershell
git add server/src/services/order.service.js server/src/services/order.service.test.js server/src/controller/order.controller.test.js server/src/routes/order.routes.test.js
git commit -m "feat: expose owned order shipping projection"
```

---

### Task 3: Render shipping fields and stable error states in Customer history/detail

**Files:**

- Modify: `client/src/pages/customer/OrderHistoryPage.jsx`
- Modify: `client/src/pages/customer/OrderDetailPage.jsx`
- Modify: `client/src/utils/formatters.js` only if an existing status formatter is missing
- Test: `client/src/pages/customer/orderHistoryView.test.js`
- Test: `client/src/pages/customer/OrderHistoryPage.test.js`
- Test: `client/src/pages/customer/OrderDetailPage.test.js` (create only if a source-contract test is needed; preserve the existing cancellation test harness)

**Interfaces:**

- `orderService.listMyOrdersWithDetails()` remains the data loader.
- History and detail consume `shippingStatus` and `shipping` without calculating business state.
- All backend failures render an error surface; invalid detail IDs never leave a blank page.

- [ ] **Step 1: Add failing source/UI contract tests**

Add assertions that the history source renders:

```js
assert.match(history, /shippingStatus/);
assert.match(history, /providerName|carrierName/);
assert.match(history, /trackingCode|trackingReference/);
```

Add detail assertions for the same fields and a visible invalid-ID error branch. Prefer the repository's existing source-contract tests when no DOM harness is available; do not add a new testing library.

- [ ] **Step 2: Run focused UI tests and verify the missing-field assertions fail**

Run:

```powershell
node --test src/pages/customer/orderHistoryView.test.js src/pages/customer/OrderHistoryPage.test.js src/pages/customer/OrderDetailPage.test.js
```

Expected: the new source assertions fail because the history card currently renders only OrderStatus, PaymentStatus and total.

- [ ] **Step 3: Add read-only history rendering**

In each order card, render:

- `translateOrderStatus(order.orderStatus)`;
- `translatePaymentStatus(order.paymentStatus)`;
- a shipping label from `order.shippingStatus`, or “Chưa bàn giao” when null;
- provider/tracking only when `order.shipping` exists;
- the existing immutable detail snapshots and total.

Do not make status changes or payment decisions in React.

- [ ] **Step 4: Harden detail loading**

Keep the existing `orderService.getOrder(id)` ownership boundary. Add the read-only shipping summary and evaluate the error branch before any helper that assumes `order` is non-null:

```jsx
if (!order && !error) return <div className="page-center">Đang tải đơn hàng...</div>;
if (!order && error) return <div className="surface"><div className="alert alert-danger" role="alert">{error}</div></div>;
```

Avoid rendering after-sales controls when the order failed to load.

- [ ] **Step 5: Verify UI tests and build**

Run:

```powershell
node --test src/pages/customer/orderHistoryView.test.js src/pages/customer/OrderHistoryPage.test.js src/pages/customer/OrderDetailPage.test.js
npm run build
```

Commit:

```powershell
git add client/src/pages/customer/OrderHistoryPage.jsx client/src/pages/customer/OrderDetailPage.jsx client/src/pages/customer/orderHistoryView.test.js client/src/pages/customer/OrderHistoryPage.test.js
git commit -m "feat: show shipping state in customer order history"
```

---

### Task 4: Add the real HTTP Phase 1 E2E runner

**Files:**

- Create: `server/src/scripts/verifyPhase1E2E.js`
- Test: `server/src/scripts/verifyPhase1E2E.test.js`
- Modify: `server/package.json`

**Interfaces:**

- `runPhase1E2E({ apiBaseUrl, password, fetcher, models, now })` returns `{ outcome, steps, orderId, orderCode }`.
- Required environment:
  - `E2E_API_BASE_URL`, default `http://127.0.0.1:5000/api`;
  - `E2E_PASSWORD`, default `GreenHome@123`;
  - `E2E_ORIGIN`, default `http://localhost:5173` (must be in backend `CORS_ORIGINS` for CSRF);
  - `MONGODB_URI` pointing to `greenhouse_e2e`.
- All state-changing requests carry a stable `Idempotency-Key`.

- [ ] **Step 1: Add failing unit tests for E2E helper contracts**

Test the request helper and state assertions using a fake fetcher:

```js
it('fails the report when a response has the wrong status or error envelope', async () => {
  await assert.rejects(
    requestJson(fakeFetcher({ status: 403, body: { success: false, errorCode: 'FORBIDDEN' } }), '/x'),
    /FORBIDDEN/,
  );
});

it('uses one stable key for a retryable command', () => {
  assert.equal(commandKey('checkout', 'order-1'), commandKey('checkout', 'order-1'));
});
```

- [ ] **Step 2: Run the script test and verify the helpers are missing**

Run:

```powershell
node --test src/scripts/verifyPhase1E2E.test.js
```

Expected: module/helper import failure because the runner does not exist.

- [ ] **Step 3: Implement login and request helpers**

Implement:

```js
async function login(fetcher, apiBaseUrl, email, password) { /* POST /auth/login, retain session cookie, GET /auth/csrf */ }
async function requestJson(fetcher, apiBaseUrl, path, options = {}) { /* send Cookie/X-CSRF-Token and parse safe JSON envelope */ }
function commandKey(scope, id) { return `phase1:${scope}:${id}`; }
function assertEqual(actual, expected, label) { /* throw a step-specific error */ }
```

The API uses an HttpOnly session cookie rather than a bearer token. The runner must keep a small in-memory cookie jar from `Set-Cookie`, fetch `/auth/csrf` after each login, send the returned CSRF token and `Origin: E2E_ORIGIN` on state-changing requests. It must never send a frontend role or user ID as an authorization decision.

- [ ] **Step 4: Implement the happy-path API sequence**

Use these existing endpoints:

```text
POST /auth/login
GET  /auth/csrf
GET  /products
GET  /profile/addresses
POST /cart/items
GET  /cart
POST /orders
GET  /orders/:id
POST /staff/orders/:id/confirm
GET  /warehouse/stock-exports
GET  /warehouse/stock-exports/:id
POST /warehouse/stock-exports/:id/process
POST /staff/orders/:id/packing
POST /staff/orders/:id/shipments
POST /staff/shipments/:shipmentId/events
GET  /orders/my
GET  /orders/:id
GET  /orders/:id/fulfillment
```

Cart commands require `expectedVersion` and an `Idempotency-Key`; obtain the current cart version from `GET /cart` before `POST /cart/items`. Checkout requires `cartId`, `cartVersion`, `savedAddressId` (from `/profile/addresses`) and `expectedItems` with the current price/version returned by the catalog/cart APIs. Handoff requires `carrierName`, `trackingReference`, `handedOffAt`, `evidenceReference` and an idempotency key. Delivered COD requires `codCollectionResult: 'COLLECTED'` plus a signed `evidenceReferences` value; generate it with the existing `operationalEvidenceClaim.sign()` helper in development instead of calling a carrier API.

After checkout, query Mongoose models in the same `greenhouse_e2e` database to assert:

- exactly one Order for the checkout idempotency key;
- exact OrderDetail count and snapshot values;
- exact active `OrderReservation` rows;
- Payment `Unpaid`;
- one StockExportRequest after Staff confirm;
- one export transaction and one inventory deduction;
- one Shipment and one Delivered event;
- Payment and primary PaymentAttempt `Paid` after full COD collection.

- [ ] **Step 5: Implement the negative matrix**

Each step must assert the expected status/error code and then assert no unintended write:

```text
checkout quantity above available stock
checkout replay with same idempotency key
Customer POST staff confirm
Staff confirm replay
Warehouse process replay
packing before export completion
Confirmed → Shipped direct attempt
Packed → Delivered direct attempt
Customer updates shipping
Delivered replay
Customer reads another Customer order
invalid order ID
```

- [ ] **Step 6: Verify runner tests and commit**

Run:

```powershell
node --test src/scripts/verifyPhase1E2E.test.js
```

Commit:

```powershell
git add server/src/scripts/verifyPhase1E2E.js server/src/scripts/verifyPhase1E2E.test.js server/package.json
git commit -m "test: add phase 1 real http e2e runner"
```

---

### Task 5: Add browser verification for Customer history and refresh

**Files:**

- Create: `client/e2e/phase1-order-history.spec.js`
- Modify: `client/package.json`
- Modify: `client/playwright.config.js` only if a report path or base URL is missing

**Interfaces:**

- Browser test uses `CI_FRONTEND_URL` or the existing Playwright default.
- Credentials come from `E2E_PASSWORD`, never hard-coded in the test body.
- The API runner creates the order before the browser test starts and writes `artifacts/phase1-e2e-context.json` with the order code, order ID, product name, total and tracking code. The browser test reads this context file; it must not guess by taking the newest seeded order.

- [ ] **Step 1: Add a failing browser contract test**

The test must:

1. Open `/login`.
2. Login as `customer@greenhome.test` using `E2E_PASSWORD`.
3. Open `/orders`.
4. Locate the E2E order code.
5. Assert product name, total, OrderStatus, PaymentStatus, ShippingStatus and tracking code.
6. Reload the page and assert the same values remain.
7. Open the detail route.
8. Assert invalid `/orders/not-an-object-id` shows an error state and not a blank page.

- [ ] **Step 2: Run the browser test against the current app and record the expected missing shipping assertion**

Run:

```powershell
$env:CI_FRONTEND_URL='http://127.0.0.1:4173'
$env:E2E_PASSWORD='GreenHome@123'
npm run test:ephemeral-browser -- --grep "phase 1"
```

Expected: the new shipping-status/tracking assertion fails until Task 3 is complete.

- [ ] **Step 3: Verify the browser test after Task 3**

Run the same command after starting the backend and the Vite preview against `greenhouse_e2e`. The test must pass after a page reload and produce Playwright evidence under `artifacts/ephemeral-staging`.

- [ ] **Step 4: Add a named browser command and commit**

Add:

```json
"test:phase1-browser": "playwright test --config=playwright.config.js e2e/phase1-order-history.spec.js"
```

Commit:

```powershell
git add client/e2e/phase1-order-history.spec.js client/package.json client/playwright.config.js
git commit -m "test: verify phase 1 customer order history"
```

---

### Task 6: Run the integrated release gate and produce the report

**Files:**

- Modify only if required by a failing test from Tasks 1–5.
- Evidence: `artifacts/phase1-e2e-report.json`
- Evidence: `artifacts/ephemeral-staging/playwright-report`

- [ ] **Step 1: Prepare disposable runtime**

Set only the disposable runtime values:

```powershell
$env:NODE_ENV='development'
$env:DEMO_SEED_ALLOW_RESET='true'
$env:MONGODB_URI='mongodb://127.0.0.1:27017/greenhouse_e2e?replicaSet=rs0'
$env:E2E_API_BASE_URL='http://127.0.0.1:5000/api'
$env:E2E_PASSWORD='GreenHome@123'
$env:E2E_ORIGIN='http://localhost:5173'
$env:CI_FRONTEND_URL='http://127.0.0.1:4173'
$env:CORS_ORIGINS='http://localhost:5173,http://127.0.0.1:4173'
```

- [ ] **Step 2: Reset and seed**

Run:

```powershell
Push-Location server
npm run seed:demo -- --reset --confirm=RESET:greenhouse_e2e
npm run seed:demo
Pop-Location
```

Verify the output lists the four fixed accounts, at least three Active products, inventory and one Customer default address.

- [ ] **Step 3: Start backend and frontend**

Run backend from `server`:

```powershell
npm start
```

Run frontend from `client` as a production-like preview:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

- [ ] **Step 4: Execute real HTTP E2E and browser evidence**

Run:

```powershell
Push-Location server
npm run verify:phase1-e2e
Pop-Location
Push-Location client
npm run test:phase1-browser
Pop-Location
```

Expected: the report contains a passed step for every happy-path and negative case, and the browser report contains no blank page or uncaught application failure.

- [ ] **Step 5: Run full regression verification**

Run:

```powershell
Push-Location server
node --test src/scripts/verifyPhase1E2E.test.js
npm test
Pop-Location
Push-Location client
npm test
npm run build
Pop-Location
```

Expected: zero failed server/client tests and a successful Vite build.

- [ ] **Step 6: Review release evidence and commit only verified fixes**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Do not claim completion if:

- the real HTTP run did not reach `Delivered + Paid`;
- reservation or inventory assertions were skipped;
- Customer history did not survive refresh;
- any negative case produced a second Order, export, Shipment, payment, or inventory deduction;
- seed/reset targeted a database other than `greenhouse_e2e`.
