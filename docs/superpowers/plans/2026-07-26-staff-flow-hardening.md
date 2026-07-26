# Staff Flow Business and Queue Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the working COD happy path while correcting Staff manual
evidence, failed-delivery, after-sales, audit/outbox, Damage Report, and
operational queue behavior approved in the 2026-07-26 design.

**Architecture:** Extend the existing Express/Mongoose services and React/Vite
pages in place. Business state remains server-owned; multi-document facts use
the existing MongoDB transaction managers; queue APIs retain `items` and
`total` while adding bounded paging metadata. Legacy evidence/status values
remain readable, but new writes use the approved canonical behavior.

**Tech Stack:** Node.js 22 test runner, Express 4, Mongoose 8, React 19, Vite 6,
MongoDB replica-set transactions.

## Global Constraints

- Keep `Pending -> Confirmed -> Packed -> Shipped -> Delivered` unchanged.
- Do not add a Carrier API or trust frontend role, amount, state, Customer ID,
  price, or inventory authority.
- New Staff Carrier/COD evidence writes
  `STAFF_RECORDED_CARRIER_EVIDENCE`; legacy source values remain readable.
- New failed-delivery resolutions keep the Order projection `Shipped`;
  shipment/incident facts carry failure and terminal resolution.
- Pagination defaults to page 1 and 20 items, caps page size at 100, and sorts
  by `createdAt DESC, _id DESC`.
- Code search is limited to `orderCode` and `requestCode`; no Customer
  personal-data search.
- Staff lists only Damage Reports created by the authenticated Staff member.
- Preserve Support `New -> InProgress -> Resolved` and Review
  `Allowed <-> HiddenByStaff`.
- Do not copy or delete unrelated files from the dirty
  `fix/after-sales-business-rules` worktree.

---

### Task 1: Canonical Staff Carrier and COD evidence

**Files:**
- Modify: `server/src/models/shipmentEvent.model.js`
- Modify: `server/src/models/codEvidence.model.js`
- Modify: `server/src/models/exchangeShipmentEvent.model.js`
- Modify: `server/src/controller/fulfillment.controller.js`
- Modify: `server/src/services/fulfillment.service.js`
- Modify: `server/src/services/fulfillmentCommand.service.js`
- Modify: `server/src/services/codReconciliation.service.js`
- Modify: `server/src/services/exchange.service.js`
- Modify: `client/src/pages/staff/StaffOrderDetailPage.jsx`
- Test: `server/src/services/sl004Fulfillment.behavior.test.js`
- Test: `server/src/models/codEvidence.model.test.js`
- Test: `server/src/routes/sl004.routes.test.js`
- Test: `client/src/pages/staff/codUiContract.test.js`

**Interfaces:**
- Consumes: existing `recordShipmentEvent(actorContext, shipmentId, input)`.
- Produces: new writes with
  `source='STAFF_RECORDED_CARRIER_EVIDENCE'`; projection capability
  `manualCodReconciliation=true` in every runtime.

- [ ] **Step 1: Change the tests to the approved source and production behavior**

Update focused assertions to require:

```js
assert.equal(productionProjection.capabilities.manualCodReconciliation, true);
assert.equal(manual.state.codEvidence[0].source, 'STAFF_RECORDED_CARRIER_EVIDENCE');
assert.ok(CodEvidence.schema.path('source').enumValues.includes(
  'STAFF_RECORDED_CARRIER_EVIDENCE'
));
```

Retain assertions that legacy `STAFF_EVIDENCE` and `STAFF_RECONCILIATION`
remain valid enum values.

- [ ] **Step 2: Run the focused tests and observe the expected red result**

Run:

```powershell
Set-Location server
node --test src/models/codEvidence.model.test.js src/routes/sl004.routes.test.js src/services/sl004Fulfillment.behavior.test.js
Set-Location ..\client
node --test src/pages/staff/codUiContract.test.js
```

Expected: failures show production capability `false`, production Staff COD
rejection, or a legacy Staff source value.

- [ ] **Step 3: Implement canonical writes with legacy read compatibility**

Use one constant in each touched service:

```js
const STAFF_CARRIER_EVIDENCE_SOURCE = 'STAFF_RECORDED_CARRIER_EVIDENCE';
const STAFF_SOURCE_VALUES = new Set([
  STAFF_CARRIER_EVIDENCE_SOURCE,
  'STAFF_EVIDENCE',
  'STAFF_RECONCILIATION',
]);
```

Add the canonical value to model enums, replace new Staff writes and controller
injection with it, accept legacy values only while loading/replaying, remove
both production-only Staff COD rejection branches, and expose:

```js
capabilities: {
  ...existingCapabilities,
  manualCodReconciliation: true,
}
```

Do not loosen Staff authentication, fixed COD amount validation, operational
evidence verification, event idempotency, or the `Shipped -> Delivered` guard.

- [ ] **Step 4: Run the focused tests until green**

Run the commands from Step 2.

Expected: all selected server and client tests pass.

- [ ] **Step 5: Commit the isolated slice**

```powershell
git add server/src/models server/src/controller/fulfillment.controller.js server/src/services/fulfillment.service.js server/src/services/fulfillmentCommand.service.js server/src/services/codReconciliation.service.js server/src/services/exchange.service.js server/src/routes/sl004.routes.test.js server/src/services/sl004Fulfillment.behavior.test.js client/src/pages/staff/StaffOrderDetailPage.jsx client/src/pages/staff/codUiContract.test.js
git commit -m "fix: allow canonical staff carrier evidence"
```

### Task 2: Keep failed delivery on the Shipped Order projection

**Files:**
- Modify: `server/src/services/deliveryResolution.service.js`
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/report.service.js`
- Modify: `server/src/utils/orderStateMachine.js`
- Modify: `client/src/pages/staff/StaffOrderDetailPage.jsx`
- Modify: `client/src/pages/staff/StaffOrderQueuePage.jsx`
- Modify: `client/src/utils/orderProgress.js`
- Modify: `client/src/pages/customer/orderHistoryView.js`
- Test: `server/src/services/sl004Fulfillment.behavior.test.js`
- Test: `server/src/services/returnRefund.service.test.js`
- Test: `server/src/utils/orderStateMachine.test.js`
- Test: `client/src/pages/sl004UiContract.test.js`
- Test: `client/src/pages/customer/orderHistoryView.test.js`

**Interfaces:**
- Consumes: existing `resolveDeliveryFailure(staffId, orderId, input)`.
- Produces: resolved incident with `OrderStatus='Shipped'`,
  `deliveryResolutionCommandKey`, and exactly-once payment/refund consequence.

- [ ] **Step 1: Write red regression expectations**

Change terminal-resolution assertions from:

```js
assert.equal(result.order.orderStatus, 'DeliveryFailed');
```

to:

```js
assert.equal(result.order.orderStatus, 'Shipped');
assert.equal(result.incident.status, 'Resolved');
assert.equal(result.order.deliveryResolutionCommandKey, commandKey);
```

Add assertions that COD remains non-Paid and online paid refund obligations are
still created exactly once.

- [ ] **Step 2: Run the focused failed-delivery tests**

```powershell
Set-Location server
node --test src/services/sl004Fulfillment.behavior.test.js src/services/returnRefund.service.test.js src/utils/orderStateMachine.test.js
Set-Location ..\client
node --test src/pages/sl004UiContract.test.js src/pages/customer/orderHistoryView.test.js
```

Expected: current terminal resolution returns `DeliveryFailed` and stale UI
contracts still mention that new transition.

- [ ] **Step 3: Change only new terminal writes**

In `resolveDeliveryFailure`, replace the status rewrite with:

```js
const orderPatch = {
  moneyObligationsSettled: false,
  deliveryResolutionCommandKey: commandKey,
};
```

Continue claiming from `Shipped`, close the incident/cycle, create the fixed
money consequence, audit, and outbox in the same transaction. Update report
logic to derive terminal failure from resolved delivery incidents rather than
requiring a new `DeliveryFailed` Order. Keep the model enum and legacy UI
formatter support so old records still render.

- [ ] **Step 4: Remove the new transition from state helpers without deleting legacy read support**

Use:

```js
const transitions = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Packed', 'Cancelled'],
  Packed: ['Shipped'],
  Shipped: ['Delivered'],
  Delivered: ['Returned'],
};
```

Legacy `DeliveryFailed` remains terminal when read. Update Staff copy to say
that a terminal delivery incident and money obligation were recorded while the
Order remains in the shipping stage.

- [ ] **Step 5: Run focused tests and commit**

Run Step 2, then:

```powershell
git add server/src/services/deliveryResolution.service.js server/src/services/returnRefund.service.js server/src/services/report.service.js server/src/utils/orderStateMachine.js server/src/services/sl004Fulfillment.behavior.test.js server/src/services/returnRefund.service.test.js server/src/utils/orderStateMachine.test.js client/src/pages/staff/StaffOrderDetailPage.jsx client/src/pages/staff/StaffOrderQueuePage.jsx client/src/utils/orderProgress.js client/src/pages/customer/orderHistoryView.js client/src/pages/sl004UiContract.test.js client/src/pages/customer/orderHistoryView.test.js
git commit -m "fix: keep failed delivery on shipped projection"
```

### Task 3: Reconcile Return, Exchange, and COD guards

**Files:**
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/exchange.service.js`
- Modify: `server/src/services/codReconciliation.service.js`
- Modify: `client/src/utils/exchangeUiState.js`
- Modify: `client/src/pages/customer/ExchangeDetailPage.jsx`
- Test: `server/src/services/returnRefund.service.test.js`
- Test: `server/src/services/exchange.service.test.js`
- Test: `server/src/services/codReconciliation.service.test.js`
- Test: `client/src/utils/exchangeUiState.test.js`
- Test: `client/src/pages/afterSalesSourceContract.test.js`

**Interfaces:**
- Consumes: the inspected, uncommitted guard diff in
  `.worktrees/checkout-cod`.
- Produces: server-derived Exchange-to-Return payment/COD state, terminal
  destination guard, post-handoff cancellation guard, and synchronized
  `CodDiscrepancy`.

- [ ] **Step 1: Port only the guard tests from the dirty worktree**

Use `git diff --no-index`/manual inspection to bring across tests for:

```js
await assert.rejects(
  () => service.verifyDestination(staffId, terminalRequestId, input),
  /no longer accepts refund destination verification/i
);
await assert.rejects(
  () => service.cancelRequest(customerId, handedOffCaseId, input),
  /physical handoff|incident/i
);
```

Also port tests proving `convertToReturn` loads Order and Payment, sets
`paymentId`, chooses `AwaitingCODReconciliation` for an unresolved COD hold,
and synchronizes discrepancy collection/recovery fields.

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

```powershell
Set-Location server
node --test src/services/returnRefund.service.test.js src/services/exchange.service.test.js src/services/codReconciliation.service.test.js
Set-Location ..\client
node --test src/utils/exchangeUiState.test.js src/pages/afterSalesSourceContract.test.js
```

Expected: active-branch services accept at least one forbidden stale command or
fail to synchronize the discrepancy record.

- [ ] **Step 3: Port the minimal service guards**

Implement:

```js
function canCustomerCancelBeforeHandoff(exchangeCase) {
  return !exchangeCase.handoffAt
    && !exchangeCase.customerShipmentId
    && !['CustomerShipped', 'WarehouseInspecting', 'OutboundFulfillment',
      'ReplacementShipped', 'DeliveryIncident'].includes(exchangeCase.status);
}
```

Require an open discrepancy for unpaid COD normal Return approval; restrict
destination verification to receivable/received statuses; load authoritative
Order/Payment during conversion; set `paymentId`; and update the persisted
`CodDiscrepancy` inside the same sessions used for Order COD collection,
settlement, recovery receipt, recovery progress, and closure.

- [ ] **Step 4: Align Customer Exchange cancellation controls**

Expose one pure UI helper that returns false after handoff or incident wait and
use it to hide/disable cancellation. Backend rejection remains authoritative.

- [ ] **Step 5: Run focused tests and commit**

Run Step 2, then:

```powershell
git add server/src/services/returnRefund.service.js server/src/services/exchange.service.js server/src/services/codReconciliation.service.js server/src/services/returnRefund.service.test.js server/src/services/exchange.service.test.js server/src/services/codReconciliation.service.test.js client/src/utils/exchangeUiState.js client/src/utils/exchangeUiState.test.js client/src/pages/customer/ExchangeDetailPage.jsx client/src/pages/afterSalesSourceContract.test.js
git commit -m "fix: enforce after-sales payment and handoff guards"
```

### Task 4: Make changed Staff domain, audit, and outbox facts atomic

**Files:**
- Modify: `server/src/services/staffOrder.service.js`
- Modify: `server/src/services/codReconciliation.service.js`
- Modify: `server/src/services/damageReport.service.js`
- Modify: `server/src/services/exchange.service.js`
- Test: `server/src/services/staffOrder.service.test.js`
- Test: `server/src/services/codReconciliation.service.test.js`
- Test: `server/src/services/damageReport.hardening.test.js`
- Test: `server/src/services/exchange.service.test.js`

**Interfaces:**
- Consumes: existing transaction manager, `auditLogger.log(..., session)`,
  `createOutboxWriter`, and canonical outbox envelope helpers.
- Produces: protected command result only after domain, Audit, and required
  DomainOutbox writes have succeeded in one transaction.

- [ ] **Step 1: Add rollback tests with injected audit/outbox failure**

For each changed command, inject a transaction harness and fail the final
writer:

```js
const auditLogger = {
  async log(_entry, session) {
    assert.ok(session);
    throw new Error('audit write failed');
  },
};
await assert.rejects(() => service.command(...), /audit write failed/);
assert.deepEqual(state, before);
```

Cover Staff Order cancellation, COD reconciliation/finalization, Staff Damage
create/withdraw, and the Exchange transitions changed in Task 3.

- [ ] **Step 2: Run focused tests and observe partial-write exposure**

```powershell
Set-Location server
node --test src/services/staffOrder.service.test.js src/services/codReconciliation.service.test.js src/services/damageReport.hardening.test.js src/services/exchange.service.test.js
```

Expected: at least one current command writes audit after the transaction or
does not receive a session.

- [ ] **Step 3: Move attributable audit writes inside owning transactions**

Every touched command calls:

```js
await auditLogger.log({
  actorType: 'User',
  actorId: String(actorId),
  actorRole: expectedRole,
  source: 'Application',
  action,
  targetType,
  targetId: String(targetId),
  outcome: 'Success',
  businessEventId,
  previousState,
  newState,
  reasonCode,
  reason,
  safeFacts,
}, session);
```

Remove the matching post-transaction audit call. Do not put email/network
delivery inside the transaction.

- [ ] **Step 4: Write required outbox envelopes inside the same transaction**

Use stable identities:

```js
await repository.createOutbox(canonicalEnvelope({
  identityKey: `notification:${businessEventId}:customer`,
  businessEventId,
  eventType,
  aggregateType,
  aggregateId: String(targetId),
  occurredAt,
  recipientId: String(customerId),
  targetCollection,
  targetId: String(targetId),
  displayValues,
}), session);
```

Internal-only stock bookkeeping remains without Customer notifications.
Repeated commands reuse the same business identity and cannot create duplicate
outbox facts.

- [ ] **Step 5: Run focused tests and commit**

Run Step 2, then:

```powershell
git add server/src/services/staffOrder.service.js server/src/services/codReconciliation.service.js server/src/services/damageReport.service.js server/src/services/exchange.service.js server/src/services/staffOrder.service.test.js server/src/services/codReconciliation.service.test.js server/src/services/damageReport.hardening.test.js server/src/services/exchange.service.test.js
git commit -m "fix: commit staff audit and outbox atomically"
```

### Task 5: Add bounded Staff queue pagination and direct-code search

**Files:**
- Create: `server/src/utils/staffQueueQuery.js`
- Create: `server/src/utils/staffQueueQuery.test.js`
- Modify: `server/src/services/staffOrder.service.js`
- Modify: `server/src/services/returnRefund.service.js`
- Modify: `server/src/services/exchange.service.js`
- Modify: `server/src/services/damageReport.service.js`
- Modify: `server/src/controller/damageReport.controller.js`
- Modify: `server/src/routes/damageReport.routes.js`
- Test: `server/src/services/staffOrder.service.test.js`
- Test: `server/src/services/returnRefund.service.test.js`
- Test: `server/src/services/exchange.service.test.js`
- Test: `server/src/services/damageReport.service.test.js`
- Test: `server/src/routes/damageReport.routes.test.js`

**Interfaces:**
- Produces:

```js
normalizeStaffQueueQuery(input, { searchableField })
// => { page, pageSize, skip, q, codeFilter }

toPage(items, total, paging)
// => { items, total, page, pageSize, totalPages }
```

- [ ] **Step 1: Write query utility tests**

Test defaults, maximum, invalid values, escaped regex text, and empty result
metadata:

```js
assert.deepEqual(normalizeStaffQueueQuery({}), {
  page: 1, pageSize: 20, skip: 0, q: '', codeFilter: null,
});
assert.throws(
  () => normalizeStaffQueueQuery({ pageSize: 101 }),
  /pageSize/i
);
assert.equal(normalizeStaffQueueQuery({ q: 'ORD-1.*' }, {
  searchableField: 'orderCode',
}).codeFilter.orderCode.$regex.source, 'ORD-1\\.\\*');
```

- [ ] **Step 2: Run the new utility test and observe module-not-found**

```powershell
Set-Location server
node --test src/utils/staffQueueQuery.test.js
```

Expected: fail because `staffQueueQuery.js` does not exist.

- [ ] **Step 3: Implement strict paging and escaped code search**

The utility must throw handled `ApiError(400, ...)`, use a maximum query length
of 100 characters, and construct only a case-insensitive escaped code regex.

- [ ] **Step 4: Add repository page queries**

Each production repository executes a stable query/count pair:

```js
const [items, total] = await Promise.all([
  Model.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(paging.skip)
    .limit(paging.pageSize)
    .lean(),
  Model.countDocuments(filter),
]);
return toPage(items, total, paging);
```

For Damage Reports, include `reportedBy: staffId`. Keep existing Customer and
Warehouse list methods unchanged. Add:

```js
router.get(
  '/staff/damage-reports',
  authenticate,
  authorizeRoles('Staff'),
  damageReportController.listStaffReports
);
```

Place this route before `/:id`.

- [ ] **Step 5: Preserve injected repository compatibility**

Service tests may inject array-returning repositories. Normalize array results
to a page envelope while production repositories use count-based totals. Do
not change command methods.

- [ ] **Step 6: Run queue service/route tests and commit**

```powershell
Set-Location server
node --test src/utils/staffQueueQuery.test.js src/services/staffOrder.service.test.js src/services/returnRefund.service.test.js src/services/exchange.service.test.js src/services/damageReport.service.test.js src/routes/damageReport.routes.test.js
git add src/utils/staffQueueQuery.js src/utils/staffQueueQuery.test.js src/services/staffOrder.service.js src/services/returnRefund.service.js src/services/exchange.service.js src/services/damageReport.service.js src/controller/damageReport.controller.js src/routes/damageReport.routes.js src/services/staffOrder.service.test.js src/services/returnRefund.service.test.js src/services/exchange.service.test.js src/services/damageReport.service.test.js src/routes/damageReport.routes.test.js
git commit -m "feat: bound staff operational queues"
```

### Task 6: Make Staff Dashboard and queues resilient

**Files:**
- Modify: `client/src/pages/staff/staffDashboardStats.js`
- Modify: `client/src/pages/staff/StaffDashboardPage.jsx`
- Modify: `client/src/pages/staff/StaffOrderQueuePage.jsx`
- Modify: `client/src/pages/staff/ReturnRefundQueuePage.jsx`
- Modify: `client/src/pages/staff/ExchangeQueuePage.jsx`
- Modify: `client/src/pages/staff/ReviewModerationPage.jsx`
- Modify: `client/src/services/staffOrderService.js`
- Modify: `client/src/services/returnRefundService.js`
- Modify: `client/src/services/exchangeService.js`
- Test: `client/src/pages/staff/staffDashboardStats.test.js`
- Test: `client/src/pages/staff/StaffDashboardPage.test.js`
- Create: `client/src/pages/staff/staffQueueSourceContract.test.js`

**Interfaces:**
- Consumes: `{ items, total, page, pageSize, totalPages }` from Task 5.
- Produces: loading/retry, status/code filters, and previous/next controls.

- [ ] **Step 1: Write source and pure-function tests**

Require the Dashboard mapper to accept only:

```js
toStaffDashboardStats({
  orders,
  returns,
  newSupport,
  inProgressSupport,
});
```

and calculate `openSupport = New + InProgress`. Source tests require each queue
to render loading text, a retry button, `pageSize: 20`, and pagination controls.
Order/Return/Exchange queues must send `q`; Review must retain its existing
canonical status options and pagination.

- [ ] **Step 2: Run client tests and confirm red assertions**

```powershell
Set-Location client
node --test src/pages/staff/staffDashboardStats.test.js src/pages/staff/StaffDashboardPage.test.js src/pages/staff/staffQueueSourceContract.test.js
```

- [ ] **Step 3: Refactor Dashboard loading into a retryable function**

Use a `loadVersion`/callback trigger or explicit `loadStats` function. On
refresh failure, keep the last successful numbers and show:

```jsx
<button type="button" className="btn btn-outline-warning btn-sm"
  onClick={loadStats} disabled={loading}>
  {loading ? 'Đang tải lại…' : 'Thử lại'}
</button>
```

Remove the synthetic `openSupport: { total: 0 }`.

- [ ] **Step 4: Add consistent queue state**

Each queue owns:

```js
const [query, setQuery] = useState({ status: initialStatus, q: '', page: 1, pageSize: 20 });
const [pageData, setPageData] = useState({ items: [], total: 0, totalPages: 0 });
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
```

Disable controls while loading, reset page to 1 when status/search changes,
ignore stale responses with an effect cleanup flag, show retry/empty states,
and never apply client-side authorization or business-state decisions.

- [ ] **Step 5: Run client tests and commit**

Run Step 2 plus the touched service tests:

```powershell
node --test src/services/staffOrderService.test.js src/services/returnRefundService.test.js src/services/exchangeService.test.js
git add src/pages/staff src/services/staffOrderService.js src/services/returnRefundService.js src/services/exchangeService.js
git commit -m "feat: stabilize staff dashboard and queues"
```

### Task 7: Preserve Staff Damage Reports across refresh

**Files:**
- Modify: `client/src/services/damageReportService.js`
- Modify: `client/src/pages/staff/DamageReportsPage.jsx`
- Test: `client/src/services/damageReportService.test.js`
- Create: `client/src/pages/staff/damageReportsSourceContract.test.js`

**Interfaces:**
- Consumes: `GET /staff/damage-reports` from Task 5 and the existing
  `OperationalEvidenceUploader`.
- Produces: owned list, refresh, paging, status filter, evidence upload, and
  stable create/withdraw behavior.

- [ ] **Step 1: Write failing service and source tests**

Require:

```js
await service.listStaffReports({ status: 'PendingReview', page: 2, pageSize: 20 });
// GET /staff/damage-reports?status=PendingReview&page=2&pageSize=20
```

and source usage of `OperationalEvidenceUploader`, `listStaffReports`, loading,
retry, and previous/next controls. Assert that the old raw
`damageEvidence` reference input is absent.

- [ ] **Step 2: Run the focused client tests**

```powershell
Set-Location client
node --test src/services/damageReportService.test.js src/pages/staff/damageReportsSourceContract.test.js
```

Expected: missing list service and uploader/list source contracts.

- [ ] **Step 3: Implement the owned list and evidence uploader**

Use:

```jsx
<OperationalEvidenceUploader
  images={form.evidence}
  onChange={(evidence) => setForm((current) => ({ ...current, evidence }))}
  disabled={submitting}
/>
```

Send `evidence: form.evidence`, reload page 1 after a successful create or
withdraw, render owned reports with status/quantity/time, and expose withdrawal
only for the current report states already accepted by the backend.

- [ ] **Step 4: Run focused tests and commit**

```powershell
node --test src/services/damageReportService.test.js src/pages/staff/damageReportsSourceContract.test.js
git add src/services/damageReportService.js src/services/damageReportService.test.js src/pages/staff/DamageReportsPage.jsx src/pages/staff/damageReportsSourceContract.test.js
git commit -m "feat: persist staff damage report workflow"
```

### Task 8: Full verification and regression closure

**Files:**
- Modify only if a verification failure proves an in-scope regression.

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: fresh evidence for backend, frontend, build, security, and COD
  regression behavior.

- [ ] **Step 1: Run changed-file whitespace and status checks**

```powershell
git diff --check
git status --short
```

Expected: no whitespace error; only intended tracked changes and preserved
pre-existing untracked runtime files.

- [ ] **Step 2: Run the complete backend suite**

```powershell
Set-Location server
npm test
```

Expected: zero failed tests.

- [ ] **Step 3: Run the complete frontend suite and production build**

```powershell
Set-Location ..\client
npm test
npm run build
```

Expected: zero failed tests and successful Vite build. Record any existing
chunk-size warning as a residual risk, not a false failure.

- [ ] **Step 4: Run dependency security checks**

```powershell
Set-Location ..\server
npm audit --omit=dev
Set-Location ..\client
npm audit --omit=dev
```

Expected: report exact findings. Do not perform unrelated major dependency
upgrades in this implementation.

- [ ] **Step 5: Run the COD verifier only against the intended replica-set demo database**

First verify `.env`, MongoDB host/port/replica set, and that reset/seed is
authorized for the demo database. Then:

```powershell
Set-Location ..\server
npm run verify:phase1-e2e
```

Expected: Customer checkout through Staff/Warehouse/Delivered/COD Paid and
Customer history passes without manual database repair. If the intended demo
database is unavailable, report the exact environment blocker and do not claim
live E2E success.

- [ ] **Step 6: Review requirements coverage**

Map AT-247 through AT-262 to passing tests or live evidence. Record any
unverified item explicitly; do not mark the implementation complete while a
required in-scope item lacks evidence.

- [ ] **Step 7: Commit a verification-only correction when one exists**

If Steps 1–6 required a correction, inspect `git diff --name-only`, stage each
in-scope filename explicitly, run its focused test again, and commit with:

```powershell
git commit -m "test: close staff flow regressions"
```

If verification required no correction, do not create an empty commit.

## Coverage Matrix

| Requirement / acceptance | Implemented and verified by |
| --- | --- |
| BR-130, BR-131, AT-247 | Task 1 production capability, canonical source, model, route, service, and UI contract tests |
| BR-132, AT-248, AT-249 | Task 2 failed-attempt/terminal projection, idempotency, money consequence, state helper, report, and UI tests |
| BR-133, AT-250, AT-251 | Task 3 Return COD discrepancy and destination-state guards |
| BR-134, AT-252, AT-253 | Task 3 Exchange conversion and post-handoff/incident cancellation guards |
| BR-135, AT-254 | Task 3 persisted COD discrepancy synchronization tests |
| BR-136, AT-255 | Task 4 rollback, session-aware Audit, and stable DomainOutbox identity tests |
| BR-137, BR-138, AT-256, AT-257 | Task 5 strict bounded paging, stable sort, ownership, and escaped direct-code search tests |
| AT-258 | Task 6 Dashboard canonical totals and retry contract tests |
| BR-139, AT-259, AT-260 | Tasks 5 and 7 owned Damage list, evidence upload, refresh, authorization, and idempotency tests |
| BR-140, AT-261 | Task 6 Review/Support vocabulary preservation and Review reliability tests |
| AT-262 | Task 8 full suites, production build, security audit, and authorized live COD regression evidence |
