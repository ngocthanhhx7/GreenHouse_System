# Customer Delivery Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate physical delivery evidence from Customer completion, add the two Customer receipt actions, and start the five-day after-sales period only when the Customer confirms receipt.

**Architecture:** Keep `Order.orderStatus = Delivered` as the immutable physical fact. Add an append-only `CustomerDeliveryReceipt` aggregate and one transactional Customer command; derive Customer order tabs/actions and all Review/Exchange/Return gates from the effective receipt projection.

**Tech Stack:** Node.js, Express, Mongoose transactions/indexes, React, native Node test runner, Vite.

---

## Verified task evidence (2026-07-26)

- Task 1 model and schema-alignment contract: 11 passing assertions.
- Task 2 receipt service: the focused unit variants reported 46 and 32 passing assertions.
- Task 3 API and projection gate: 90 passing assertions.
- Task 4 direct after-sales gates: 161 passing assertions.
- Task 6 migration contract was observed RED at 0/6 because the module and npm
  commands were absent, then GREEN at 6/6 after the index-only migration.
- The duplicate command-identity P1 was observed RED at 6/7, then GREEN at 7/7
  after fail-closed preflight was added.
- Task 5 client count remains pending the isolated client task's final evidence;
  this document deliberately does not estimate it.
- The current combined server receipt-targeted command passed 270/270; it is not
  a substitute for the final full server/client/build gates.

### Task 1: Persist append-only Customer receipt decisions

**Files:**
- Create: `server/src/models/customerDeliveryReceipt.model.js`
- Create: `server/src/models/customerDeliveryReceipt.model.test.js`
- Modify: `server/src/models/schemaAlignment.model.test.js`

- [ ] **Step 1: Write failing model tests**

Assert the schema has immutable order/customer/shipment/delivery-event/outcome/respondedAt/idempotency/request-hash fields, optional reason/supersedes, immutable deadline snapshots, unique Customer command identity, one terminal `RECEIVED` per order, and history/dispute indexes.

- [ ] **Step 2: Run the model tests and verify RED**

Run: `node --test src/models/customerDeliveryReceipt.model.test.js src/models/schemaAlignment.model.test.js`
Expected: FAIL because `customerDeliveryReceipt.model.js` does not exist.

- [ ] **Step 3: Implement the minimal schema**

Use `outcome: ['RECEIVED', 'NOT_RECEIVED']`, bounded strings, immutable timestamps, and a partial unique index:

```js
schema.index(
  { orderId: 1, outcome: 1 },
  { unique: true, partialFilterExpression: { outcome: 'RECEIVED' }, name: 'customer_receipt_terminal_unique' }
);
schema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true, name: 'customer_receipt_command_unique' });
```

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Implement the transactional Customer command

**Files:**
- Create: `server/src/services/customerDeliveryReceipt.service.js`
- Create: `server/src/services/customerDeliveryReceipt.service.test.js`
- Modify: `server/src/utils/apiError.js` only if typed error construction requires no existing helper.

- [ ] **Step 1: Write failing service tests**

Use an injected repository/transaction/audit/outbox harness. Cover ownership-safe 404, authoritative delivery/event binding, `RECEIVED`, required `NOT_RECEIVED` reason, later receipt superseding dispute, terminal receipt conflict, same-key replay, changed-facts reuse, concurrent winner, and rollback when Audit/Outbox fails.

- [ ] **Step 2: Verify RED**

Run: `node --test src/services/customerDeliveryReceipt.service.test.js`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement canonical normalization and command**

Expose:

```js
createCustomerDeliveryReceiptService(dependencies).recordDecision(customerId, orderId, {
  outcome,
  expectedDeliveryEventId,
  reason,
  idempotencyKey,
})
```

The transaction must verify owned `Delivered` Order, latest terminal Shipment and exact `DELIVERED` event; append one receipt; on `RECEIVED` calculate both deadlines as `respondedAt + 5 days` and update the Order projection; append redacted Audit and DomainOutbox. Do not edit Shipment/ShipmentEvent evidence.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: all receipt service tests PASS.

### Task 3: Expose the Customer API and authoritative projections

**Files:**
- Modify: `server/src/routes/order.routes.js`
- Modify: `server/src/controller/order.controller.js`
- Modify: `server/src/controller/order.controller.test.js`
- Modify: `server/src/services/order.service.js`
- Modify: `server/src/services/order.service.test.js`
- Modify: `server/src/services/fulfillment.service.js`
- Modify: `server/src/services/sl004Fulfillment.behavior.test.js`

- [ ] **Step 1: Write failing route/controller/projection tests**

Require Customer-only `POST /orders/:id/delivery-confirmation`, header-bound idempotency, exact body fields, safe typed errors, and Customer order/fulfillment projections containing:

```js
{
  customerOrderStatus,
  deliveryReceipt: { status, latestDecisionAt, reason },
  availableDeliveryActions,
  afterSales: { receiptGatePassed, enabled, blockReason }
}
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/controller/order.controller.test.js src/services/order.service.test.js src/services/sl004Fulfillment.behavior.test.js`
Expected: new assertions FAIL.

- [ ] **Step 3: Implement route, controller, and batched projection reads**

Bind `Idempotency-Key` at the controller. For order lists, query receipt rows in one batched read by order IDs. Never infer receipt from `deliveredAt`.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 4: Enforce receipt at every after-sales boundary

**Files:**
- Modify: `server/src/services/exchange.service.js`
- Modify: `server/src/services/exchange.service.test.js`
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/returnRefund.service.test.js`
- Modify: `server/src/services/review.service.js`
- Modify: `server/src/services/review.service.test.js`
- Modify: `server/src/acceptance/sl008.acceptance.test.js`

- [ ] **Step 1: Write failing direct-service tests**

Prove Awaiting/Disputed receipt blocks direct Review/Exchange/Return calls with typed errors, Received unlocks the receipt gate, and the deadlines come from the Customer receipt snapshot. Keep COD discrepancy/active-case/deadline rules additive.

- [ ] **Step 2: Verify RED**

Run the exact affected service test files. Expected: failures because gates currently use `orderStatus === 'Delivered'`.

- [ ] **Step 3: Implement one reusable receipt-gate helper**

Create a focused helper inside the owning receipt service or a small `customerDeliveryReceiptPolicy.js`; it must return typed gate facts and avoid duplicating status logic across three services.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 5: Add Customer UI, order tabs, and client command

**Files:**
- Modify: `client/src/services/orderService.js`
- Modify: `client/src/services/orderService.test.js`
- Modify: `client/src/pages/customer/OrderDetailPage.jsx`
- Modify: `client/src/pages/customer/orderHistoryView.js`
- Modify: `client/src/pages/customer/orderHistoryView.test.js`
- Modify: `client/src/pages/customer/reviewWorkspace.js`
- Create: `client/src/pages/customer/customerDeliveryReceiptUiContract.test.js`
- Modify: `client/src/styles.css`

- [ ] **Step 1: Write failing client/service/UI contract tests**

Cover exact labels, no actions before physical delivery, Awaiting under `Đang giao`, Received under `Hoàn thành`, Disputed blocked, stable idempotency key, reason validation, duplicate lock, canonical reload, Review/Exchange/Return visibility, alerts, dialog accessibility, and mobile stacked controls.

- [ ] **Step 2: Verify RED**

Run: `node --test src/services/orderService.test.js src/pages/customer/orderHistoryView.test.js src/pages/customer/customerDeliveryReceiptUiContract.test.js`
Expected: FAIL because the command/UI do not exist.

- [ ] **Step 3: Implement minimal UI**

Add `orderService.recordDeliveryConfirmation(id, input, idempotencyKey)`. Use a synchronous `useRef` lock and retain one key through ambiguous retries. Render the card below progress; `NOT_RECEIVED` requires 10–500 characters; reload server projection before unlocking after-sales.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and existing after-sales/review UI contract tests. Expected: PASS.

### Task 6: Migration and release documentation

**Files:**
- Create: `server/src/scripts/migrateCustomerDeliveryReceipt.js`
- Create: `server/src/scripts/migrateCustomerDeliveryReceipt.test.js`
- Modify: `server/package.json`
- Modify: `docs/member-plans/04_NGUYEN_HUU_ANH_NHAT_PLAN.md`
- Modify: `docs/reviews/SL-004_G3_TRACEABILITY.md`
- Modify: `docs/reviews/SL-004_HANDOFF.md`
- Modify: `docs/reviews/SL-004_RELEASE_AUDIT.md`

- [x] **Step 1: Write failing migration tests**

Prove dry-run writes nothing, apply creates repeat-safe indexes, verify checks exact definitions, second apply performs zero business writes, and legacy Delivered orders are never backfilled Received.

- [x] **Step 2: Verify RED**

Run: `node --test src/scripts/migrateCustomerDeliveryReceipt.test.js`. Expected: FAIL.

- [x] **Step 3: Implement migration and update actual traceability**

Add npm scripts for dry-run/apply/verify. Update docs only with commands and counts actually observed after verification; explicitly supersede physical-delivery deadline language.

- [x] **Step 4: Verify targeted gates**

Run all files changed in Tasks 1–6, `git diff --check`, and a forbidden-file/secret scan. Expected: PASS and no files outside this feature.
