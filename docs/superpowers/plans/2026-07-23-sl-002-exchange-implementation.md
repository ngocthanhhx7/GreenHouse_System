# SL-002 Exchange Implementation Plan

> Execute on `feature/sl-002-exchange` only. Preserve the original dirty checkout
> and unrelated `docs/presentation` or output artifacts.

**Goal:** deliver the approved same-SKU Exchange lifecycle without weakening
SL-001 Return/Refund, Inventory, COD, evidence, or actor boundaries.

**Architecture:** a dedicated Exchange service/state machine owns exchange facts.
A small shared after-sales lock supplies cross-collection concurrency control.
Inventory reservation/receipt/shipment effects run inside MongoDB transactions.
Transport facts are append-only events. SL-001 remains the only owner of refund
destination, amount, PayOS, and payout.

**Execution status (2026-07-23):** the scoped implementation exists and is
verified locally against the focused tests, full server/client regressions,
production client build, live replica-set verification, idempotent migration,
and the main Customer/Staff/Warehouse browser walkthrough. The approved
reconstructed baseline demonstration records the same representative probe as
`0/3` on baseline and `3/3` on the implementation, so G4 and G5 pass. Formal
closure still requires the expanded denied/alternate actor walkthrough for G6
and reviewed commit/release evidence for G7. See
`../reconciliation/SL-002_HANDOFF.md`.

## Task 1 — G4 data and contract tests

Files:

- Add Exchange and shared-lock model tests under `server/src/models/`.
- Add `server/src/routes/exchange.routes.test.js`.
- Add `server/src/services/exchange.service.test.js`.
- Add Exchange upload/access tests.
- Add `client/src/pages/exchangeUiContract.test.js`.
- Extend SL-001 tests only for the shared-lock and conversion seam.

Checks:

- Run focused files and record failures caused by missing Exchange behavior.
- Cover AT-019 through AT-039 and CR AT-209 through AT-214 plus the SL-002 COD
  subset of AT-205 through AT-208/223 through AT-226.

## Task 2 — Shared active-case lock and immutable deadlines

Files:

- Add `server/src/models/afterSalesOrderLock.model.js`.
- Add `server/src/services/afterSalesLock.service.js`.
- Add `exchangeDeadlineAt` to `server/src/models/order.model.js`.
- Update delivery/order projections in `server/src/services/order.service.js`.
- Integrate lock claim/release/close into `server/src/services/returnRefund.service.js`.

Checks:

- Cross-type concurrent create yields exactly one active case.
- Rejected, Customer-cancelled, and Expired release the lock.
- Completed Return closes the Order permanently; completed Exchange releases only
  the Order lock and retains unit lineage.

## Task 3 — Exchange persistence and migration

Files:

- Add `exchangeCase`, `exchangeLine`, `exchangeUnitLineage`,
  `stockReservation`, `exchangeInspection`, `exchangeShipment`,
  `exchangeShipmentEvent`, and `exchangeConversion` models.
- Extend `inventoryTransaction.model.js` with Exchange collection/type values.
- Add an idempotent `server/src/scripts/migrateSl002Exchange.js` and package script.

Checks:

- Unique indexes enforce request, lock, reservation, movement, shipment, event,
  and conversion identities.
- Every quantity field is a non-negative integer and reservation cannot exceed
  stock.

## Task 4 — Customer intake and COD hold

Files:

- Add `server/src/services/exchange.service.js`.
- Add `server/src/controller/exchange.controller.js`.
- Add `server/src/routes/exchange.routes.js` and mount it in `server/src/app.js`.
- Extend evidence upload/read aliases and ownership lookup.
- Extend `server/src/services/codReconciliation.service.js` to release or recover
  a held Exchange without conflating Carrier settlement.

Checks:

- Ownership, Delivered state, inclusive deadline, line identity, bounded quantity,
  reason/evidence, idempotency, and active lock are server-enforced.
- Delivered+Unpaid COD creates one `AwaitingCODReconciliation` intake with no
  reservation or approval clock.

## Task 5 — Staff approval and stock choice

Implement:

- Derive shipping payer from Staff-recorded responsibility; require rationale.
- Reject terminally with no stock/money effect.
- Approve only when all exact-SKU reservations commit atomically.
- On stock race/failure, persist `AwaitingExactStockChoice` with no partial
  reservation or deadlines.
- Support Customer wait and Staff retry.

Checks:

- Competing approval simulation proves stock never goes negative and only one
  reservation set commits.
- API rejects amount, bank, payout, PayOS, shipping charge, arbitrary SKU, and
  price-difference fields.

## Task 6 — Handoff, expiry, Warehouse inspection, Inventory

Files:

- Add `server/src/workers/exchangeExpiry.worker.js`.
- Implement Customer handoff/cancel and Warehouse receipt/finalization commands.

Checks:

- `ShipByAt = ApprovedAt + 3 days`; timely proof is immutable.
- Cancel/expiry releases every reservation exactly once.
- Inspection requires exact line accounting.
- Accepted sellable/damaged movements, rejected releases, and outbound
  authorization are one transaction; injected failure rolls all effects back.

## Task 7 — Outbound shipment, delivery, incident, lineage

Implement:

- Warehouse outbound creation for accepted replacements and rejected originals.
- Consume accepted reservation only when replacement shipment is created.
- Signed Carrier event and evidence-backed Staff fallback.
- Delivery reconciliation, incident/resend, wait/conversion, replacement unit
  deadline, and cycle lineage.

Checks:

- Completion waits for all outbound obligations.
- Incident keeps the same case and Shop responsibility.
- Carrier/Staff facts retain source, actor, evidence, time, dispute, and
  correction history.

## Task 8 — Exchange-to-Return handoff

Implement:

- One idempotent transaction releases remaining reservations, marks Exchange
  `ConvertedToReturnRefund`, transfers the shared lock, creates one linked SL-001
  request/handoff, preserves the timely instant, and snapshots existing movement
  identities.
- SL-001 references pre-accounted movement keys and never posts them twice.

Checks:

- Injected handoff failure restores the prior Exchange state and reservations.
- The Exchange response contains no destination/refund/payout data.

## Task 9 — Actor UI

Files:

- Add `client/src/services/exchangeService.js`.
- Refactor Customer Order detail to show **Đổi/Trả hàng** then separate choices.
- Add Customer Exchange history/detail.
- Add Staff Exchange queue/detail.
- Add Warehouse Exchange queue/inspection.
- Add routes in `client/src/App.jsx` and navigation links where appropriate.

Checks:

- Quantity-one uses a checkbox; quantity-many uses a bounded selector.
- Double-click feedback is explicit.
- Staff and Warehouse views expose only their owned data/actions.
- No Exchange screen has amount, bank, payout, PayOS, price-difference, or
  arbitrary replacement SKU controls.

## Task 10 — Verification and handoff

Commands:

- `npm test` in `server`
- `npm run migrate:sl002`
- focused live SL-002 verification script
- `npm test` and `npm run build` in `client`
- browser walkthrough for Customer, Staff, Warehouse, denied routes, duplicate
  submit, partial inspection, delivery incident, and completion

Deliver:

- `docs/superpowers/reconciliation/SL-002_HANDOFF.md`
- exact test counts, actor walkthrough evidence, migration idempotency result,
  residual production configuration needs, commit, push, and review-ready PR.
