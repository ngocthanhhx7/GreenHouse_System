# SL-005 Release Audit

## Decision

- Slice: SL-005 — Inventory, Damage, Low Stock, and Replenishment
- Owner: Lê Vũ Cường `<levucuong0319@gmail.com>`
- Review baseline: `main` at SL-003 merge `55e89ef`
- Result: **READY FOR REVIEW**
- Production deployment or production-data migration is not claimed.

## Closed review findings

| Finding | Closure evidence |
|---|---|
| B-01 receipt correction atomicity/idempotency | Correction uses one transaction, immutable `ReplenishmentReceipt.correctionOf`, conditional claim, replay identity, and rollback/concurrency tests in `replenishment.hardening.test.js`. |
| B-02 legacy damage bypass | Current Staff/Warehouse commands require evidence and idempotency; legacy mutation payloads are rejected. Compatibility remains in migration/read normalization only. |
| B-03 shortage quarantine | Damage may reduce Sellable below Reserved, persists physical truth, records affected orders, sets `ReconciliationRequired`, and exposes Available as zero. |
| B-04 legacy replenishment bypass | One evidence-backed request/receipt contract remains; legacy one-shot receipt is rejected and only Inventory dimensions are authoritative. |
| B-05 alert lifecycle | Shared low-stock lifecycle opens, refreshes, resolves, and reopens one persisted alert per threshold crossing. |
| B-06 migration | Duplicate-active preflight, custody reconciliation, exact legacy state mapping, repeat-safe indexes, and disposable `rs0` double-run evidence are present. |
| B-07 stale transitions | Withdrawal, receipt, correction, and short-closure transitions use expected-state/version claims and typed conflicts. |
| B-08 actor UI | Staff and Warehouse damage workspaces plus Warehouse/Admin replenishment controls collect reason/evidence and preserve idempotency keys across retries. |
| B-09 Product stock authority | Operational services no longer write `Product.stockQuantity`; public availability is projected from Inventory. |
| B-10 traceability | BR-047–058 and AT-075–099 map to named production files and tests in `SL-005_G3_TRACEABILITY.md`. |

Completeness findings C-01 through C-03 are also closed: Product-based damage resolves one Inventory identity throughout, rejected-only delivery keeps `Approved` with zero stock effect, and notification handoffs target Warehouse/Admin roles after commit.

## Cross-slice conflict resolution

Rebasing onto SL-003 produced intentional conflicts in Order and Return/Refund integration:

- checkout now both records exact `OrderReservation` lineage and evaluates the resulting Inventory for low-stock transitions;
- cancellation claims/releases the exact reservation once, then evaluates the returned Inventory;
- Return/Refund keeps aggregate money-obligation settlement from SL-003 and the SL-005 low-stock lifecycle after warehouse receipt.

Targeted cross-slice tests passed `99/99` server and `4/4` client.

## Verification

- Server: `586/586`, 101 suites, 0 failures.
- Client: `175/175`, 51 suites, 0 failures.
- Production build: passed; only the existing Vite chunk-size warning remains.
- `git diff --check`: clean.
- Migration unit test proves backfills set `timestamps: false`.
- Disposable MongoDB `rs0` verifier:
  - first run: `{ inventories: 1, damageReports: 1, quarantines: 1, replenishments: 3, indexGroups: 6 }`;
  - second run: zero Inventory, damage, quarantine, or replenishment writes;
  - one and only one damage movement;
  - legacy states map to `PendingApproval`, `PartiallyReceived`, `Completed`;
  - duplicate active requests block before any mutation.

## Remaining deployment boundaries

- Run `npm run migrate:sl005` against the intended deployment database after backup and preflight.
- Record authenticated browser walkthrough evidence in the target environment.
- SL-004 must retain `ReconciliationRequired` and exact reservation/export guards.
- Notification delivery/retry ownership remains with Nguyễn Quang Huy under SL-009; SL-005 emits only domain handoff events.
