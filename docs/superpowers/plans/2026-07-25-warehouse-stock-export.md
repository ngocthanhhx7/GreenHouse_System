# Warehouse Stock Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Warehouse Manager export command atomically consume the exact order reservations, deduct inventory once, create one movement per order line, and complete the existing `StockExportRequest` safely.

**Architecture:** Reuse the existing Warehouse Manager routes, `inventoryExport.service.js`, processing lease, MongoDB transaction wrapper, reservation model, inventory model, movement idempotency indexes, and existing warehouse pages. Harden the existing Initial (`Confirmed → Completed`) path while preserving the already-supported Resend path.

**Tech Stack:** Node.js, Express, Mongoose, Node test runner, React/Vite.

## Global Constraints

- Only `WarehouseManager` may list, view, or process stock exports through the existing backend middleware.
- Do not trust role, user ID, price, quantity, or state sent by the frontend.
- Do not change `Packed`, `Shipped`, `Delivered`, COD payment, return, refund, or exchange behavior.
- Do not introduce a new collection or rewrite the inventory schema.
- Use the existing transaction manager and audit logger.
- Preserve the existing `Resend` export behavior and tests.
- A completed request must replay without any stock, reservation, movement, cycle, or audit side effect.

---

### Task 1: Add failing export-integrity and concurrency tests

**Files:**
- Modify: `server/src/services/sl004Export.behavior.test.js`
- Modify: `server/src/routes/phase2BusinessGuards.routes.test.js`

**Interfaces:**
- Consumes: existing `createInventoryExportService`, fake repository, route test app, and current `POST /api/warehouse/stock-exports/:id/process` endpoint.
- Produces: failing tests that define exact reservation lineage, quantity validation, stock guards, and Warehouse Manager-only access.

- [ ] **Step 1: Extend the export fixture with reservation product IDs and repository methods**

Update the fake reservations so each row contains the same `productId` and `quantity` as its order detail. Add fake repository methods with these signatures:

```js
async listOrderReservations(orderId) {
  return state.reservations.filter((row) => String(row.orderId) === String(orderId));
}

async claimOrderReservationConsumption(orderId, orderDetailId, productId, quantity) {
  const row = state.reservations.find((candidate) => (
    String(candidate.orderId) === String(orderId)
    && String(candidate.orderDetailId) === String(orderDetailId)
    && String(candidate.productId) === String(productId)
    && Number(candidate.quantity) === Number(quantity)
    && candidate.status === 'Reserved'
  ));
  if (!row) return null;
  row.status = 'Consumed';
  return { ...row };
}
```

- [ ] **Step 2: Add failing behavior tests for reservation mismatch and invalid quantities**

Add tests in `server/src/services/sl004Export.behavior.test.js` that mutate the fixture before calling the service:

```js
test('rejects a reservation whose product or quantity does not match the order detail', async () => {
  const harness = createHarness();
  harness.state.reservations[0].productId = 'different-product';
  await assert.rejects(
    () => harness.service.processStockExport('warehouse-1', 'export-1', { idempotencyKey: 'export-mismatch-1' }),
    (error) => error.errorCode === 'EXPORT_RESERVATION_MISSING',
  );
  assert.equal(harness.state.inventories[0].sellableQuantity, 10);
  assert.equal(harness.state.transactions.length, 0);
});

test('rejects zero, negative, and non-integer order quantities before mutation', async () => {
  for (const invalidQuantity of [0, -1, 1.5]) {
    const harness = createHarness();
    harness.state.details[0].quantity = invalidQuantity;
    await assert.rejects(
      () => harness.service.processStockExport('warehouse-1', 'export-1', {
        idempotencyKey: `export-invalid-${String(invalidQuantity).replace('.', '-')}`,
      }),
      (error) => error.errorCode === 'EXPORT_INVALID_REQUEST',
    );
    assert.equal(harness.state.inventories[0].sellableQuantity, 10);
    assert.equal(harness.state.transactions.length, 0);
  }
});
```

- [ ] **Step 3: Add failing tests for duplicate active reservations and physical-stock underflow**

Add one test that inserts a second `Reserved` row for the same order detail and expects `EXPORT_RESERVATION_MISSING`, and one test that sets `stockQuantity` below the detail quantity while leaving `sellableQuantity` high and expects `EXPORT_STOCK_INSUFFICIENT`. Assert that no reservation, inventory, or movement is changed.

- [ ] **Step 4: Add route authorization tests for Customer, Staff, and Admin**

Extend the existing route matrix for:

```text
POST /api/warehouse/stock-exports/export-1/process
```

Assert `403` for `Customer`, `Staff`, and `Admin`, and `2xx` only for `WarehouseManager` when the test fixture is valid.

- [ ] **Step 5: Run the new tests and verify they fail for the missing guards**

Run:

```powershell
cd server
node --test src/services/sl004Export.behavior.test.js src/routes/phase2BusinessGuards.routes.test.js
```

Expected: the existing happy-path tests pass, while the new exact-lineage, invalid-quantity, and stock-underflow tests fail because the current service only queries a reservation by order/detail and does not enforce all quantity guards.

- [ ] **Step 6: Commit the failing tests**

```powershell
git add server/src/services/sl004Export.behavior.test.js server/src/routes/phase2BusinessGuards.routes.test.js
git commit -m "test: define warehouse export integrity guards"
```

### Task 2: Harden the model repository's reservation and inventory updates

**Files:**
- Modify: `server/src/services/inventoryExport.service.js`

**Interfaces:**
- Consumes: `OrderReservation`, `Inventory`, and the existing Mongoose session.
- Produces: `listOrderReservations(orderId, session)`, exact reservation claim, and an atomic inventory capture that cannot make physical stock negative.

- [ ] **Step 1: Add a repository method for all order reservations**

Add this method next to `listOrderDetails`:

```js
async listOrderReservations(orderId, session) {
  return withOptionalSession(
    OrderReservation.find({ orderId }).sort({ createdAt: 1 }),
    session,
  ).lean();
}
```

- [ ] **Step 2: Replace the reservation claim signature and query**

Replace the current two-line claim method with:

```js
async claimOrderReservationConsumption(
  orderId,
  orderDetailId,
  productId,
  quantity,
  session,
) {
  return withOptionalSession(OrderReservation.findOneAndUpdate(
    {
      orderId,
      orderDetailId,
      productId,
      quantity,
      status: 'Reserved',
    },
    { $set: { status: 'Consumed' } },
    { new: true, runValidators: true },
  ), session).lean();
}
```

This makes the mutation itself safe even if another request changes the reservation between validation and claim.

- [ ] **Step 3: Require physical stock in the atomic inventory predicate**

Add `stockQuantity: { $gte: quantity }` to the `Inventory.findOneAndUpdate` predicate in `captureReservation`:

```js
{
  productId,
  inventoryHealth: { $ne: 'ReconciliationRequired' },
  stockQuantity: { $gte: quantity },
  sellableQuantity: { $gte: quantity },
  reservedQuantity: { $gte: quantity },
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```powershell
cd server
node --test src/services/sl004Export.behavior.test.js
```

Expected: the new tests still fail because the service has not yet called the new repository methods.

- [ ] **Step 5: Commit repository hardening**

```powershell
git add server/src/services/inventoryExport.service.js
git commit -m "fix: enforce exact reservation and stock claims"
```

### Task 3: Add service-level validation and availability invariants

**Files:**
- Modify: `server/src/services/inventoryExport.service.js`
- Modify: `server/src/services/sl004Export.behavior.test.js`

**Interfaces:**
- Consumes: `repository.listOrderReservations`, exact claim, and atomic inventory capture from Task 2.
- Produces: a service that validates the complete export set before mutation and preserves `availableQuantity`.

- [ ] **Step 1: Validate every order detail before the mutation loop**

Inside the business transaction, immediately after checking that `details.length > 0`, load all reservations and build active groups:

```js
const reservations = await repository.listOrderReservations(claimed.orderId, session);
const detailIds = new Set(details.map((detail) => String(detail._id)));
const activeReservations = reservations.filter((row) => row.status === 'Reserved');

if (activeReservations.some((row) => !detailIds.has(String(row.orderDetailId)))) {
  throw new ApiError(
    409,
    'Order contains a reservation that does not belong to an order line',
    [],
    'EXPORT_RESERVATION_MISSING',
  );
}

for (const detail of details) {
  const quantity = Number(detail.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(
      409,
      'Stock export requires positive integer quantities',
      [],
      'EXPORT_INVALID_REQUEST',
    );
  }
  const matches = activeReservations.filter((row) => (
    String(row.orderDetailId) === String(detail._id)
    && String(row.productId) === String(detail.productId)
    && Number(row.quantity) === quantity
  ));
  if (matches.length !== 1) {
    throw new ApiError(
      409,
      'Order reservation lineage is missing or does not match the order line',
      [],
      'EXPORT_RESERVATION_MISSING',
    );
  }
}
```

- [ ] **Step 2: Add an availability invariant around each inventory capture**

Before `captureReservation`, compute:

```js
const beforeSellable = Number(before.sellableQuantity ?? before.stockQuantity ?? 0);
const beforeReserved = Number(before.reservedQuantity || 0);
const beforeAvailable = beforeSellable - beforeReserved;
```

After capture, compute:

```js
const afterSellable = Number(after.sellableQuantity ?? after.stockQuantity ?? 0);
const afterReserved = Number(after.reservedQuantity || 0);
const afterAvailable = afterSellable - afterReserved;
if (afterAvailable !== beforeAvailable) {
  throw new ApiError(
    409,
    'Stock export would make available quantity inconsistent',
    [],
    'EXPORT_INVENTORY_INVARIANT',
  );
}
```

Keep the existing `beforeSellableQuantity` and `afterSellableQuantity` movement fields.

- [ ] **Step 3: Pass exact product and quantity into the reservation claim**

Change the service call to:

```js
const reservation = await repository.claimOrderReservationConsumption(
  order._id,
  detail._id,
  detail.productId,
  quantity,
  session,
);
```

- [ ] **Step 4: Make the fake transaction manager snapshot the new reservation fields**

Ensure the behavior-test harness snapshots and restores `productId`, `quantity`, and `status` for every reservation so any later-line failure proves the complete transaction rolled back.

- [ ] **Step 5: Run the focused behavior tests**

Run:

```powershell
cd server
node --test src/services/sl004Export.behavior.test.js
```

Expected: all SL-004 export tests pass, including the new exact-lineage, invalid-quantity, duplicate-reservation, stock-underflow, rollback, completed-replay, and concurrency cases.

- [ ] **Step 6: Commit the service hardening**

```powershell
git add server/src/services/inventoryExport.service.js server/src/services/sl004Export.behavior.test.js
git commit -m "fix: validate warehouse export invariants atomically"
```

### Task 4: Verify the Warehouse UI contract without expanding scope

**Files:**
- Inspect: `client/src/services/inventoryService.js`
- Inspect: `client/src/pages/warehouse/StockExportQueuePage.jsx`
- Inspect: `client/src/pages/warehouse/StockExportDetailPage.jsx`
- Modify only if a verification gap is found.

**Interfaces:**
- Consumes: the existing Warehouse Manager export endpoints and stable error response.
- Produces: a UI that cannot issue duplicate clicks and clearly reflects `Pending`, `Processing`, `Failed`, and `Completed`.

- [ ] **Step 1: Verify the API service sends only the idempotency header and note**

Confirm `processStockExport` strips `idempotencyKey` from the JSON body and sends it as `Idempotency-Key`. Do not add role, user ID, quantity, or state fields.

- [ ] **Step 2: Verify queue/detail rendering**

Confirm the queue shows request/order/status and the detail shows product names and quantities. Confirm the action button is rendered only for `Pending` and `Failed`, disabled while `processing` is true, and followed by `loadItem()` after success or failure.

- [ ] **Step 3: Apply only a minimal UI fix if needed**

If the inspection finds a missing requirement, make the smallest change in the existing page. Preserve the existing command key and do not add any shipping or packing control.

- [ ] **Step 4: Run the frontend lint/build command already defined by the project**

Run from the client package:

```powershell
cd client
npm run build
```

Expected: a successful Vite production build. If the package has no `build` script, run `npm run` first and use the existing production-check script without adding dependencies.

- [ ] **Step 5: Commit only if frontend files changed**

```powershell
git add client/src/services/inventoryService.js client/src/pages/warehouse/StockExportQueuePage.jsx client/src/pages/warehouse/StockExportDetailPage.jsx
git commit -m "fix: keep warehouse export action idempotent in UI"
```

### Task 5: Run the complete verification matrix

**Files:**
- Modify: none unless a failing test exposes a real defect.

**Interfaces:**
- Consumes: all implementation commits from Tasks 1–4.
- Produces: verified evidence for the Warehouse Manager export slice.

- [ ] **Step 1: Run focused service and route tests**

```powershell
cd server
node --test src/services/sl004Export.behavior.test.js src/routes/phase2BusinessGuards.routes.test.js
```

Expected: all focused tests pass.

- [ ] **Step 2: Run all server tests**

```powershell
cd server
npm test
```

Expected: no regression in Staff confirmation, checkout, inventory, fulfillment, or route authorization tests.

- [ ] **Step 3: Run the client production build**

```powershell
cd client
npm run build
```

Expected: successful build with no compile errors.

- [ ] **Step 4: Inspect the final diff and working tree**

```powershell
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- server/src/services/inventoryExport.service.js server/src/services/sl004Export.behavior.test.js server/src/routes/phase2BusinessGuards.routes.test.js
git status --short --branch
```

Expected: only the approved Warehouse export slice and its design/plan documents are present; no Packed, Shipped, Delivered, or payment changes are included.

- [ ] **Step 5: Record the final before/after evidence**

For a valid two-line order, record:

```text
before: stockQuantity, sellableQuantity, reservedQuantity,
        reservation statuses, transaction count, request status
after:  stockQuantity - quantity, sellableQuantity - quantity,
        reservedQuantity - quantity, Consumed reservations,
        one STOCK_EXPORT transaction per detail, Completed request
```

Also record that a replay and a concurrent request do not change these values a second time.
