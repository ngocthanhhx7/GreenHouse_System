# COD Fulfillment and Manual Delivery Design

Date: 2026-07-25

## Scope

This slice continues from:

```text
Order = Confirmed
StockExportRequest = Completed
```

It completes the manual fulfillment path:

```text
Confirmed
→ Packed
→ Handed to external carrier manually
→ Shipped
→ Delivered
→ COD Paid
```

It also records failed delivery attempts while keeping the order in `Shipped`.

This slice does not add a GHN, GHTK, or other carrier API integration. It does
not add maps, webhooks, live tracking, return-to-warehouse workflows, refunds,
or new payment methods.

## Existing architecture to reuse

The current command boundaries already cover this workflow:

- `POST /api/staff/orders/:id/packing`
- `POST /api/staff/orders/:id/shipments`
- `POST /api/staff/shipments/:shipmentId/events`

The implementation will reuse:

- `fulfillmentCommand.service.js`
- `fulfillment.service.js`
- `Shipment`
- `ShipmentEvent`
- `PackingRecord`
- `FulfillmentCycle`
- `Payment`
- `PaymentAttempt`
- existing transaction manager
- existing audit logger
- existing Staff UI in `StaffOrderDetailPage.jsx`

The existing signed Carrier event route is retained as an evidence channel:

```text
POST /api/carrier/shipments/:shipmentId/events
```

It receives signed evidence only; it does not call an external carrier API.

## State transitions

### Packing

Preconditions:

```text
actor = Staff
order.orderStatus = Confirmed
fulfillmentCycle.status = Exported
stockExportRequest.status = Completed
packing checklist exactly matches every OrderDetail
```

Transition:

```text
Order: Confirmed → Packed
Cycle: Exported → Packed
PackingRecord: Completed
```

`packedBy` and `packedAt` remain stored in `PackingRecord`. A second command
replays the completed packing result and does not create another completed
packing record.

### Manual handoff

Endpoint:

```text
POST /api/staff/orders/:id/shipments
```

Required input:

```text
carrierName
trackingReference
handedOffAt
handoff evidence
```

Optional input:

```text
note
```

Stored `Shipment` facts:

```text
carrierName       = ProviderName
trackingReference = TrackingCode
handedOffAt
handoffEvidenceReference
note
recordedBy
status = HandedOff
```

Transition:

```text
Order: Packed → Shipped
Cycle: Packed → HandedOff
Shipment: HandedOff
```

`HandedOff` is the existing equivalent of `InTransit`. The current unique cycle
and command-key constraints prevent duplicate shipment records.

### Successful delivery

Endpoint:

```text
POST /api/staff/shipments/:shipmentId/events
```

Staff supplies an event with:

```json
{
  "eventType": "DELIVERED",
  "eventKey": "unique-event-key",
  "occurredAt": "2026-07-25T12:00:00.000Z",
  "evidenceReferences": ["signed-evidence-reference"],
  "codCollectionResult": "COLLECTED"
}
```

For a COD order, the backend derives the collected amount from the immutable
`codExpectedAmount`. Staff cannot submit an arbitrary amount.

On full COD collection:

```text
Order: Shipped → Delivered
Shipment: HandedOff or AttemptFailed → Delivered
Cycle: HandedOff → Delivered
Order.paymentStatus: Unpaid → Paid
Payment.paymentStatus: Unpaid → Paid
PaymentAttempt.paymentStatus: Unpaid → Paid
```

`PaidAt`, `customerCollectedAmount`, `customerCollectedAt`, and
`completedSaleAt` are set from the validated collection evidence. No new
payment record is created.

The existing demo/development manual Staff COD path remains available. The
existing production guard requiring signed Carrier collection evidence remains
in place as a safety boundary.

### Failed delivery

The same shipment-event endpoint records:

```json
{
  "eventType": "ATTEMPT_FAILED",
  "eventKey": "unique-event-key",
  "occurredAt": "2026-07-25T12:00:00.000Z",
  "reason": "CUSTOMER_UNREACHABLE",
  "evidenceReferences": ["signed-evidence-reference"]
}
```

For Staff, `reason` is mandatory and must use the existing supported failure
reason set.

Transition:

```text
Order: remains Shipped
Shipment: HandedOff → AttemptFailed
Payment: remains Unpaid
```

This slice does not introduce return-to-warehouse handling.

## Data-model adjustment

Add one optional immutable-at-write handoff note to `Shipment`:

```text
note: string, max 1000 characters, default ''
```

The manual handoff command stores it and the fulfillment projection exposes it.
Existing shipment records remain valid with an empty note.

Failure reasons continue to be stored as immutable `ShipmentEvent.reason`,
which is the existing append-only event history design.

## Authorization

The existing route middleware remains authoritative:

```text
authenticate
→ authorizeRoles('Staff')
```

Expected access:

| Actor | Packing | Handoff | Staff shipment event |
| --- | --- | --- | --- |
| Staff | Allowed | Allowed | Allowed |
| Customer | 403 | 403 | 403 |
| WarehouseManager | 403 | 403 | 403 |
| Admin | 403 | 403 | 403 |

The signed Carrier route remains protected by `carrierSignature`, not by a
frontend-supplied role.

## Atomicity and idempotency

Packing, handoff, delivery, COD updates, audit, and notification outbox writes
remain in the existing MongoDB transaction boundaries.

Replay rules:

- Repeated packing command returns the existing `PackingRecord`.
- Repeated handoff command returns the existing `Shipment`.
- Repeated event key returns the existing `ShipmentEvent`.
- A different delivery event after `Delivered` is rejected by the Shipped-state
  guard.
- A concurrent delivery race allows only one order-state claim to succeed.
- Payment and payment-attempt records are updated once and never duplicated.

## Frontend behavior

`StaffOrderDetailPage.jsx` remains the single Staff workflow surface:

- show packing only after completed export;
- show handoff only while `Packed`;
- collect carrier name, tracking code, handoff time, evidence, and optional
  note;
- show shipment history;
- show delivery success, failed-attempt, and COD result controls only while
  `Shipped`;
- disable commands while a request is running;
- rotate command keys after a successful event;
- do not expose a manual payment amount field;
- hide shipment event controls after `Delivered`.

## Verification plan

Behavior and route tests will cover:

1. Confirmed without completed export cannot be packed.
2. Confirmed with completed export can be packed.
3. Packing twice has no repeated effect.
4. Packed can be handed off with valid carrier facts.
5. Missing tracking code is rejected.
6. Handoff note is persisted.
7. Customer cannot call handoff or shipment-event APIs.
8. Warehouse Manager cannot call shipment-event APIs.
9. Packed cannot jump directly to Delivered.
10. Confirmed cannot jump directly to Shipped.
11. Shipped can become Delivered.
12. Full COD collection sets the fixed expected amount and marks payment Paid.
13. Arbitrary COD amounts are rejected.
14. Delivered replay does not create a second event or payment effect.
15. Two concurrent Delivered requests result in one winner.
16. Failed delivery requires a reason and does not mark COD Paid.

Existing Resend and Carrier-evidence tests remain intact.

## Non-goals

- GHN/GHTK or any other carrier API.
- Carrier webhooks or live tracking.
- Maps.
- Return-to-warehouse state machine.
- Refunds or payment-provider changes.
- New shipping or payment collections.
