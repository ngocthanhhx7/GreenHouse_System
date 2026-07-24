# SL-006 Release Audit

## Decision

- Slice: SL-006 — Product, Category, Public Catalog, Best Seller and Cart integration
- Catalog owner: Phạm Thành Chung
- Cart/checkout contract owner: Nguyễn Quang Huy
- Review baseline: `a3fbbce2a15c522348e84ea830a9bcb9c23fd155`
- Result: **READY FOR INDEPENDENT RE-REVIEW**
- This document does not claim merge, deployment, production-data migration or production actor acceptance.

## Closed findings

| Finding | Closure evidence |
|---|---|
| Product could duplicate Inventory stock authority | Product stock input is rejected; Product projection derives public availability from SL-005 Inventory and exposes no raw public dimensions |
| Product creation could publish or partially write grouped records | Idempotent transaction creates Product `Inactive`, exactly one zero Inventory, managed media and identity/price evidence; rollback tests cover grouped failure |
| Product creation declared `Idempotency-Key` but ignored it across controller, service and client | Required key is scoped to the authenticated Admin and bound to a canonical effective-request hash in immutable ProductCommand. Product/Inventory/media/audit/result bind in one transaction; a lost-response retry returns the exact committed snapshot, changed facts return `IDEMPOTENCY_KEY_REUSED`, and the Admin client retains the key across ambiguous failure |
| SKU correction and price changes lacked durable identity/version evidence | Canonical current/former SKU non-reuse, reasoned SKU history, dedicated `priceVersion` and append-only price history are enforced |
| Checkout used generic Product `updatedAt` as price acceptance | Current lines use dedicated `priceVersion`; `updatedAt` remains only a legacy fallback when that field is absent; metadata-only edits no longer cause false `PRICE_CHANGED` |
| Product media trusted arbitrary paths or broad actors | Managed asset ownership/status/expiry, MIME/size/count rules, Admin-only upload/delete and attachment validation close the custody boundary |
| Category duplicates/deactivation could break publication | Unicode-normalized identity is unique; Active → Inactive is blocked while an Active Product references the Category |
| Public catalog could expose inactive identities or raw stock | Public queries require Active Product + Category, expose derived availability only, and return 404 for inactive detail |
| Catalog search/filter/pagination was unbounded or in-memory | Normalized Vietnamese search plus validated bounded filters, deterministic sorting and Product-ID tie break are server-side |
| Best Seller was only presence-tested and could rank invalid facts | Behavioral tests enforce the exact Vietnam 30-day window, inclusive boundaries, Delivered + Paid rules, COD collection timing, exclusions and quantity/revenue/SKU ordering |
| Best Seller could leak an inactive high-volume Product | Ranking projection defensively requires current Product `Active` and current Category `Active`; empty qualifying results use the newest fallback |
| Cart read created state or accepted changed values | `GET /api/cart` is non-mutating; lines retain comparison evidence and reconcile current catalog/Inventory facts into independent issue codes |
| Cart commands were race-prone and non-idempotent | Customer-scoped durable command key/fingerprint plus Cart version predicates apply each unique add/update/remove once and return current Cart on conflict |
| Cart could reserve stock before checkout | Cart performs no reservation or Inventory movement; SL-003 checkout remains the reservation owner |
| Checkout did not prove exact Cart intent or exact closure | Checkout accepts Cart ID/version/expected lines, revalidates catalog/price/availability in the existing transaction and closes only the exact predicate-matched Cart |
| Migration could mutate before finding conflicts or repeat writes | Preflight runs first; normalization is conservative; tests prove a second execution performs zero business-data writes |
| Strict Product update casting silently preserved legacy `stockQuantity` | Regression exercises the real strict Model cast and requires physical removal; migration enables `strict:false` only when issuing the known legacy-field `$unset` |
| UI crossed ownership boundaries | Guest catalog is read-only, Customer owns only Cart/checkout intent, Admin owns Product/Category/media mutation, and Home changes remain data integration rather than layout ownership |

## Test-first and remediation evidence

Initial server acceptance gate:

```text
server> node --test src/acceptance/sl006.acceptance.test.js
27 tests, 0 passed, 27 failed, exit code 1
```

The failures were requirement failures before SL-006 production edits, including the atomic Product/Inventory contract, publication and media guards, SKU/price/category rules, public catalog privacy/search, Best Seller behavior, Cart command semantics and exact Cart checkout.

Independent review remediation was also test-first:

```text
server> node --test --test-name-pattern="dedicated priceVersion|real dedicated" src/services/order.service.test.js
RED: 2 tests, 0 passed, 2 failed
GREEN after fix: 2/2

server> node --test --test-name-pattern="AT-113|AT-114|CR AT-218|CR AT-219" src/acceptance/sl006.acceptance.test.js
RED: 4 tests, 1 passed, 3 failed
GREEN after fix: 4/4

server> node --test --test-name-pattern="physically removes legacy stockQuantity" src/scripts/migrateSl006CatalogCart.test.js
RED: 1 test, 0 passed, 1 failed (`0 !== 1`)
GREEN after fix: 1/1

server> node --test --test-name-pattern="lost response|creation key|Idempotency-Key|idempotency" src/services/product.service.test.js src/controller/product.controller.test.js
RED: 4 tests, 0 passed, 4 failed
GREEN after fix: 4/4

client> node --test --test-name-pattern="admin endpoint|creation command key" src/services/productService.test.js src/pages/admin/ProductManagementPage.test.js
RED: 2 tests, 0 passed, 2 failed
GREEN after fix: 2/2

server> node --test src/models/productCommand.model.test.js src/scripts/migrateSl006CatalogCart.test.js
RED boundary: 6 tests, 4 passed, 2 failed
GREEN after model/index fix: 7/7
```

The legacy-stock RED reproduces the deployment-rehearsal P1: `Product.updateOne()` strict casting reduced the unknown legacy `$unset` to an empty update, so the raw field survived. The final three RED boundaries reproduce the Product-create P1: header/actor options were not forwarded, retry created a second Product, changed-fingerprint reuse was not rejected, the client had no stable retry key, and no durable command model/index existed. The fix is deliberately create-only and leaves route RBAC unchanged.

No exact initial client UI RED count was retained. The final client acceptance count is recorded below without fabricating historical evidence.

## Cross-slice consistency and actor boundaries

- Guest may read Active Category/catalog/detail/Best Seller projections only. Guest has no Cart or Admin mutation authority.
- Customer receives Guest reads plus owner-scoped Cart and checkout intent. Customer cannot mutate Product, Category, media or Inventory.
- Admin may manage Product, Category and Product media, but cannot mutate physical stock through Product or operate a Customer Cart.
- Staff and WarehouseManager do not receive Product/Category/media/Cart mutation authority. Warehouse consumes Product identity through SL-005 Inventory interfaces.
- System code normalizes, validates, derives projections and enforces concurrency/idempotency; it does not invent actor intent or silently mutate Cart on read.
- SL-005 remains physical stock authority; SL-003 remains Order/Payment/reservation/atomic-checkout authority.
- SL-004 owns the fulfillment writer for `completedSaleAt`. SL-006 Best Seller reads it but adds no writer, so deployment must include the correct SL-004 transition source.
- Home layout remains Nguyễn Ngọc Thành's responsibility; SL-006 integrates only catalog/Best Seller data and navigation.
- Historical OrderDetail snapshots remain authoritative for past sales; current Product edits do not rewrite them.

## Verification

- SL-006 server acceptance: `27/27`.
- SL-006 client UI acceptance: `12/12`.
- Focused server matrix: `118/118`, 14 suites/files.
- Focused client matrix: `47/47`, 11 suites.
- Migration tests: `5/5`.
- Full server regression: `726/726`, 123 suites, zero failures.
- Full client regression: `190/190`, 52 suites, zero failures.
- Client production build: exit code `0`, 151 modules transformed; only the existing greater-than-500-kB chunk warning remains.
- Build command used: `node node_modules/vite/bin/vite.js build`. The junctioned shared dependency tree lacks `node_modules/.bin/vite`, so `npm run build` cannot resolve that shim in this worktree even though the installed Vite entry point builds the same source successfully.
- `git diff --check`: clean apart from Windows line-ending conversion notices.
- Server application module load passed.

## Migration audit

- Command: run `npm run migrate:sl006` from `server`.
- Automated evidence proves Category/Product normalization without stock copying, physical removal of legacy Product `stockQuantity`, conservative inactivation when publication cannot be proved, conflict preflight before mutation and a zero-business-write second run.
- The script verifies/creates Product, Category, ProductMediaAsset, Cart, CartItem, CartCommand and ProductCommand indexes after business-data backfill. It does not invent legacy ProductCommand records.
- Independent disposable `rs0` fixture `greenhome_sl006_verify_fixed_20260723220721396` recorded the original catalog/cart data apply as `categories=1`, `products=1`, `media=1`, `carts=2`, `businessWrites=5`, `indexes=6`. After ProductCommand hardening, two consecutive final-script runs each recorded all business writes `0` and `indexes=7`.
- Raw fixture inspection confirmed `stockQuantity` physically absent, normalized Category/SKU/unit, an Active Product with `priceVersion` and search text, Cart `version=0`, CartItem `priceVersion`, exactly one media record, `productCommandCount=0`, and the scoped unique `product_command_admin_key_unique` index.
- No production database, staging database or deployment replica set was migrated as part of this closure work.

## Remaining deployment boundaries

- Select and record the exact target environment/database; take and verify a restorable backup.
- Confirm MongoDB replica-set/mongos transaction capability required by grouped Product and checkout writes.
- Ensure the SL-004 authoritative fulfillment transition writes `completedSaleAt`; SL-006 intentionally provides no competing writer.
- Run `npm run migrate:sl006`, retain its result table, rerun it and confirm `businessWrites: 0`.
- Validate declared indexes and Product/Inventory, publication, Category identity, active-Cart and Cart-line invariants in the target database.
- Configure storage, upload and application environment values outside Git; do not commit credentials or `.env`.
- Perform public catalog/Home and authenticated Admin Product/Category/media plus Customer Cart/checkout browser walkthroughs in the target environment.
- Record rollback evidence, deployment health and post-deploy monitoring before calling the slice released.

## Final review

- The implementation is locally green and the identified price-version, Best Seller, strict legacy-stock migration and durable Admin Product-create idempotency findings have automated regression coverage.
- Independent re-review of the complete diff is still in progress. Do not mark SL-006 merge-ready until that reviewer records that no P0/P1 finding remains.
