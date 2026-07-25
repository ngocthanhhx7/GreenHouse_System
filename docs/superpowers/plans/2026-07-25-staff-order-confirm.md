# Staff Order Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reserved COD Order handoff from `Pending` to `Confirmed` atomic, role-protected, idempotent, auditable, and safe for a later Warehouse export.

**Architecture:** Keep the existing Mongoose repositories, Staff routes, assignment coordinator, fulfillment cycle, and normalized `StockExportRequest` model. The service will validate immutable `OrderDetail` plus exact active `OrderReservation` rows, atomically claim the Order, create one initial cycle/request, and write the audit event in the same MongoDB transaction. The API response resolves request items from immutable OrderDetails instead of persisting duplicate item lines.

**Tech Stack:** Node.js, Express, Mongoose/MongoDB transactions, Node test runner, React/Vite, existing Staff order service and pages.

## Global Constraints

- Only change reservation verification, Staff order list/detail, and Staff confirmation; do not implement Warehouse export, packing, shipping, delivery, COD collection, return, exchange, refund, reporting, or carrier integration.
- Authentication and role come only from the verified session/token; never trust role, user ID, status, quantity, or inventory facts from the request body.
- Checkout has already increased `reservedQuantity` and created one immutable reservation per detail; Staff confirmation does not change physical, sellable, or reserved quantities.
- COD confirmation requires `paymentMethod=COD` and `paymentStatus=Unpaid`; an existing online path remains eligible only when `paymentStatus=Paid`.
- A valid confirmation changes only `Pending -> Confirmed` and creates exactly one initial `FulfillmentCycle` and one `StockExportRequest`.
- Require an `Idempotency-Key` of 8–128 characters matching `[A-Za-z0-9:._-]+`.
- Same-key/same-facts replay returns the committed result; same-key/different-facts returns `409 ORDER_CONFIRM_KEY_REUSED`; a different key after confirmation returns `409 ORDER_CONFIRM_STALE_STATE`.
- Audit must be written inside the same transaction; an audit failure must roll back confirmation, cycle, and export request.
- Use the existing unique initial-request/cycle indexes and translate write conflicts into stable replay or `409` outcomes.
- Use simple Vietnamese messages at the API/UI boundary and keep `git diff --check` clean.

## File Map

| File | Responsibility in this plan |
| --- | --- |
| `server/src/models/order.model.js` | Persist immutable `confirmedBy` evidence beside `confirmedAt`. |
| `server/src/models/order.model.test.js` | Verify the confirmation evidence schema contract. |
| `server/src/services/staffOrder.service.js` | Enforce payment/order/reservation/inventory guards, resolve DTOs, perform the transaction, and map concurrency errors. |
| `server/src/services/staffOrder.service.test.js` | Red-green tests for exact reservation, COD eligibility, idempotency, concurrency, audit rollback, and one-request invariants. |
| `server/src/controller/staffOrder.controller.js` | Pass only the authenticated Staff identity, header key, and allow-listed note to the service. |
| `server/src/routes/phase2BusinessGuards.routes.test.js` | Keep the route-level Customer/Warehouse `403 ROLE_FORBIDDEN` proof and add the required-header contract. |
| `client/src/services/staffOrderService.js` | Send the idempotency key only as the header and send an allow-listed request body. |
| `client/src/services/staffOrderService.test.js` | Verify URL, header, body, and backend error-code propagation. |
| `client/src/pages/staff/codUiContract.test.js` | Preserve the existing lock/stable-key UI contract; no production page rewrite is expected. |

---

### Task 1: Add Confirmation Evidence to the Order Model

**Files:**
- Modify: `server/src/models/order.model.js:163-166`
- Modify: `server/src/models/order.model.test.js`

**Interfaces:**
- Consumes: Existing `Order` schema and `confirmedAt`.
- Produces: `Order.confirmedBy` as a nullable immutable `User` reference, available to `toOrderSummary()` and the Staff API.

- [ ] **Step 1: Write the failing schema tests**

Append this test to `server/src/models/order.model.test.js`:

```js
it('stores immutable Staff confirmation evidence', () => {
  const confirmedBy = Order.schema.path('confirmedBy');

  assert.ok(confirmedBy);
  assert.equal(confirmedBy.instance, 'ObjectId');
  assert.equal(confirmedBy.options.ref, 'User');
  assert.equal(confirmedBy.options.default, null);
  assert.equal(confirmedBy.options.immutable, true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `D:\GreenHouse_System-main\.worktrees\checkout-cod\server`:

```powershell
node --test src/models/order.model.test.js
```

Expected: FAIL because `Order.schema.path('confirmedBy')` is currently absent.

- [ ] **Step 3: Add the minimal schema field**

Insert this field immediately after `confirmedAt` in `server/src/models/order.model.js`:

```js
confirmedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null,
  immutable: true,
},
```

- [ ] **Step 4: Run the focused test and verify it passes**

```powershell
node --test src/models/order.model.test.js
```

Expected: all Order persistence tests pass.

- [ ] **Step 5: Commit**

```powershell
git add server/src/models/order.model.js server/src/models/order.model.test.js
git commit -m "feat: persist staff confirmation actor"
```

---

### Task 2: Enforce Exact Reservation and Build the Staff DTO

**Files:**
- Modify: `server/src/services/staffOrder.service.js:26-37,56-95,112-175,268-298`
- Modify: `server/src/services/staffOrder.service.test.js`

**Interfaces:**
- Consumes: `OrderDetail`, `OrderReservation`, `Inventory`, and existing repository methods.
- Produces: `findInitialStockExportRequest(orderId, session)`, strict `assertExactReservation(details, session)`, and `toStockExportRequest(request, details)` with `cycleId`, `requestKind`, and resolved `items`.

- [ ] **Step 1: Extend the fake repository and write failing tests**

In `createOrderRepository()` in `server/src/services/staffOrder.service.test.js`, add one active reservation matching `detail-1`:

```js
const reservations = [{
  _id: 'reservation-1',
  orderId: 'order-1',
  orderDetailId: 'detail-1',
  productId: 'p1',
  quantity: 2,
  status: 'Reserved',
}];
```

Expose it and add:

```js
reservations,
async listReservationsByOrder(orderId) {
  return reservations.filter((entry) => entry.orderId === orderId && entry.status === 'Reserved');
},
async findInitialStockExportRequest(orderId) {
  return exports.find((entry) => entry.orderId === orderId && entry.requestKind === 'Initial') || null;
},
```

Add these tests before the existing confirmation tests:

```js
it('rejects an order whose reservation rows do not exactly match its details', async () => {
  orderRepository.reservations[0].quantity = 1;

  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
    (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_RESERVATION_MISSING',
  );
  assert.equal(orderRepository.orders[0].orderStatus, 'Pending');
  assert.equal(orderRepository.exports.length, 0);
});

it('rejects an order with duplicate active reservations for one detail', async () => {
  orderRepository.reservations.push({
    ...orderRepository.reservations[0],
    _id: 'reservation-duplicate',
  });

  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
    (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_RESERVATION_MISSING',
  );
});

it('returns exact request metadata and immutable detail items', async () => {
  const result = await service.confirmOrder('staff-1', 'order-1', {
    idempotencyKey: 'staff-confirm-001',
    note: 'Reviewed',
  });

  assert.equal(result.stockExportRequest.cycleId, 'cycle-1');
  assert.equal(result.stockExportRequest.requestKind, 'Initial');
  assert.deepEqual(result.stockExportRequest.items, [{
    orderDetailId: 'detail-1',
    productId: 'p1',
    productNameSnapshot: 'Green Pan',
    quantity: 2,
  }]);
});
```

- [ ] **Step 2: Run the service tests and verify the new assertions fail**

```powershell
node --test src/services/staffOrder.service.test.js
```

Expected: the exact-row, duplicate-row, and DTO assertions fail against the current partial-reservation/limited-DTO implementation.

- [ ] **Step 3: Add required-key and note normalization helpers**

Keep `normalizeIdempotencyKey()` optional for Staff cancellation, and add this helper below it:

```js
function requireStaffConfirmIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!key) {
    throw new ApiError(
      400,
      'Thiếu mã chống gửi lặp cho thao tác xác nhận đơn.',
      [],
      'STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  try {
    return normalizeIdempotencyKey(key);
  } catch (_error) {
    throw new ApiError(
      400,
      'Mã chống gửi lặp không hợp lệ.',
      [],
      'STAFF_CONFIRM_IDEMPOTENCY_KEY_INVALID',
    );
  }
}

function normalizeConfirmationNote(value) {
  const note = String(value || '').trim();
  if (note.length > 500) {
    throw new ApiError(400, 'Ghi chú xác nhận không được vượt quá 500 ký tự.', [], 'VALIDATION_ERROR');
  }
  return note;
}
```

- [ ] **Step 4: Add the initial-request repository lookup**

Add this method beside the existing open/completed request lookups:

```js
async findInitialStockExportRequest(orderId, session) {
  return withOptionalSession(
    StockExportRequest.findOne({ orderId, requestKind: 'Initial' }),
    session,
  ).lean();
},
```

- [ ] **Step 5: Replace partial reservation validation with exact validation**

Replace `assertExactReservation()` with:

```js
async function assertExactReservation(details, session) {
  if (!details.length || !orderRepository.listReservationsByOrder) {
    throw new ApiError(409, 'Đơn chưa có dữ liệu giữ hàng đầy đủ.', [], 'ORDER_CONFIRM_RESERVATION_MISSING');
  }

  const reservations = await orderRepository.listReservationsByOrder(details[0].orderId, session);
  const byDetail = new Map();
  for (const reservation of reservations || []) {
    const key = String(reservation.orderDetailId);
    const rows = byDetail.get(key) || [];
    rows.push(reservation);
    byDetail.set(key, rows);
  }

  const requiredByProduct = new Map();
  for (const detail of details) {
    const quantity = Number(detail.quantity);
    const rows = byDetail.get(String(detail._id)) || [];
    if (
      rows.length !== 1
      || String(rows[0].orderId) !== String(detail.orderId)
      || String(rows[0].productId) !== String(detail.productId)
      || Number(rows[0].quantity) !== quantity
      || rows[0].status !== 'Reserved'
    ) {
      throw new ApiError(409, 'Dữ liệu giữ hàng của đơn không còn đầy đủ.', [], 'ORDER_CONFIRM_RESERVATION_MISSING');
    }
    const productId = String(detail.productId);
    requiredByProduct.set(productId, (requiredByProduct.get(productId) || 0) + quantity);
  }

  if (byDetail.size !== details.length) {
    throw new ApiError(409, 'Dữ liệu giữ hàng của đơn không khớp chi tiết đơn.', [], 'ORDER_CONFIRM_RESERVATION_MISSING');
  }

  for (const [productId, quantity] of requiredByProduct) {
    const inventory = await orderRepository.findInventoryByProductId(productId, session);
    const sellable = Number(inventory?.sellableQuantity ?? inventory?.stockQuantity ?? 0);
    const reserved = Number(inventory?.reservedQuantity || 0);
    if (!inventory || inventory.inventoryHealth !== 'Normal' || sellable < quantity || reserved < quantity) {
      throw new ApiError(409, 'Số lượng giữ hàng không còn đủ để xác nhận.', [], 'ORDER_CONFIRM_RESERVATION_MISSING');
    }
  }
}
```

- [ ] **Step 6: Resolve request items without duplicating persistence**

Replace `toStockExportRequest(request)` with:

```js
function toStockExportRequest(request, details = []) {
  return {
    id: String(request._id),
    orderId: String(request.orderId),
    cycleId: request.cycleId ? String(request.cycleId) : null,
    requestKind: request.requestKind,
    requestedBy: String(request.requestedBy),
    status: request.status,
    note: request.note || '',
    createdAt: request.createdAt,
    items: details.map((detail) => ({
      orderDetailId: String(detail._id),
      productId: String(detail.productId),
      productNameSnapshot: detail.productNameSnapshot,
      quantity: Number(detail.quantity),
    })),
  };
}
```

Update both `getOrder()` and `confirmOrder()` response construction to pass
`details` as the second argument. Prefer `findInitialStockExportRequest()` in
`getOrder()` so a cancelled/failed initial request is still visible as the
single historical handoff.

- [ ] **Step 7: Run the reservation/DTO tests and verify they pass**

```powershell
node --test src/services/staffOrder.service.test.js src/models/order.model.test.js
```

Expected: all existing tests plus the new reservation/DTO tests pass; the
required-key and payment-state tests are added in Task 3.

- [ ] **Step 8: Commit**

```powershell
git add server/src/services/staffOrder.service.js server/src/services/staffOrder.service.test.js
git commit -m "feat: validate exact order reservations"
```

---

### Task 3: Make Confirmation Atomic, Audited, and Concurrency-Safe

**Files:**
- Modify: `server/src/services/staffOrder.service.js:93-95,127-136,268-298,351-448`
- Modify: `server/src/services/staffOrder.service.test.js`

**Interfaces:**
- Consumes: Task 1 `Order.confirmedBy`, Task 2 strict reservation and DTO helpers, existing `assignmentCoordinator`, `transactionManager`, and `auditLogger.log(entry, session)`.
- Produces: `confirmOrder(staffId, orderId, { note, idempotencyKey })` with a committed result or a typed business error; one initial cycle/request/audit event.

- [ ] **Step 1: Write failing tests for atomic audit and replay rules**

Add these tests:

```js
it('requires an idempotency key before Staff confirmation', async () => {
  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { note: 'Reviewed' }),
    (error) => error.statusCode === 400 && error.errorCode === 'STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED',
  );
  assert.equal(orderRepository.orders[0].orderStatus, 'Pending');
  assert.equal(orderRepository.exports.length, 0);
});

it('requires COD to remain Unpaid at confirmation', async () => {
  orderRepository.orders[0].paymentStatus = 'Paid';

  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
    (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_PAYMENT_INVALID',
  );
});

it('stores the confirming Staff and writes audit inside the transaction session', async () => {
  const result = await service.confirmOrder('staff-1', 'order-1', {
    idempotencyKey: 'staff-confirm-001',
    note: 'Reviewed',
  });

  assert.equal(result.confirmedBy, 'staff-1');
  assert.equal(auditLogger.entries.length, 1);
  assert.equal(auditLogger.entries[0].actorId, 'staff-1');
  assert.equal(auditLogger.entries[0].actorRole, 'Staff');
  assert.equal(auditLogger.entries[0].previousState, 'Pending');
  assert.equal(auditLogger.entries[0].newState, 'Confirmed');
  assert.equal(auditLogger.entries[0].businessEventId, 'order:order-1:confirmed');
  assert.equal(auditLogger.entries[0].session.id, 'staff-test-session');
});

it('returns a typed stale-state error for a different key after confirmation', async () => {
  await service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' });

  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-002' }),
    (error) => error.statusCode === 409 && error.errorCode === 'ORDER_CONFIRM_STALE_STATE',
  );
  assert.equal(orderRepository.exports.length, 1);
  assert.equal(orderRepository.cycles.length, 1);
});

it('rolls back confirmation and export creation when audit fails', async () => {
  auditLogger.log = async () => { throw new Error('audit unavailable'); };
  const before = structuredClone(orderRepository.orders[0]);

  await assert.rejects(
    () => service.confirmOrder('staff-1', 'order-1', { idempotencyKey: 'staff-confirm-001' }),
    /audit unavailable/,
  );

  assert.deepEqual(orderRepository.orders[0], before);
  assert.equal(orderRepository.exports.length, 0);
  assert.equal(orderRepository.cycles.length, 0);
});
```

Update the fake `auditLogger.log(entry, session)` to store `{ ...entry, session }`.
For the rollback test, make the fake `transactionManager.withTransaction()` clone
`orders`, `exports`, and `cycles`, restore them in `catch`, then rethrow.

- [ ] **Step 2: Run the focused tests and verify they fail**

```powershell
node --test src/services/staffOrder.service.test.js
```

Expected: confirmation currently has no `confirmedBy`, audit runs after the
transaction without a session, the different-key error has the generic message,
and the fake rollback assertion fails.

- [ ] **Step 3: Tighten the conditional claim**

Change `claimStaffConfirmation()` to accept only valid payment combinations:

```js
async claimStaffConfirmation(id, data, session) {
  return withOptionalSession(Order.findOneAndUpdate(
    {
      _id: id,
      orderStatus: 'Pending',
      $or: [
        { paymentMethod: 'COD', paymentStatus: 'Unpaid' },
        { paymentMethod: 'ONLINE', paymentStatus: 'Paid' },
      ],
    },
    { $set: data },
    { new: true, runValidators: true },
  ), session).lean();
},
```

- [ ] **Step 4: Make the audit call session-aware**

Replace `writeAudit()` with:

```js
async function writeConfirmationAudit(staffId, order, request, note, idempotencyKey, session) {
  await auditLogger.log({
    actorType: 'User',
    actorId: String(staffId),
    actorRole: 'Staff',
    source: 'Application',
    action: 'STAFF_ORDER_CONFIRM',
    targetType: 'Order',
    targetId: String(order._id),
    outcome: 'Success',
    correlationId: idempotencyKey,
    businessEventId: `order:${String(order._id)}:confirmed`,
    previousState: 'Pending',
    newState: 'Confirmed',
    reasonCode: 'ORDER_CONFIRMED',
    reason: `Staff confirmed order ${order.orderCode}. ${note}`.trim(),
    safeFacts: {
      orderCode: order.orderCode,
      stockExportRequestId: String(request._id),
      requestKind: request.requestKind,
    },
  }, session);
}
```

- [ ] **Step 5: Replace the confirmation command**

Use this control flow in the returned service object:

```js
async confirmOrder(staffId, orderId, input = {}) {
  const note = normalizeConfirmationNote(input.note);
  const idempotencyKey = requireStaffConfirmIdempotencyKey(input.idempotencyKey);
  const requestHash = hashCommand({ note });

  try {
    const result = await transactionManager.withTransaction(async (session) => {
      await assignmentCoordinator.coordinate({ userId: staffId, expectedRole: 'Staff', session });
      const order = await getOrderOrThrow(orderId, session);

      if (order.staffConfirmIdempotencyKey === idempotencyKey) {
        if (order.staffConfirmRequestHash !== requestHash) {
          throw new ApiError(409, 'Mã xác nhận đã được dùng cho nội dung khác.', [], 'ORDER_CONFIRM_KEY_REUSED');
        }
        const details = await orderRepository.listOrderDetails(orderId, session);
        const request = await orderRepository.findInitialStockExportRequest(orderId, session);
        if (!request) throw new ApiError(409, 'Không tìm thấy kết quả xác nhận đã ghi nhận.', [], 'ORDER_CONFIRM_STALE_STATE');
        return { updated: order, details, stockExportRequest: request, idempotentReplay: true };
      }

      if (order.orderStatus !== 'Pending') {
        throw new ApiError(409, 'Đơn đã đổi trạng thái, không thể xác nhận lại.', [], 'ORDER_CONFIRM_STALE_STATE');
      }
      const paymentValid = (
        (order.paymentMethod === 'COD' && order.paymentStatus === 'Unpaid')
        || (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'Paid')
      );
      if (!paymentValid) {
        throw new ApiError(409, 'Trạng thái thanh toán chưa phù hợp để xác nhận đơn.', [], 'ORDER_CONFIRM_PAYMENT_INVALID');
      }
      const payment = await orderRepository.findPaymentByOrderId(orderId, session);
      if (
        !payment
        || payment.paymentMethod !== order.paymentMethod
        || payment.paymentStatus !== order.paymentStatus
      ) {
        throw new ApiError(409, 'Dữ liệu thanh toán của đơn không còn hợp lệ.', [], 'ORDER_CONFIRM_PAYMENT_INVALID');
      }

      const details = await orderRepository.listOrderDetails(orderId, session);
      if (!details.length) {
        throw new ApiError(409, 'Đơn chưa có sản phẩm để xác nhận.', [], 'ORDER_CONFIRM_RESERVATION_MISSING');
      }
      await assertExactReservation(details, session);

      const initialRequest = await orderRepository.findInitialStockExportRequest(orderId, session);
      if (initialRequest) {
        throw new ApiError(409, 'Đơn đã có phiếu xuất kho ban đầu.', [], 'ORDER_CONFIRM_STALE_STATE');
      }

      const now = new Date();
      const updated = await orderRepository.claimStaffConfirmation(orderId, {
        orderStatus: 'Confirmed',
        confirmedBy: staffId,
        confirmedAt: now,
        staffConfirmIdempotencyKey: idempotencyKey,
        staffConfirmRequestHash: requestHash,
      }, session);
      if (!updated) {
        throw new ApiError(409, 'Đơn đã được xử lý bởi yêu cầu khác.', [], 'ORDER_CONFIRM_CONCURRENT');
      }

      let cycle = orderRepository.findInitialFulfillmentCycle
        ? await orderRepository.findInitialFulfillmentCycle(orderId, session)
        : null;
      if (!cycle) {
        cycle = await orderRepository.createFulfillmentCycle({
          cycleKey: `fulfillment:${String(orderId)}:1`,
          orderId,
          cycleNumber: 1,
          cycleType: 'Initial',
          status: 'AwaitingExport',
          commandKey: idempotencyKey,
          createdBy: staffId,
        }, session);
      }
      const stockExportRequest = await orderRepository.createStockExportRequest({
        orderId,
        cycleId: cycle._id,
        requestKind: 'Initial',
        requestedBy: staffId,
        status: 'Pending',
        note,
      }, session);
      await writeConfirmationAudit(staffId, updated, stockExportRequest, note, idempotencyKey, session);
      return { updated, details, stockExportRequest, idempotentReplay: false };
    });

    return {
      ...toOrderDetail(result.updated, result.details),
      confirmedBy: result.updated.confirmedBy ? String(result.updated.confirmedBy) : null,
      confirmedAt: result.updated.confirmedAt || null,
      stockExportRequest: result.stockExportRequest
        ? toStockExportRequest(result.stockExportRequest, result.details)
        : null,
      idempotentReplay: Boolean(result.idempotentReplay),
    };
  } catch (error) {
    if (!isConfirmationWriteConflict(error)) throw error;
    const committed = await orderRepository.findOrderById(orderId);
    if (
      committed
      && committed.staffConfirmIdempotencyKey === idempotencyKey
      && committed.staffConfirmRequestHash === requestHash
    ) {
      const details = await orderRepository.listOrderDetails(orderId);
      const request = await orderRepository.findInitialStockExportRequest(orderId);
      return {
        ...toOrderDetail(committed, details),
        confirmedBy: committed.confirmedBy ? String(committed.confirmedBy) : null,
        confirmedAt: committed.confirmedAt || null,
        stockExportRequest: request ? toStockExportRequest(request, details) : null,
        idempotentReplay: true,
      };
    }
    throw new ApiError(409, 'Đơn đã được xử lý bởi yêu cầu khác.', [], 'ORDER_CONFIRM_CONCURRENT');
  }
},
```

Add this helper near the transaction manager:

```js
function isConfirmationWriteConflict(error) {
  return Boolean(
    error?.code === 11000
    || error?.errorLabels?.includes('TransientTransactionError')
    || error?.errorLabels?.includes('UnknownTransactionCommitResult')
    || /write conflict|duplicate key|transaction.*conflict/i.test(error?.message || ''),
  );
}
```

Update `toOrderSummary()` to include:

```js
confirmedBy: order.confirmedBy ? String(order.confirmedBy) : null,
confirmedAt: order.confirmedAt || null,
```

- [ ] **Step 6: Run all focused server tests**

```powershell
node --test src/services/staffOrder.service.test.js src/models/order.model.test.js src/models/stockExportRequest.model.test.js
```

Expected: all focused tests pass, including one-cycle/one-request, same-key
replay, different-key stale state, audit session, and rollback behavior.

- [ ] **Step 7: Commit**

```powershell
git add server/src/services/staffOrder.service.js server/src/services/staffOrder.service.test.js
git commit -m "feat: make staff confirmation atomic and idempotent"
```

---

### Task 4: Lock the HTTP and Frontend Command Contract

**Files:**
- Modify: `server/src/controller/staffOrder.controller.js:20-26`
- Modify: `server/src/routes/phase2BusinessGuards.routes.test.js`
- Modify: `client/src/services/staffOrderService.js:36-41`
- Modify: `client/src/services/staffOrderService.test.js:37-53`
- Verify: `client/src/pages/staff/StaffOrderDetailPage.jsx:140-148,365-370`
- Verify: `client/src/pages/staff/codUiContract.test.js:52-60`

**Interfaces:**
- Consumes: Task 3 service contract and current `authenticate`/`authorizeRoles('Staff')` middleware.
- Produces: `POST /api/staff/orders/:id/confirm` with header-only idempotency and no client-controlled actor/status data.

- [ ] **Step 1: Write failing client and route assertions**

Replace the current client confirmation test body with:

```js
it('sends the confirmation key as a header and excludes it from the body', async () => {
  const service = createStaffOrderService({
    baseUrl: 'http://api.test/api',
    fetcher: async (url, options) => {
      assert.equal(url, 'http://api.test/api/staff/orders/order-1/confirm');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Idempotency-Key'], 'staff-confirm-001');
      assert.deepEqual(JSON.parse(options.body), { note: 'Reviewed' });
      return {
        ok: true,
        json: async () => ({ success: true, data: { orderStatus: 'Confirmed' } }),
      };
    },
  });

  const result = await service.confirmOrder('order-1', {
    note: 'Reviewed',
    idempotencyKey: 'staff-confirm-001',
  });
  assert.equal(result.orderStatus, 'Confirmed');
});
```

Add to the route matrix loop a valid-looking Staff request without an
idempotency header only after the role-denial assertions:

```js
await withHttpServer(
  { id: 'staff-1', role: 'Staff', status: 'Active' },
  async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/staff/orders/order-1/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Reviewed' }),
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.errorCode, 'STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED');
  },
);
```

The wrong-role cases must continue to return `403 ROLE_FORBIDDEN` before the
required-key validation.

- [ ] **Step 2: Run the focused client/route tests and verify the client assertion fails**

From `server`:

```powershell
node --test src/routes/phase2BusinessGuards.routes.test.js
```

From `client`:

```powershell
node --test src/services/staffOrderService.test.js src/pages/staff/codUiContract.test.js
```

Expected: the client body currently contains `idempotencyKey`; the route role
matrix remains green.

- [ ] **Step 3: Allow-list the controller input**

Replace the current `confirmOrder` controller call with:

```js
return sendSuccess(res, await staffOrderService.confirmOrder(
  req.user.id,
  req.params.id,
  {
    note: req.body?.note,
    idempotencyKey: req.get('Idempotency-Key'),
  },
), 'Đã xác nhận đơn.');
```

This prevents a body-supplied role/user/status/quantity from entering the
command and makes the header mandatory.

- [ ] **Step 4: Strip the key from the frontend JSON body**

Replace the client method with:

```js
async confirmOrder(id, input = {}) {
  const { idempotencyKey, note } = input;
  return request(`/staff/orders/${id}/confirm`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ note }),
  });
},
```

`parseResponse()` already copies `errorCode`, `errors`, and `data`; retain
that behavior so `ORDER_CONFIRM_*` messages reach the Staff page.

- [ ] **Step 5: Verify the existing Staff page contract**

Do not rewrite `StaffOrderDetailPage.jsx`. Confirm that its existing code:

```js
staffOrderService.confirmOrder(order.id, {
  idempotencyKey: idempotencyKey(`confirm:${order.id}`),
})
```

keeps the button disabled through `submitting`, stores one stable key in
`commandKeys.current`, reloads the committed Order after success, and displays
the service error message. If a test fails, make only the smallest assertion
or error-copy change needed; do not move authorization or state checks into
the page.

- [ ] **Step 6: Run focused HTTP and client tests**

```powershell
# server
node --test src/routes/phase2BusinessGuards.routes.test.js src/services/staffOrder.service.test.js

# client
node --test src/services/staffOrderService.test.js src/pages/staff/codUiContract.test.js
```

Expected: Customer and Warehouse Manager remain `403`; valid Staff requests
use the header-only key; the UI still locks duplicate clicks.

- [ ] **Step 7: Commit**

```powershell
git add server/src/controller/staffOrder.controller.js server/src/routes/phase2BusinessGuards.routes.test.js client/src/services/staffOrderService.js client/src/services/staffOrderService.test.js client/src/pages/staff/codUiContract.test.js
git commit -m "feat: enforce staff confirmation command contract"
```

---

### Task 5: Regression, End-to-End Evidence, and Handoff

**Files:**
- Verify: `server/src/services/staffOrder.service.js`
- Verify: `server/src/services/staffOrder.service.test.js`
- Verify: `server/src/routes/phase2BusinessGuards.routes.test.js`
- Verify: `client/src/services/staffOrderService.test.js`
- Verify: `client/src/pages/staff/codUiContract.test.js`
- Do not change seed or Warehouse files unless a test proves the existing demo fixture cannot create a reserved Pending COD Order.

**Interfaces:**
- Consumes: Tasks 1–4 committed code and existing checkout/seed behavior.
- Produces: recorded test evidence proving the slice ends at one Pending StockExportRequest and does not process Warehouse export.

- [ ] **Step 1: Run the focused backend acceptance set**

From `server`:

```powershell
node --test src/services/staffOrder.service.test.js src/services/order.service.test.js src/routes/phase2BusinessGuards.routes.test.js src/models/order.model.test.js src/models/stockExportRequest.model.test.js
```

Expected: all tests pass; the service test reports one `Confirmed` Order, one
initial cycle, one `Pending` StockExportRequest, and unchanged inventory.

- [ ] **Step 2: Run the focused frontend acceptance set**

From `client`:

```powershell
node --test src/services/staffOrderService.test.js src/pages/staff/codUiContract.test.js
```

Expected: list/filter/detail/confirm calls use the Staff API, the key is stable
and header-only, and rapid clicks are locked.

- [ ] **Step 3: Run full regression and build**

```powershell
# server
npm test

# client
npm test
npm run build
```

Expected: zero test failures; build succeeds. A bundle-size warning is
acceptable only if it is the pre-existing warning and not caused by this slice.

- [ ] **Step 4: Check formatting and scope**

From the worktree root:

```powershell
git diff --check HEAD~4..HEAD
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors, no unrelated files, and no Warehouse/export
implementation changes.

- [ ] **Step 5: Manual demo verification**

Using a seeded Customer and Staff account:

1. Customer checks out one active product as COD.
2. Verify the Order is `Pending`, Payment is `Unpaid`, inventory
   `sellableQuantity` is unchanged, and one active reservation exists.
3. Staff opens `GET /api/staff/orders?status=Pending` and the detail page.
4. Staff confirms once with the generated key.
5. Verify Order is `Confirmed`, `confirmedBy`/`confirmedAt` are present, one
   `Initial` request is `Pending`, and its resolved `items` exactly match the
   immutable OrderDetails.
6. Refresh the Staff detail page and verify the same request is displayed.
7. Repeat the same command key and verify replay; try a new key and verify
   `409 ORDER_CONFIRM_STALE_STATE`.
8. Call the endpoint with Customer and Warehouse Manager tokens and verify
   `403 ROLE_FORBIDDEN`.
9. Confirm no Warehouse processing endpoint was called and no inventory
   quantity was consumed.

- [ ] **Step 6: Commit only verification adjustments**

If Task 5 requires a test-only fixture correction, commit it separately:

```powershell
git add server client
git commit -m "test: record staff confirmation acceptance evidence"
```

Do not claim the slice complete until the Customer-to-Confirmed manual path,
all negative cases, full suites, and build have passed.

---

## Self-Review Checklist

- **Spec coverage:** Tasks 1–2 cover `confirmedBy`, COD/online payment
  eligibility, exact active reservations, inventory health/counters, DTO items,
  and one initial request. Task 3 covers atomic claim, cycle/request creation,
  audit rollback, replay, and concurrent write conflicts. Task 4 covers
  authenticated identity, exact Staff middleware, header-only idempotency, and
  UI locking. Task 5 covers every required acceptance case and the explicit
  Warehouse boundary.
- **Completeness scan:** The plan contains no unfinished-marker instructions
  and every implementation step includes concrete files, code, and commands.
- **Type/interface consistency:** `confirmOrder(staffId, orderId,
  { note, idempotencyKey })`, `findInitialStockExportRequest(orderId,
  session)`, `toStockExportRequest(request, details)`, and
  `auditLogger.log(entry, session)` are used consistently in all tasks.
- **Scope check:** No new schema for request lines, no physical stock
  decrement, no Warehouse command, and no payment/refund/return work are
  introduced.
