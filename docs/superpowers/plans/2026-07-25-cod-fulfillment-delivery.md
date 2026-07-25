# COD Fulfillment and Manual Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and harden the existing Staff-managed `Confirmed → Packed → Shipped → Delivered → COD Paid` workflow without adding any carrier API integration.

**Architecture:** Reuse the existing fulfillment commands, MongoDB transaction boundaries, packing/shipment/event collections, fixed COD obligation, payment records, audit logger, and Staff UI. Add only the missing shipment note and unconditional Staff failure-reason guard, then verify the already-implemented state, role, replay, concurrency, and payment behavior.

**Tech Stack:** Node.js, Express, Mongoose, Node test runner, React/Vite.

## Global Constraints

- Do not add GHN, GHTK, or any other carrier API, webhook, map, or live-tracking integration.
- Only Staff may use packing, manual handoff, and Staff shipment-event routes.
- Preserve the signed Carrier evidence route without calling external providers.
- Preserve the existing Resend path and production signed-Carrier COD safety guard.
- Do not allow Staff to submit a COD amount; derive it from immutable `codExpectedAmount`.
- Do not create a second Payment or PaymentAttempt record.
- Keep failed delivery at `Order = Shipped` with `Shipment = AttemptFailed` and COD unpaid.
- Stop at `Delivered + Paid`; do not implement return-to-warehouse, return, refund, or exchange work.

---

### Task 1: Add failing model, service, route, and UI contract tests

**Files:**
- Modify: `server/src/models/sl004Models.model.test.js`
- Modify: `server/src/services/sl004Fulfillment.behavior.test.js`
- Modify: `server/src/routes/phase2BusinessGuards.routes.test.js`
- Modify: `client/src/pages/sl004UiContract.test.js`

**Interfaces:**
- Consumes: existing `Shipment`, `createFulfillmentService`, Staff fulfillment routes, `createStaffOrderService`, and `StaffOrderDetailPage.jsx`.
- Produces: failing tests for handoff-note persistence and unconditional Staff delivery-failure reason validation, plus passing guard coverage for existing actor boundaries.

- [ ] **Step 1: Add a Shipment schema test for the optional handoff note**

Add an assertion to the SL-004 model test:

```js
const Shipment = require('./shipment.model');

const shipment = new Shipment({
  commandKey: 'handoff-note-command',
  shipmentKey: 'shipment:cycle-note',
  orderId: new mongoose.Types.ObjectId(),
  cycleId: new mongoose.Types.ObjectId(),
  packingRecordId: new mongoose.Types.ObjectId(),
  carrierName: 'Manual Carrier',
  trackingReference: 'TRACK-NOTE-1',
  handedOffAt: new Date(),
  handoffEvidenceReference: 'evidence-1',
  note: 'Bàn giao tại quầy số 2',
  recordedBy: new mongoose.Types.ObjectId(),
});

assert.equal(shipment.note, 'Bàn giao tại quầy số 2');
assert.equal(Shipment.schema.path('note').options.maxlength, 1000);
```

Expected current failure: `Shipment.schema.path('note')` is undefined.

- [ ] **Step 2: Add a behavior test proving handoff note persistence**

In `sl004Fulfillment.behavior.test.js`, use the existing harness:

```js
it('persists the optional manual handoff note on the single Shipment', async () => {
  const harness = createHarness({ paymentMethod: 'COD', paymentStatus: 'Unpaid' });
  await harness.packExact('packing-with-handoff-note');

  const result = await harness.service.recordHandoff('staff-1', 'order-1', {
    idempotencyKey: 'handoff-with-note',
    carrierName: 'Manual Carrier',
    trackingReference: 'TRACK-NOTE-1',
    handedOffAt: new Date('2026-07-25T10:00:00.000Z'),
    evidenceReference: 'handoff-evidence',
    note: 'Bàn giao tại quầy số 2',
  });

  assert.equal(result.shipment.note, 'Bàn giao tại quầy số 2');
  assert.equal(harness.state.shipments.length, 1);
});
```

Expected current failure: `result.shipment.note` is undefined.

- [ ] **Step 3: Add a behavior test requiring failure reason even with the legacy single evidence field**

Create a COD harness, hand off the order, and call:

```js
await assert.rejects(
  () => harness.service.recordShipmentEvent(
    { actorType: 'Staff', actorId: 'staff-1' },
    shipment._id,
    {
      eventKey: 'failed-without-reason',
      eventType: 'ATTEMPT_FAILED',
      source: 'STAFF_EVIDENCE',
      occurredAt: new Date('2026-07-25T12:00:00.000Z'),
      evidenceReference: 'legacy-single-evidence',
    },
  ),
  (error) => error.errorCode === 'DELIVERY_FAILURE_REASON_INVALID',
);

assert.equal(harness.state.order.orderStatus, 'Shipped');
assert.equal(harness.state.order.paymentStatus, 'Unpaid');
assert.equal(harness.state.events.filter((event) => event.eventType === 'ATTEMPT_FAILED').length, 0);
```

Expected current failure: the command succeeds because the backend currently
requires a reason only when `evidenceReferences` is non-empty.

- [ ] **Step 4: Extend the route guard matrix**

Add denied cases for:

```js
['Customer', '/api/staff/orders/order-1/packing', 'POST'],
['WarehouseManager', '/api/staff/orders/order-1/shipments', 'POST'],
['Customer', '/api/staff/shipments/shipment-1/events', 'POST'],
['WarehouseManager', '/api/staff/shipments/shipment-1/events', 'POST'],
['Admin', '/api/staff/shipments/shipment-1/events', 'POST'],
```

Each must return `403` with `ROLE_FORBIDDEN`.

- [ ] **Step 5: Extend the UI contract for the optional handoff note**

In `client/src/pages/sl004UiContract.test.js`, include `note` in the handoff:

```js
const handoff = {
  carrierName: 'Carrier A',
  trackingReference: 'TRK-1',
  handedOffAt: '2026-07-25T10:00:00.000Z',
  evidenceReference: 'media-1',
  note: 'Bàn giao tại quầy số 2',
};
```

Assert:

```js
assert.match(staffOrder, /handoff\.note|field.*note|Ghi chú bàn giao/);
assert.equal(JSON.parse(request.options.body).note, 'Bàn giao tại quầy số 2');
```

- [ ] **Step 6: Run the focused tests and verify RED**

Run:

```powershell
cd server
node --test src/models/sl004Models.model.test.js src/services/sl004Fulfillment.behavior.test.js src/routes/phase2BusinessGuards.routes.test.js
```

Then:

```powershell
cd client
node --test src/pages/sl004UiContract.test.js
```

Expected: note schema/persistence and the single-evidence failure-reason tests
fail for the intended missing behavior; existing state/COD/RBAC tests remain
green.

- [ ] **Step 7: Commit the failing tests**

```powershell
git add server/src/models/sl004Models.model.test.js server/src/services/sl004Fulfillment.behavior.test.js server/src/routes/phase2BusinessGuards.routes.test.js client/src/pages/sl004UiContract.test.js
git commit -m "test: define manual COD fulfillment gaps"
```

### Task 2: Persist manual handoff note through model, command, and projection

**Files:**
- Modify: `server/src/models/shipment.model.js`
- Modify: `server/src/services/fulfillmentCommand.service.js`
- Modify: `server/src/services/fulfillment.service.js`

**Interfaces:**
- Consumes: `validateHandoff(input)`, `repository.createShipment`, and the existing fulfillment projection.
- Produces: `Shipment.note` as an optional trimmed string, maximum 1000 characters.

- [ ] **Step 1: Add the Shipment note field**

Add to `shipmentSchema`:

```js
note: {
  type: String,
  default: '',
  trim: true,
  maxlength: 1000,
  immutable: true,
},
```

- [ ] **Step 2: Normalize the note in the handoff validator**

Extend `validateHandoff` after the required fields:

```js
values.note = optionalText(input.note, 1000);
```

The returned handoff object becomes:

```js
return { commandKey, ...values };
```

and already includes `note`.

- [ ] **Step 3: Persist note when creating the Shipment**

Add:

```js
note: handoff.note,
```

to the existing `repository.createShipment` payload.

- [ ] **Step 4: Expose note in Staff and Customer fulfillment projections**

In `buildFulfillmentProjection`, extend the shipment projection:

```js
note: shipment.note || '',
```

- [ ] **Step 5: Run focused model and fulfillment tests**

```powershell
cd server
node --test src/models/sl004Models.model.test.js src/services/sl004Fulfillment.behavior.test.js
```

Expected: the handoff note test passes; the missing failure-reason test remains red until Task 3.

- [ ] **Step 6: Commit handoff-note persistence**

```powershell
git add server/src/models/shipment.model.js server/src/services/fulfillmentCommand.service.js server/src/services/fulfillment.service.js
git commit -m "feat: persist manual shipment handoff notes"
```

### Task 3: Require Staff failure reason and expose the note in the UI

**Files:**
- Modify: `server/src/services/fulfillmentCommand.service.js`
- Modify: `client/src/pages/staff/StaffOrderDetailPage.jsx`
- Modify: `client/src/pages/sl004UiContract.test.js`

**Interfaces:**
- Consumes: the existing failure reason set and `Shipment.note`.
- Produces: unconditional backend failure-reason validation for Staff and an optional handoff note input/display.

- [ ] **Step 1: Remove the evidence-array condition from the Staff failure-reason guard**

Replace:

```js
if (
  actor.actorType === 'Staff'
  && evidenceReferences.length > 0
  && STAFF_EVENTS_REQUIRING_FAILURE_REASON.has(eventType)
  && !STAFF_DELIVERY_FAILURE_REASONS.has(reason)
) {
```

with:

```js
if (
  actor.actorType === 'Staff'
  && STAFF_EVENTS_REQUIRING_FAILURE_REASON.has(eventType)
  && !STAFF_DELIVERY_FAILURE_REASONS.has(reason)
) {
```

This keeps the existing allowlist and stable
`DELIVERY_FAILURE_REASON_INVALID` error.

- [ ] **Step 2: Add the optional note to the handoff draft**

Change `blankHandoff` to include:

```js
note: '',
```

Do not make it a required field in `validateHandoffDraft`.

- [ ] **Step 3: Render and submit the optional note**

Add a text input or textarea in the Packed handoff section:

```jsx
<label className="col-12">
  <span className="form-label">Ghi chú bàn giao (không bắt buộc)</span>
  <textarea
    className="form-control"
    maxLength={1000}
    value={handoff.note}
    onChange={(event) => setHandoff({ ...handoff, note: event.target.value })}
  />
</label>
```

The existing `{ ...handoff }` request already submits the note.

- [ ] **Step 4: Display a stored handoff note**

Below the carrier and tracking reference, render only when present:

```jsx
{shipment.note && <p className="text-secondary">Ghi chú bàn giao: {shipment.note}</p>}
```

- [ ] **Step 5: Run the focused server and client tests**

```powershell
cd server
node --test src/services/sl004Fulfillment.behavior.test.js src/routes/phase2BusinessGuards.routes.test.js
```

```powershell
cd client
node --test src/pages/sl004UiContract.test.js src/pages/fulfillmentFlow.uiContract.test.js
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit backend and UI completion**

```powershell
git add server/src/services/fulfillmentCommand.service.js client/src/pages/staff/StaffOrderDetailPage.jsx client/src/pages/sl004UiContract.test.js
git commit -m "fix: complete manual delivery input guards"
```

### Task 4: Verify the complete COD fulfillment matrix

**Files:**
- Modify: none unless verification identifies a scoped defect.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: fresh evidence that the complete flow and negative paths pass.

- [ ] **Step 1: Run focused fulfillment, route, model, and UI tests**

```powershell
cd server
node --test src/models/sl004Models.model.test.js src/services/sl004Fulfillment.behavior.test.js src/routes/sl004.routes.test.js src/routes/phase2BusinessGuards.routes.test.js
```

```powershell
cd client
node --test src/pages/sl004UiContract.test.js src/pages/fulfillmentFlow.uiContract.test.js src/pages/staff/codUiContract.test.js
```

Expected: all focused tests pass, including:

- completed-export packing guard;
- Packed handoff validation;
- role denials;
- Delivered COD Paid;
- failed delivery remains Unpaid;
- delivered replay;
- concurrent delivery race;
- note persistence;
- required failure reason.

- [ ] **Step 2: Run the complete backend test suite**

```powershell
cd server
npm test
```

Expected: zero failures.

- [ ] **Step 3: Run the frontend production build**

```powershell
cd client
npm run build
```

Expected: successful Vite build.

- [ ] **Step 4: Inspect scope and Git state**

```powershell
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- server/src/models/shipment.model.js server/src/services/fulfillmentCommand.service.js server/src/services/fulfillment.service.js client/src/pages/staff/StaffOrderDetailPage.jsx
git status --short --branch
```

Expected: no carrier integration, no generic status endpoint, no
return/refund/exchange modification, and a clean worktree.

- [ ] **Step 5: Record final endpoint and transition evidence**

Report:

```text
POST /api/staff/orders/:id/packing
POST /api/staff/orders/:id/shipments
POST /api/staff/shipments/:shipmentId/events
```

and:

```text
Confirmed → Packed → Shipped → Delivered
COD Unpaid → Paid only after fixed full collection
Failed attempt: Order remains Shipped, Shipment AttemptFailed, COD Unpaid
```
