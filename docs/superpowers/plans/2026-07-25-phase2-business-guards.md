# Phase 2 Business Guards Implementation Plan

> **For agentic workers:** Use the executing-plans workflow to implement this plan task-by-task. Each step is tracked with a checkbox and must finish with its stated verification.

**Goal:** Close the eight approved Phase 2 business-guard paths without weakening the existing Order, Payment, Inventory, Fulfillment, Refund, or RBAC state machines.

**Architecture:** Keep business authority in the server services and MongoDB transactions. Reuse existing idempotency fields, conditional state claims, `RefundPending`, and `ReturnRefundRequest`; add only the missing checkout stock error normalization and Customer paid-cancellation handoff. The client adds immediate in-flight locks and Vietnamese feedback but never becomes the source of truth.

**Tech Stack:** Node.js `node:test`, Express route middleware, Mongoose transactions, React 19, Vite 6, existing service/repository seams.

## Global Constraints

- Preserve the exact approved state rules in `docs/superpowers/specs/2026-07-25-phase2-business-guards-design.md`.
- Same command key plus same facts replays the original result; reused key with different facts returns `409 IDEMPOTENCY_KEY_REUSED`.
- Invalid state transitions return `409` with no domain mutation.
- Wrong authenticated role returns `403 ROLE_FORBIDDEN`; unauthenticated requests remain `401`.
- Customer-visible errors and replay messages are Vietnamese and do not expose model internals.
- Paid Customer cancellation keeps immutable paid evidence, sets the historical Order to `Cancelled`, and creates one `ReadyForRefund` request linked to one `RefundPending` obligation.
- Do not integrate a real carrier, add a retry-limit policy, modify SRS/SDS, or redesign unrelated state machines.
- Keep existing untracked runtime logs and `.playwright-mcp/` out of commits.

---

### Task 1: Normalize final checkout stock failure

**Files:**

- Modify: `server/src/services/order.service.js`
- Test: `server/src/services/order.service.test.js`
- Modify: `client/src/pages/customer/CheckoutPage.jsx`
- Test: `client/src/pages/customer/CheckoutPage.test.js`

**Interfaces:**

- `createCheckoutStockInsufficientError(productId)` returns an `ApiError` with status `409`, code `CHECKOUT_STOCK_INSUFFICIENT`, and one `expectedItems.{productId}.quantity` field error.
- `toFieldErrors(errors, errorCode)` maps stock errors to the `checkoutStock` presentation field.
- `CheckoutPage` retains one `checkoutIdempotencyKey`, an in-flight ref, and `submitting` state.

- [ ] **Step 1: Write the failing server test**

Add this test near the existing checkout validation tests:

```js
it('AT-227 returns a stable Vietnamese stock error and rolls back the checkout transaction', async () => {
  inventoryRepository.reserve = async () => {
    throw new Error('Insufficient available inventory for checkout');
  };

  await assert.rejects(
    () => orderService.placeOrder('customer-1', checkoutInput({ idempotencyKey: 'stock-short-001' })),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.errorCode, 'CHECKOUT_STOCK_INSUFFICIENT');
      assert.match(error.message, /không còn đủ số lượng/i);
      return true;
    },
  );
  assert.equal(cartRepository.carts[0].status, 'Active');
});
```

The existing transaction rollback test already proves that checkout writes run
inside the transaction manager. This focused test must fail first because the
current fake inventory error is not normalized to a stable business code.

- [ ] **Step 2: Run the focused test and verify the expected red failure**

Run:

```powershell
cd D:\GreenHouse_System-main\server
node --test src/services/order.service.test.js --test-name-pattern="stable Vietnamese stock error"
```

Expected: `FAIL` because `CHECKOUT_STOCK_INSUFFICIENT` is not yet normalized by
the production checkout path.

- [ ] **Step 3: Implement the minimal server normalization**

In `server/src/services/order.service.js`, add:

```js
function createCheckoutStockInsufficientError(productId) {
  return new ApiError(
    409,
    'Sản phẩm không còn đủ số lượng để đặt hàng.',
    [{ field: `expectedItems.${String(productId)}.quantity`, message: 'Số lượng tồn kho không đủ.' }],
    'CHECKOUT_STOCK_INSUFFICIENT',
  );
}
```

Use it in the model inventory repository when the atomic
`findOneAndUpdate` returns no inventory. Preserve the transaction boundary and
do not alter the reservation query.

- [ ] **Step 4: Run the server test and verify green**

Run the same command from Step 2. Expected: `PASS`, with zero Orders,
Payments, reservations, or cart checkout mutation left in the test harness.

- [ ] **Step 5: Write the failing client contract test**

Add assertions to `CheckoutPage.test.js`:

```js
it('shows stock conflicts separately and locks the submit command immediately', () => {
  assert.match(source, /CHECKOUT_STOCK_INSUFFICIENT/);
  assert.match(source, /checkoutStock/);
  assert.match(source, /submittingRef/);
  assert.match(source, /if \\(submittingRef\\.current\\) return/);
  assert.match(source, /submittingRef\\.current = true/);
});
```

- [ ] **Step 6: Run the client contract test and verify red**

Run:

```powershell
cd D:\GreenHouse_System-main\client
node --test src/pages/customer/CheckoutPage.test.js --test-name-pattern="stock conflicts"
```

Expected: `FAIL` because `CheckoutPage` currently has no immediate ref lock and
does not render a separate stock warning.

- [ ] **Step 7: Implement the minimal client guard**

In `CheckoutPage.jsx`:

```jsx
const [fieldErrors, setFieldErrors] = useState({});
const submittingRef = useRef(false);

function toFieldErrors(errors, errorCode) {
  return (Array.isArray(errors) ? errors : []).reduce((result, entry) => {
    const field = errorCode === 'CHECKOUT_STOCK_INSUFFICIENT'
      ? 'checkoutStock'
      : String(entry?.field || '').startsWith('expectedItems.')
      ? 'checkoutPrice'
      : entry?.field;
    if (field && entry?.message && !result[field]) result[field] = entry.message;
    return result;
  }, {});
}

async function handleSubmit(event) {
  event.preventDefault();
  if (submittingRef.current) return;
  submittingRef.current = true;
  setSubmitting(true);
  try {
    // existing address resolution and orderService.placeOrder call
  } finally {
    submittingRef.current = false;
    setSubmitting(false);
  }
}
```

Pass `requestError.errorCode` into `toFieldErrors` and render:

```jsx
{fieldErrors.checkoutStock && (
  <div className="alert alert-warning" role="alert">{fieldErrors.checkoutStock}</div>
)}
```

Keep the existing price/cart mapping unchanged for all other error codes.

- [ ] **Step 8: Run focused client tests**

Run:

```powershell
node --test src/pages/customer/CheckoutPage.test.js
```

Expected: all checkout contract tests pass.

- [ ] **Step 9: Commit Task 1**

```powershell
git add server/src/services/order.service.js server/src/services/order.service.test.js client/src/pages/customer/CheckoutPage.jsx client/src/pages/customer/CheckoutPage.test.js
git commit -m "fix: expose checkout stock guard"
```

### Task 2: Complete Pending Customer cancellation and paid refund handoff

**Files:**

- Modify: `server/src/services/order.service.js`
- Test: `server/src/services/order.service.test.js`
- Modify: `client/src/pages/customer/OrderDetailPage.jsx`
- Test: `client/src/pages/customer/OrderDetailPage.cancellation.test.js`

**Interfaces:**

- `buildPaymentReversalHandoff(order, reason, session, paymentAttempt)` creates or replays one `RefundPending` plus one payment-only `ReturnRefundRequest`.
- `normalizeCancellation` remains the source of reason and idempotency validation.
- `orderRepository.claimCustomerCancellation` accepts the expected current payment status and atomically claims only a `Pending` Order.

- [ ] **Step 1: Write failing tests for online Pending and online Paid cancellation**

Replace the current “rejects customer cancellation of a paid order” test with:

```js
it('AT-233 cancels a Pending paid online order and creates one refund handoff', async () => {
  const order = await orderService.placeOrder('customer-1', checkoutInput({
    paymentMethod: 'ONLINE',
    idempotencyKey: 'cancel-paid-checkout-001',
  }));
  orderRepository.orders[0].paymentStatus = 'Paid';
  orderRepository.payments[0].paymentStatus = 'Paid';
  orderRepository.attempts.push({
    _id: 'attempt-paid',
    orderId: order.id,
    paymentStatus: 'Paid',
    amount: 50,
    currency: 'VND',
  });

  const cancelled = await orderService.cancelOrder('customer-1', order.id, {
    cancelReason: 'Khách đổi ý',
    idempotencyKey: 'cancel-paid-command-001',
  });
  const replay = await orderService.cancelOrder('customer-1', order.id, {
    cancelReason: 'Khách đổi ý',
    idempotencyKey: 'cancel-paid-command-001',
  });

  assert.equal(cancelled.orderStatus, 'Cancelled');
  assert.equal(cancelled.paymentStatus, 'Paid');
  assert.equal(orderRepository.refunds.length, 1);
  assert.equal(orderRepository.refunds[0].status, 'RefundPending');
  assert.equal(orderRepository.refundRequests.length, 1);
  assert.equal(orderRepository.refundRequests[0].status, 'ReadyForRefund');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(orderRepository.refunds.length, 1);
  assert.equal(orderRepository.refundRequests.length, 1);
});

it('AT-233 cancels an online Pending payment and retires only its active attempt', async () => {
  const order = await orderService.placeOrder('customer-1', checkoutInput({
    paymentMethod: 'ONLINE',
    idempotencyKey: 'cancel-pending-checkout-001',
  }));
  orderRepository.attempts.push({
    _id: 'attempt-active-pending',
    orderId: order.id,
    paymentStatus: 'Pending',
    amount: 50,
    currency: 'VND',
    paymentLinkId: 'payos-link-pending',
  });

  const cancelled = await orderService.cancelOrder('customer-1', order.id, {
    cancelReason: 'Không cần nữa',
    idempotencyKey: 'cancel-pending-command-001',
  });

  assert.equal(cancelled.orderStatus, 'Cancelled');
  assert.equal(cancelled.paymentStatus, 'Cancelled');
  assert.equal(orderRepository.attempts.at(-1).paymentStatus, 'Cancelled');
  assert.deepEqual(retiredPaymentLinks, [{
    paymentLinkId: 'payos-link-pending',
    reason: 'Customer cancelled order',
  }]);
});
```

Run:

```powershell
cd D:\GreenHouse_System-main\server
node --test src/services/order.service.test.js --test-name-pattern="AT-233"
```

Expected: `FAIL` because `Paid` and `Pending` payment states are currently
rejected.

- [ ] **Step 2: Implement the refund handoff and payment-state rules**

In `order.service.js`:

1. Add `updateRefundPending` to the model repository using
   `RefundPending.findByIdAndUpdate`.
2. Add a private `buildPaymentReversalHandoff` matching the existing Staff
   handoff contract: obligation key `PAYMENT_REVERSAL:{paidAttemptId}`, amount
   from the immutable Order total, `RefundPending` status, and a
   `ReturnRefundRequest` with `ReadyForRefund` and the same obligation key.
3. Expand the cancellation payment predicate to
   `['Unpaid', 'Pending', 'Failed', 'Paid']`.
4. For `Paid`, retain Payment and PaymentAttempt as `Paid`, set
   `moneyObligationsSettled: false`, and call the handoff inside the same
   transaction.
5. For `COD`, retain `Unpaid`; for unpaid online, set Payment and only the
   active pending attempt to `Cancelled`.
6. Keep reservation release and post-commit audit behavior unchanged.

Do not call the PayOS cancel-link action for a paid attempt.

- [ ] **Step 3: Run cancellation tests and verify green**

Run:

```powershell
node --test src/services/order.service.test.js --test-name-pattern="AT-233|cancels a Pending unpaid|rejects customer cancellation of a paid"
```

Expected: all selected tests pass, including exactly one refund handoff on
replay and no reservation double-release.

- [ ] **Step 4: Update the Customer UI contract test first**

Change `OrderDetailPage.cancellation.test.js` so it requires:

```js
it('keeps Pending cancellation visible for payment states handled by the server', () => {
  assert.match(source, /order\\.orderStatus === 'Pending'/);
  assert.match(source, /\\['Unpaid', 'Pending', 'Failed', 'Paid'\\]/);
  assert.match(source, /RefundPending|quy trình hoàn tiền/i);
});
```

- [ ] **Step 5: Update UI copy and verify**

Keep the existing `Pending` predicate and make the paid warning say that the
order is cancelled while the verified payment is handed to the refund process.
Do not add a Customer-entered refund amount or destination to cancellation.

Run:

```powershell
cd D:\GreenHouse_System-main\client
node --test src/pages/customer/OrderDetailPage.cancellation.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add server/src/services/order.service.js server/src/services/order.service.test.js client/src/pages/customer/OrderDetailPage.jsx client/src/pages/customer/OrderDetailPage.cancellation.test.js
git commit -m "fix: complete pending customer cancellation guards"
```

### Task 3: Add explicit Phase 2 regression coverage for Staff, Warehouse, state, and delivery guards

**Files:**

- Modify: `server/src/services/staffOrder.service.test.js`
- Modify: `server/src/services/sl004Export.behavior.test.js`
- Modify: `server/src/services/sl004Fulfillment.behavior.test.js`

**Interfaces:**

- Existing `createStaffOrderService`, `createInventoryExportService`, and
  `createFulfillmentCommandService` APIs remain unchanged.
- The new acceptance cases live beside their existing in-memory harnesses and
  assert `idempotentReplay`, `409`, unchanged state, and one movement/event.

- [ ] **Step 1: Add red assertions for different-key duplicate commands**

Add this test to `staffOrder.service.test.js`:

```js
it('AT-229 rejects a second Staff confirmation with a new key and keeps one export request', async () => {
  await service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'confirm-001' });
  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'confirm-002' }),
    /Only Pending orders can be confirmed/,
  );
  assert.equal(orderRepository.orders[0].orderStatus, 'Confirmed');
  assert.equal(orderRepository.exports.length, 1);
});
```

Add this test to `sl004Export.behavior.test.js`:

```js
it('AT-230 replays a completed Warehouse export without another movement for a different key', async () => {
  const { service, state } = createHarness();
  await service.processStockExport('warehouse-1', 'export-1', { idempotencyKey: 'export-001' });
  const before = structuredClone({
    inventories: state.inventories,
    reservations: state.reservations,
    transactions: state.transactions,
  });
  const replay = await service.processStockExport('warehouse-2', 'export-1', { idempotencyKey: 'export-002' });
  assert.equal(replay.idempotentReplay, true);
  assert.deepEqual(state.inventories, before.inventories);
  assert.deepEqual(state.reservations, before.reservations);
  assert.deepEqual(state.transactions, before.transactions);
});
```

Add this test to `sl004Fulfillment.behavior.test.js`:

```js
it('AT-231 rejects delivery from a non-Shipped Order without appending an event', async () => {
  const { service, state, handoff } = createHarness();
  const { shipment } = await handoff('invalid-state-delivery');
  state.order.orderStatus = 'Confirmed';
  const before = structuredClone({ order: state.order, events: state.events, outbox: state.outbox });
  await assert.rejects(
    () => service.recordShipmentEvent(
      { actorType: 'Staff', actorId: 'staff-1' },
      shipment._id,
      {
        eventKey: 'invalid-state-delivery-event',
        eventType: 'DELIVERED',
        source: 'STAFF_EVIDENCE',
        occurredAt: '2026-07-24T10:00:00.000Z',
        evidenceReference: 'delivery-proof',
      },
    ),
    /requires an active Shipped order|requires a Shipped order/i,
  );
  assert.deepEqual(state.order, before.order);
  assert.deepEqual(state.events, before.events);
  assert.deepEqual(state.outbox, before.outbox);
});
```

The existing `AT-067` test remains the delivery-failure evidence for one
`ATTEMPT_FAILED` event and one notification on same-key replay.

Run the focused names before implementation:

```powershell
cd D:\GreenHouse_System-main\server
node --test src/services/staffOrder.service.test.js src/services/sl004Export.behavior.test.js src/services/sl004Fulfillment.behavior.test.js --test-name-pattern="AT-229|AT-230|AT-231"
```

Expected: the new assertions fail only where coverage is missing, not because
the existing state machine is broken.

- [ ] **Step 2: Run all Phase 2 server acceptance tests**

Run:

```powershell
node --test src/services/staffOrder.service.test.js src/services/sl004Export.behavior.test.js src/services/sl004Fulfillment.behavior.test.js
```

Expected: every selected test passes with zero duplicate export movements,
events, notifications, or state mutations.

- [ ] **Step 3: Commit Task 3**

```powershell
git add server/src/services/staffOrder.service.test.js server/src/services/sl004Export.behavior.test.js server/src/services/sl004Fulfillment.behavior.test.js
git commit -m "test: cover phase 2 fulfillment guards"
```

### Task 4: Prove API role boundaries at runtime

**Files:**

- Create: `server/src/routes/phase2BusinessGuards.routes.test.js`
- Inspect only: `server/src/routes/order.routes.js`
- Inspect only: `server/src/routes/staffOrder.routes.js`
- Inspect only: `server/src/routes/inventory.routes.js`
- Inspect only: `server/src/routes/fulfillment.routes.js`

**Interfaces:**

- Mount the existing routers under `/api` in an ephemeral Express server.
- Inject `{ id, role, status: 'Active' }` and `authSession` exactly as
  `auditLog.routes.test.js` does.

- [ ] **Step 1: Write the red runtime matrix**

At the top of the new test file import `assert`, `http`, `express`, and the
four existing route modules:

```js
const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it } = require('node:test');
const express = require('express');
const orderRoutes = require('./order.routes');
const staffOrderRoutes = require('./staffOrder.routes');
const inventoryRoutes = require('./inventory.routes');
const fulfillmentRoutes = require('./fulfillment.routes');
```

Use this matrix:

```js
const deniedCases = [
  ['Customer', '/api/staff/orders/order-1/confirm', 'POST'],
  ['WarehouseManager', '/api/staff/orders/order-1/confirm', 'POST'],
  ['Staff', '/api/warehouse/stock-exports/export-1/process', 'POST'],
  ['Customer', '/api/staff/shipments/shipment-1/events', 'POST'],
  ['Staff', '/api/orders/order-1/cancel', 'PATCH'],
];

async function withHttpServer(actor, callback) {
  const app = express();
  app.use(express.json());
  if (actor) {
    app.use((req, _res, next) => {
      req.user = actor;
      req.authSession = { id: `session-${actor.id}` };
      next();
    });
  }
  app.use('/api', orderRoutes);
  app.use('/api', staffOrderRoutes);
  app.use('/api', inventoryRoutes);
  app.use('/api', fulfillmentRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

it('AT-232 denies every protected Phase 2 command to the wrong role', async () => {
  for (const [role, path, method] of deniedCases) {
    await withHttpServer({ id: `actor-${role}`, role, status: 'Active' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({}),
      });
      const payload = await response.json();
      assert.equal(response.status, 403, `${role} ${method} ${path}`);
      assert.equal(payload.errorCode, 'ROLE_FORBIDDEN');
    });
  }
});
```

For every case assert status `403`, error code `ROLE_FORBIDDEN`, and that the
response is produced before the domain handler tries to access a database.
Also assert one valid role reaches the handler boundary with a stubbed service
response where the route already has a focused route test.

- [ ] **Step 2: Run the route test**

Run:

```powershell
node --test src/routes/phase2BusinessGuards.routes.test.js
```

Expected: red until the complete matrix is present; no production route change
is expected because the existing route declarations already enforce these
roles.

- [ ] **Step 3: Keep production code unchanged if the matrix passes**

If the test passes against the current routes, do not add duplicate middleware.
Only adjust a route if a denied case reaches its controller or returns a code
other than `ROLE_FORBIDDEN`.

- [ ] **Step 4: Commit Task 4**

```powershell
git add server/src/routes/phase2BusinessGuards.routes.test.js
git commit -m "test: prove phase 2 API role guards"
```

### Task 5: Lock Staff and Warehouse UI commands against rapid duplicate clicks

**Files:**

- Modify: `client/src/pages/warehouse/StockExportDetailPage.jsx`
- Modify: `client/src/pages/customer/CheckoutPage.jsx` from Task 1
- Modify: `client/src/pages/sl004UiContract.test.js`

**Interfaces:**

- `StockExportDetailPage` uses `processingRef` plus `processing` state.
- Existing Staff `runAction` continues to use `submittingRef` and displays
  `idempotentReplay`.

- [ ] **Step 1: Write the failing Warehouse UI assertion**

Add:

```js
it('AT-230 blocks a second Warehouse export click before React rerenders', () => {
  assert.match(exportDetail, /processingRef/);
  assert.match(exportDetail, /if \\(processingRef\\.current\\) return/);
  assert.match(exportDetail, /processingRef\\.current = true/);
});
```

- [ ] **Step 2: Run and verify red**

```powershell
cd D:\GreenHouse_System-main\client
node --test src/pages/sl004UiContract.test.js --test-name-pattern="second Warehouse export"
```

- [ ] **Step 3: Implement the ref lock and replay copy**

In `StockExportDetailPage.jsx`:

```jsx
const [processing, setProcessing] = useState(false);
const processingRef = useRef(false);

async function processExactExport() {
  if (processingRef.current) return;
  processingRef.current = true;
  setProcessing(true);
  try {
    // existing inventoryService.processStockExport call
  } finally {
    processingRef.current = false;
    setProcessing(false);
  }
}
```

Retain the existing same-key `AlreadyProcessed` message and do not create a
second key for a retry of the same request.

- [ ] **Step 4: Run focused UI tests**

```powershell
node --test src/pages/sl004UiContract.test.js src/pages/customer/CheckoutPage.test.js src/pages/customer/OrderDetailPage.cancellation.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit Task 5**

```powershell
git add client/src/pages/warehouse/StockExportDetailPage.jsx client/src/pages/sl004UiContract.test.js client/src/pages/customer/CheckoutPage.jsx client/src/pages/customer/CheckoutPage.test.js
git commit -m "fix: lock phase 2 command buttons"
```

### Task 6: Full verification and release evidence

**Files:**

- Inspect: `docs/superpowers/specs/2026-07-25-phase2-business-guards-design.md`
- No additional documentation or SRS/SDS edits.

- [ ] **Step 1: Run focused server verification**

```powershell
cd D:\GreenHouse_System-main\server
node --test src/services/order.service.test.js src/services/staffOrder.service.test.js src/services/sl004Export.behavior.test.js src/services/sl004Fulfillment.behavior.test.js src/routes/phase2BusinessGuards.routes.test.js
```

Expected: exit code `0` and zero failed tests.

- [ ] **Step 2: Run focused client verification**

```powershell
cd D:\GreenHouse_System-main\client
node --test src/pages/customer/CheckoutPage.test.js src/pages/customer/OrderDetailPage.cancellation.test.js src/pages/sl004UiContract.test.js
```

Expected: exit code `0` and zero failed tests.

- [ ] **Step 3: Run full server tests**

```powershell
cd D:\GreenHouse_System-main\server
npm test
```

Expected: exit code `0`; record the final `# tests` and `# fail 0` lines.

- [ ] **Step 4: Run full client tests and production build**

```powershell
cd D:\GreenHouse_System-main\client
npm test
npm run build
```

Expected: both exit code `0`. A pre-existing Vite chunk-size warning is
non-blocking unless it becomes an error.

- [ ] **Step 5: Check repository integrity**

```powershell
cd D:\GreenHouse_System-main
git diff --check
git status --short --branch
```

Expected: no tracked modifications or merge conflicts; only the pre-existing
untracked runtime logs and `.playwright-mcp/` remain.

- [ ] **Step 6: Push the feature branch**

```powershell
git push -u origin feature/phase2-business-guards
```

Report the branch commit and all test/build counts. Merge to `main` only after
the user explicitly asks for the merge.
