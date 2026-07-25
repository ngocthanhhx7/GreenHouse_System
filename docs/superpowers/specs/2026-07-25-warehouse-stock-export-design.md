# Warehouse Stock Export Design

Date: 2026-07-25

## Scope

This slice continues from:

```text
Order Confirmed
→ exactly one StockExportRequest
```

It implements only the Warehouse Manager export operation and ends at:

```text
StockExportRequest = Completed
FulfillmentCycle = Exported
```

It does not implement or change `Packed`, `Shipped`, `Delivered`, payment
collection, return, refund, or exchange behavior. The existing `Resend` export
path is retained for compatibility; this slice hardens and tests the initial
`Confirmed` export path.

## Existing architecture to reuse

The implementation will extend the existing components rather than introduce a
new export architecture:

- `server/src/routes/inventory.routes.js`
  - Warehouse Manager-only list, detail, and process endpoints.
- `server/src/controller/inventory.controller.js`
  - Passes the authenticated actor and `Idempotency-Key` to the service.
- `server/src/services/inventory.service.js`
  - Composes the inventory core and export services.
- `server/src/services/inventoryExport.service.js`
  - Owns export validation, lease claiming, stock mutation, transaction
    creation, request completion, cycle update, audit, and retry behavior.
- Existing models:
  - `StockExportRequest`
  - `FulfillmentCycle`
  - `Order`
  - `OrderDetail`
  - `OrderReservation`
  - `Inventory`
  - `InventoryTransaction`
- Existing Warehouse UI:
  - `client/src/pages/warehouse/StockExportQueuePage.jsx`
  - `client/src/pages/warehouse/StockExportDetailPage.jsx`
  - `client/src/services/inventoryService.js`

No schema rewrite or new collection is required.

## Authorization

The existing route middleware remains authoritative:

```text
authenticate
→ authorizeRoles('WarehouseManager')
```

The backend does not accept a role, user ID, or actor identity from the
frontend. The authenticated user is passed to the service, which also uses the
existing assignment coordinator inside a transaction to verify that the actor
is still an active `WarehouseManager`.

Expected access:

| Actor | List/detail/process export |
| --- | --- |
| WarehouseManager | Allowed |
| Customer | 403 |
| Staff | 403 |
| Admin | 403 under the current route policy |

## Data-flow and state transitions

### Initial export

```text
Pending
  → Processing
  → Completed
```

The matching fulfillment cycle must be:

```text
AwaitingExport → Exported
```

The matching order must remain:

```text
Confirmed
```

The `Resend` path remains compatible with its existing `Shipped` and cycle
rules; it is not expanded by this slice.

### Processing sequence

1. Normalize and validate the request idempotency key.
2. Load the `StockExportRequest`.
3. Replay a `Completed` request without side effects.
4. Reject an active `Processing` request with a different command key.
5. Claim the request using the existing processing lease.
6. In the business transaction:
   1. Load the order, cycle, and order details.
   2. Validate order/cycle/request state.
   3. Validate every order detail quantity.
   4. Validate reservation lineage for every detail.
   5. Validate inventory health and quantities.
   6. Consume each reservation.
   7. Decrease physical/sellable and reserved quantities atomically.
   8. Create one inventory movement per order detail.
   9. Mark the request `Completed`.
   10. Mark the cycle `Exported`.
   11. Write the completion audit.
7. Commit the transaction.
8. Evaluate low-stock alerts after commit.

If the business transaction fails, all stock, reservation, transaction, cycle,
and audit changes in that transaction are rolled back. The request is then
marked `Failed` using the existing failure path so a safe retry remains
possible.

## Reservation validation

For the initial export, each `OrderDetail` must have exactly one active
reservation:

```text
status     = Reserved
orderId    = Order._id
orderDetailId = OrderDetail._id
productId  = OrderDetail.productId
quantity   = OrderDetail.quantity
```

Released or already-consumed historical rows are not eligible. Duplicate active
reservations, a reservation for another product, a quantity mismatch, a missing
reservation, or an active reservation for an order line not present in the
order details invalidates the export before any stock mutation.

The atomic reservation update also repeats the exact identity and quantity
conditions so a concurrent request cannot consume a different or already
consumed reservation.

## Inventory invariants

For each detail quantity `q`:

```text
stockQuantity    := stockQuantity - q
sellableQuantity := sellableQuantity - q
reservedQuantity := reservedQuantity - q
```

The update is conditional on:

```text
inventoryHealth != ReconciliationRequired
stockQuantity >= q
sellableQuantity >= q
reservedQuantity >= q
```

This prevents negative stock and preserves the existing availability
definition:

```text
availableQuantity = sellableQuantity - reservedQuantity
```

The service checks the before/after availability invariant and fails the whole
transaction if the existing data would make it inconsistent.

## Inventory transaction and duplicate protection

Each order detail creates exactly one `InventoryTransaction` with:

```text
transactionType = STOCK_EXPORT
dimension       = sellable
quantity        = -q
relatedCollection = StockExportRequest
relatedId       = StockExportRequest._id
movementKey     = stock-export:<requestId>:<detailId>
idempotencyKey  = stock-export:<requestId>:<detailId>
```

The existing unique indexes on `movementKey` and `idempotencyKey` are retained.
Together with the request processing lease, exact reservation claim, and
transaction rollback, they ensure that a double click or concurrent request
cannot deduct inventory twice or create duplicate movement records.

## Error behavior

The existing stable error-code style is retained. Relevant failures include:

- `EXPORT_IDEMPOTENCY_KEY_INVALID`
- `EXPORT_ALREADY_PROCESSING`
- `EXPORT_STALE_STATE`
- `EXPORT_CYCLE_STALE`
- `EXPORT_CYCLE_MISSING`
- `EXPORT_INVALID_REQUEST`
- `EXPORT_RESERVATION_MISSING`
- `EXPORT_STOCK_INSUFFICIENT`
- `EXPORT_INVENTORY_RECONCILIATION_REQUIRED`
- `EXPORT_FAILED`

The frontend displays the backend message and reloads the request detail after
both success and failure. A completed replay is reported as a successful
idempotent replay, not as a second export.

## Frontend behavior

The existing queue and detail pages remain the UI entry points. They must:

- list Warehouse Manager-visible requests;
- show order, request, product, quantity, and status;
- show the process button only for `Pending` or `Failed`;
- disable the button while the command is running;
- send one stable idempotency key for the page instance;
- show backend business errors;
- reload the detail after processing;
- stop at `Completed` and clearly leave packing to the later Staff slice.

No shipping controls are added.

## Verification plan

Behavior tests will cover:

1. Warehouse Manager exports a valid confirmed order.
2. Customer cannot call the export API.
3. Staff cannot call the export API.
4. Admin cannot call the export API under the current policy.
5. Missing request.
6. Non-confirmed order.
7. Missing reservation.
8. Reservation product or quantity mismatch.
9. Zero, negative, or non-integer detail quantity.
10. Reconciliation-required inventory.
11. Completed request replay.
12. Two concurrent commands.
13. Stock decreases exactly once.
14. Reservation is consumed exactly once.
15. One inventory transaction per detail.
16. A failure in a later line rolls back earlier lines.
17. Audit failure rolls back the business transaction.

The existing `Resend` tests remain in place and are not removed.

## Non-goals and risks

Non-goals:

- Staff packing.
- Manual shipping handoff.
- Delivered confirmation.
- COD payment update.
- Return/refund/exchange.
- New inventory or export collections.

Known risk to validate during implementation: legacy records may have
`stockQuantity` and `sellableQuantity` out of sync. The service must fail safely
instead of allowing a negative or inconsistent export.
