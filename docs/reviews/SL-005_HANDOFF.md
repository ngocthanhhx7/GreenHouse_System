# SL-005 Handoff

## Status

- Slice: Inventory, Damage, Low Stock, and Replenishment
- Owner: Lê Vũ Cường
- Branch: `feature/sl-005-inventory-damage-replenishment`
- State: **implementation and local verification complete; ready for Nguyễn Ngọc Thành review**

## Delivered behavior

- Inventory is the only quantity authority; Product cannot persist or independently update stock.
- Inventory exposes Sellable, Reserved, Quarantined, Damaged, OnHand, Available and `inventoryHealth`.
- Staff reports suspected damage with evidence/idempotency and can withdraw only an own pending report.
- Warehouse decides bounded quantities, records disposition, counts physical Sellable, manages Product threshold overrides, and sees reconciliation/low-stock state.
- Low-stock alert lifecycle is persisted and idempotent across open, refresh, resolve and recross.
- Warehouse creates one active replenishment request per Product; Admin decides the exact request without changing stock.
- Receipts are append-only and support accepted/rejected units, partial completion, correction, replay and short closure.
- Notification hooks publish role handoffs only after the business transaction commits.

## Key files

- Inventory: `server/src/models/inventory.model.js`, `server/src/services/inventory.service.js`
- Damage: `server/src/models/damageReport.model.js`, `server/src/services/damageReport.service.js`
- Alerts: `server/src/models/lowStockAlert.model.js`, `server/src/services/lowStockAlertLifecycle.service.js`
- Replenishment: request/receipt models and `server/src/services/replenishment.service.js`
- Migration: `server/src/scripts/migrateSl005Inventory.js`
- UI: Staff/Warehouse damage pages, Warehouse Inventory/Replenishment pages, Admin Replenishment page
- Detailed evidence: `SL-005_RELEASE_AUDIT.md` and `SL-005_G3_TRACEABILITY.md`

## Migration

From `server`:

```powershell
npm run migrate:sl005
```

The migration first rejects duplicate active replenishment requests, then normalizes Inventory, reconciles legacy damage custody, maps replenishment states and verifies indexes. It preserves historical timestamps and is repeat-safe.

Disposable `rs0` evidence:

- first run: one Inventory, one damage report/quarantine movement and three replenishments transformed;
- second run: zero business writes;
- exactly one damage ledger movement;
- duplicate-active test: blocked before mutation.

Production rollout still requires backup, preflight, target-database execution and recorded rollback evidence.

## Regression

```text
server: 588/588 tests, 102 suites
client: 175/175 tests, 51 suites
client build: PASS
```

The existing Vite warning for a bundle larger than 500 kB remains and is outside SL-005 correctness scope.

## Downstream contracts

- SL-004 fulfillment must reject/export cautiously when Inventory is `ReconciliationRequired` and must consume exact reservation lineage.
- SL-006 catalog/cart must derive availability from Inventory and never restore Product stock authority.
- SL-009, owned by Nguyễn Quang Huy for Notification, consumes SL-005 role-targeted domain events and owns retry/read/delete/reporting behavior.
- Supplier stays external; Supplier authentication, purchasing, contracts and accounts payable are out of scope.

## Review checklist

- [x] BR-047–058 mapped to code/tests.
- [x] AT-075–099 mapped to named evidence.
- [x] Actor routes and UI boundaries checked.
- [x] SL-003 reservation lineage retained after rebase.
- [x] Full server/client regression and build pass.
- [x] Migration double-run and duplicate preflight verified on disposable `rs0`.
- [ ] Nguyễn Ngọc Thành completes final review and merge.
- [ ] Deployment owner executes the production migration.
