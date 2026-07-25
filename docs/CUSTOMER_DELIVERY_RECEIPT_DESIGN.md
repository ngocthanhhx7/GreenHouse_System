# Customer Delivery Receipt Design

Date: 2026-07-26
Business Approver: Nguyễn Ngọc Thành
Primary owner: Nguyễn Hữu Anh Nhật
Collaborating seams: Nguyễn Quang Huy (Customer Order projection/Notification consumer), Nguyễn Ngọc Thành (Audit/final integration)

## 1. Problem and approved business decision

The current implementation treats the physical `Delivered` evidence recorded by Staff/Carrier as if the Customer had received the parcel. The Customer order center consequently places the order in `Hoàn thành`, enables Review, and exposes Exchange/Return before the Customer has acknowledged receipt.

The approved rule supersedes any older document that equates physical delivery evidence with Customer completion:

- Staff/Carrier `Delivered` is immutable physical-delivery evidence only.
- Only the owning Customer can move the Customer-facing projection to `Completed`.
- The Customer must be offered exactly two initial actions:
  - `Đã nhận được hàng`
  - `Chưa nhận được hàng`
- `Đã nhận được hàng` starts the five-day Exchange/Return period.
- `Chưa nhận được hàng` creates an attributable non-receipt dispute, keeps the order outside `Hoàn thành`, and blocks Review/Exchange/Return.
- Staff cannot complete the Customer order or shorten the Customer's five-day period.

## 2. State model

The canonical physical state remains `Order.orderStatus = Delivered`. A separate append-only Customer decision aggregate owns receipt acknowledgement.

| Physical state | Effective receipt state | Customer-facing state | Allowed Customer action |
|---|---|---|---|
| Before `Delivered` | `Unavailable` | Existing Pending/Processing/Shipping projection | None |
| `Delivered`, no decision | `Awaiting` | `AwaitingCustomerConfirmation` under `Đang giao` | `RECEIVED`, `NOT_RECEIVED` |
| `Delivered`, latest decision `NOT_RECEIVED` | `Disputed` | `DeliveryDisputed` under `Đang giao` | `RECEIVED` when the parcel later arrives |
| `Delivered`, terminal decision `RECEIVED` | `Received` | `Completed` under `Hoàn thành` | None |

`RECEIVED` is terminal and cannot be reversed through this command. A later `RECEIVED` decision may supersede `NOT_RECEIVED`; historical non-receipt evidence remains append-only.

Legacy `Delivered` orders are not inferred as received. With no Customer decision they project as `AwaitingCustomerConfirmation`.

## 3. Persistence

Add `CustomerDeliveryReceipt` with:

- immutable `orderId`, `customerId`, `shipmentId`, `deliveryEventId`;
- immutable `outcome` (`RECEIVED` or `NOT_RECEIVED`);
- immutable `respondedAt`, `idempotencyKey`, and canonical `requestHash`;
- optional bounded non-receipt `reason`;
- `supersedesId` for `RECEIVED` after a prior `NOT_RECEIVED`;
- immutable deadline snapshots on `RECEIVED`:
  - `exchangeDeadlineAt = respondedAt + 5 days`;
  - `returnDeadlineAt = respondedAt + 5 days`.

Indexes:

- unique `{ customerId, idempotencyKey }`;
- unique partial terminal receipt per order for `outcome = RECEIVED`;
- `{ orderId, createdAt }` for deterministic history;
- partial `{ outcome, createdAt }` for operational non-receipt review.

No migration may backfill `RECEIVED`. Index creation must have preflight, dry-run, apply, verify, and a zero-write second run.
Dry-run disables both Mongoose automatic index and collection creation before
connecting; it must leave an empty target database's collection list unchanged.
Conflict preflight uses bounded server-side counts and never loads receipt
reasons or an unbounded list of document IDs.
`Shipment.customerReceiptGuardVersion` compatibility accepts only BSON
`int`/`long`/`double` values that are finite non-negative integers from `0`
through `9,007,199,254,740,990`. This leaves one exact safe `$inc` before
JavaScript's maximum safe integer. Decimal128, strings, negatives, fractions,
NaN, and either Infinity fail closed.

## 4. Commands and projections

### Customer command

`POST /api/orders/:id/delivery-confirmation`

Header:

`Idempotency-Key: <8..160 safe characters>`

Body:

```json
{
  "outcome": "RECEIVED",
  "expectedDeliveryEventId": "..."
}
```

For `NOT_RECEIVED`, a normalized reason of 10–500 characters is required.

The command must, in one transaction:

1. Load the owned Order without disclosing a foreign order.
2. Verify canonical `Order = Delivered`.
3. Verify the latest terminal Shipment and its attributable `DELIVERED` event.
4. Bind `expectedDeliveryEventId` to prevent a stale UI decision.
5. Enforce idempotency and concurrent winner rules.
6. Append the Customer decision.
7. For `RECEIVED`, write the five-day Customer deadline snapshots and update the Order's after-sales deadline projection to those exact snapshots.
8. Append a redacted Audit record and DomainOutbox event.

Same key and same facts return the committed result. Same key with different facts returns `IDEMPOTENCY_KEY_REUSED`. A concurrent conflicting outcome returns the winning safe projection and a typed conflict.

### Customer projection

Both Customer Order Detail and Order History receive:

```json
{
  "orderStatus": "Delivered",
  "customerOrderStatus": "AwaitingCustomerConfirmation",
  "deliveryReceipt": {
    "status": "Awaiting",
    "latestDecisionAt": null,
    "reason": ""
  },
  "availableDeliveryActions": ["RECEIVED", "NOT_RECEIVED"],
  "afterSales": {
    "receiptGatePassed": false,
    "enabled": false,
    "blockReason": "DELIVERY_CONFIRMATION_REQUIRED"
  }
}
```

The server is authoritative. The client must not infer completion from `orderStatus`, `shippingStatus`, `deliveredAt`, or shipment events.

### Staff projection

Staff sees receipt state and non-receipt reason/history for investigation, but no Customer decision control. Staff cannot set `Completed` or synthesize `RECEIVED`.

## 5. Cross-slice gates

- Customer Order tab:
  - `Delivered + Awaiting/Disputed` remains under `Đang giao`;
  - only `Received` appears under `Hoàn thành`.
- Review eligibility requires `deliveryReceipt.status = Received`.
- Exchange and Return creation require `Received` and use the Customer receipt deadline snapshots.
- Direct API calls must enforce the same gate; hiding UI is insufficient.
- COD reconciliation remains independent. `RECEIVED` does not convert an unresolved COD discrepancy into Paid or bypass its hold.
- Physical `ShipmentEvent`, `Shipment.deliveredAt`, and Carrier/Staff evidence are never overwritten.

## 6. UI

On Customer Order Detail, render a receipt card directly below progress and above order facts:

- Awaiting: exactly two enabled buttons with the approved Vietnamese labels.
- Submitting: keep both visible and disable both; selected action shows `Đang ghi nhận…`.
- Received: replace buttons with a success status and expose otherwise-eligible after-sales actions.
- Disputed: show `Bạn đã báo chưa nhận được hàng. Đơn đang được xác minh.` and keep `Đã nhận được hàng` available if the parcel later arrives.
- Failure: preserve the selected action/reason, show a typed message, and never optimistically unlock after-sales.

`NOT_RECEIVED` uses an accessible confirmation dialog with a required reason. Desktop buttons are inline; at 640 px and below they stack full width. Success uses `role=status`/`aria-live=polite`; errors use `role=alert`.

## 7. Audit, outbox, and privacy

Audit events:

- `CUSTOMER_DELIVERY_RECEIVED`
- `CUSTOMER_DELIVERY_NOT_RECEIVED`

Domain events:

- `ORDER_COMPLETED_BY_CUSTOMER`
- `CUSTOMER_DELIVERY_DISPUTED`

Outbox failure rolls back the owning transaction. Notification delivery failure after commit does not roll back the decision. Audit/outbox payloads contain IDs, outcome, timestamps, and safe reason metadata only; they never contain private evidence URLs or unrestricted Customer text.

## 8. Typed failures

- `ORDER_NOT_FOUND`
- `ORDER_NOT_AUTHORITATIVELY_DELIVERED`
- `DELIVERY_EVENT_STALE`
- `DELIVERY_CONFIRMATION_ALREADY_RECORDED`
- `DELIVERY_DISPUTE_OPEN`
- `AFTER_SALES_DELIVERY_CONFIRMATION_REQUIRED`
- `AFTER_SALES_DELIVERY_DISPUTED`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_KEY_INVALID`
- `IDEMPOTENCY_KEY_REUSED`
- Migration preflight: `CUSTOMER_DELIVERY_RECEIPT_COMMAND_AMBIGUOUS` when
  duplicate Customer/idempotency command identities would make the unique
  command index unsafe.
- Migration preflight: `CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS` when a
  Shipment guard has an unsafe BSON type or value.

## 9. Acceptance evidence

Tests must prove:

1. Staff/Carrier delivery preserves physical `Delivered` but does not produce Customer `Completed`.
2. Only the owning Customer sees the two initial actions.
3. Foreign ownership fails as 404 with no mutation.
4. `RECEIVED` atomically appends receipt/audit/outbox and starts both exact five-day deadlines.
5. `NOT_RECEIVED` appends dispute evidence, remains under `Đang giao`, and blocks Review/Exchange/Return at service boundaries.
6. A later Customer `RECEIVED` may supersede `NOT_RECEIVED` without deleting history.
7. Staff cannot complete the order.
8. Replay and concurrent conflicting decisions produce one durable winner and no duplicate effects.
9. Legacy Delivered-without-receipt records remain awaiting confirmation.
10. Client pending/error/replay/mobile/accessibility states follow this document.

## 10. Documentation supersession

Update SL-004 traceability, handoff, release audit, Nguyễn Hữu Anh Nhật's member plan, Customer Order ownership seams, and after-sales documentation. Any older statement that starts Exchange/Return at physical `DeliveredAt` is superseded: the five-day Customer period starts at the immutable Customer `RECEIVED` timestamp.
