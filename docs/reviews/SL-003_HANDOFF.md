# SL-003 Order, Payment and Cancellation — Handoff

Date: 2026-07-24

Implementation owner: Nguyễn Quang Huy

Review owner: Nguyễn Ngọc Thành

Disposition: `READY_FOR_REVIEW`

## Delivered

- Failed or cancelled online callbacks close only the individual payment
  attempt. The Order remains retryable until its immutable payment deadline.
- Late, excess and paid-cancellation money obligations have independent
  `obligationKey` identities and actionable standalone
  `ReturnRefundRequest` cases.
- Aggregate settlement is recomputed from every required obligation.
- `OrderReservation` records exact reservation ownership per Order and
  OrderDetail. Release and warehouse consumption use conditional claims.
- Staff cancellation rejects an export already in `Processing`; warehouse
  export atomically consumes the exact reservation lineage.
- Staff confirm/cancel commands use stable idempotency keys and disable their
  controls while pending.
- Completed checkout replay is resolved before the mutable saved-address
  dependency.
- `DomainOutbox` persists post-commit audit and notification work. Atomic
  lease/claim prevents concurrent workers from publishing the same item and
  reclaims stale Processing work after a crash.
- The SL-003 migration preflights business identity indexes, normalizes legacy
  Order/Payment/Attempt state, backfills active reservation lineage, releases
  expired lineage exactly once and reconciles `Inventory.reservedQuantity`.

## Verification

- Server: **566/566 tests passed**, 93 suites.
- Client: **171/171 tests passed**, 49 suites.
- Client production build: passed. The existing Vite chunk-size warning remains.
- Disposable local MongoDB replica set `rs0`: first-run deadline/lineage/state
  repairs passed; second-run business write counters were all zero. The
  disposable database was deleted in a guarded `finally` block.
- Disposable `rs0` outbox concurrency check: two service instances produced
  one winning claim; a stale lease was reclaimed and completed.
- `git diff --check`: no whitespace error.

## Deployment checks

These are environment/provider checks, not unresolved code blockers:

1. Run the Customer, Staff/CSKH, Warehouse, Admin and Carrier actor walkthrough
   in staging.
2. Exercise the configured payOS callback and payout/reconciliation endpoints
   against the provider sandbox.
3. Inspect legacy cancelled orders that have no recoverable reservation
   lineage before running the production migration.
4. Run a staging cross-order reservation race under production topology.

Scope boundaries remain unchanged: COD remittance is not treated as Customer
collection/refund, and Exchange financial fields are not introduced.

## Post-review evidence — 2026-07-25

P1 `canPay` was closed at `f0b14b6`: the Customer Order Center exposes payment
only for a Pending ONLINE order with payment status `Unpaid`, `Pending`, or
`Failed` and a valid future payment deadline. Missing, invalid, expired, and
closed payment facts fail closed. Focused client evidence is **12/12 passing**
in the three Order Center test files; no full-suite regression is claimed.
