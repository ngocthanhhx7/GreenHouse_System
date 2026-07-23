# SL-005 G3 Traceability

## Actor and authorization matrix

| Actor | Allowed boundary | Route/test evidence |
|---|---|---|
| Staff | Create, read own, and withdraw own pending damage report | `damageReport.routes.js`, `damageReport.service.js`, damage route/service/hardening tests |
| WarehouseManager | Inventory/count/threshold, damage decision/disposition, replenishment request/receipt/correction/short-closure request | inventory, damage, and replenishment routes/services plus UI contract tests |
| Admin | Exact replenishment decision and short-closure decision | Admin replenishment routes, service conditional-claim tests, Admin UI contract |
| Customer/Supplier/anonymous | No operational SL-005 mutation | authenticated role guards and route contract tests |
| System | Derive quantities/health, append movements, evaluate alerts, emit post-commit handoffs | Inventory, low-stock, migration, notification and transaction tests |

## Business-rule traceability

| Requirement | Implementation | Named evidence |
|---|---|---|
| BR-047 Inventory is sole quantity authority | `product.model.js`, `product.service.js`, `inventory.service.js` | `productStockAuthority.test.js`, product model/service tests |
| BR-048 four dimensions and availability | Inventory model/service and Warehouse UI | inventory tests, `sl005.acceptance.test.js`, `sl005UiContract.test.js` |
| BR-049 evidence-backed quarantine | damage model/service | damage hardening/service/acceptance tests |
| BR-050 bounded Warehouse decision | damage service conditional decision | damage hardening and service tests |
| BR-051 withdrawal/disposition | damage routes/service | damage service and UI contract tests |
| BR-052 physical count and ledger | inventory controller/service/transaction model | inventory and acceptance tests |
| BR-053 reconciliation shortage | Inventory health, affected orders, reservation/export guards | damage hardening, order, exchange, staff-order and inventory tests |
| BR-054 threshold and alert lifecycle | low-stock lifecycle, Inventory/SystemSetting integration | low-stock lifecycle and system-setting tests |
| BR-055 immutable active request | replenishment model/service | replenishment hardening/service/acceptance tests |
| BR-056 exact Admin decision | replenishment conditional transition | replenishment hardening/service tests |
| BR-057 external Supplier/evidence | receipt model and Warehouse receipt command | receipt model, service and UI tests |
| BR-058 partial/rejected/correction/short closure | replenishment service, receipt and transaction models | replenishment hardening/service/acceptance tests |

## Acceptance traceability

| Acceptance | Evidence |
|---|---|
| AT-075–077 | Product authority, Inventory model/calculation and acceptance tests |
| AT-078–082 | damage hardening/service/route tests and Staff/Warehouse UI contract |
| AT-083–086 | physical-count, reconciliation, affected-order and recovery tests |
| AT-087–088 | low-stock lifecycle, threshold and concurrency tests |
| AT-089–093 | replenishment request, active uniqueness, withdrawal and Admin decision tests |
| AT-094–098 | receipt arithmetic, partial/rejected, replay, correction, race and short-closure tests |
| AT-099 | route/RBAC contracts, failure isolation, post-commit notification tests, full regression and disposable migration verifier |

## Invariant evidence

- `OnHand = Sellable + Quarantined + Damaged`.
- Available is `max(Sellable - Reserved, 0)` only in `Normal`; it is zero in `ReconciliationRequired`.
- Every quantity mutation has one attributed InventoryTransaction identity.
- Damage and receipt correction preserve original evidence and append compensating records.
- One active replenishment and one open low-stock alert per Product are enforced by indexes plus duplicate-key recovery.
- Order checkout/cancellation retains the exact SL-003 reservation lineage after the SL-005 rebase.

## Gate evidence

- Server regression: `588/588`, 102 suites.
- Client regression: `175/175`, 51 suites.
- Production build: pass.
- Disposable `rs0` migration: first run transforms seeded legacy data; second run produces zero business writes and recreates/verifies indexes safely.
- Duplicate-active preflight: blocks before mutation with a Product/request-id report.

This traceability proves local release readiness. It does not prove production migration or deployment.
