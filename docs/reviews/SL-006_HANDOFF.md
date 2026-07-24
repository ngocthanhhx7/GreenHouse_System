# SL-006 Handoff

## Status

- Slice: Product, Category, Public Catalog, Best Seller and Cart integration
- Catalog implementation owner: Phạm Thành Chung
- Cart/checkout contract owner: Nguyễn Quang Huy
- Branch: `feature/sl-006-product-catalog-cart`
- Baseline: `a3fbbce2a15c522348e84ea830a9bcb9c23fd155`
- State: **implementation and local verification complete; ready for independent re-review**
- Production deployment, production-data migration and authenticated target-environment walkthrough are not claimed.

## Delivered behavior

- Admin Product creation is durably idempotent and transactional. A required client-supplied key is scoped to the authenticated Admin and bound to the canonical effective request. Product `Inactive`, exactly one zero-dimension Inventory record, managed media links, identity/price/audit evidence and the immutable ProductCommand result snapshot commit as one grouped effect. A lost-response retry returns that exact snapshot; changed facts under the same key return `IDEMPOTENCY_KEY_REUSED`.
- Product keeps canonical current/former SKU identities, explicit price versions and append-only price history. Stock remains solely owned by SL-005 Inventory.
- Activation reruns complete Product, media, Category and exactly-one-Inventory guards; deactivation preserves historical references. No Product or Category hard-delete interface was added.
- Managed Product media is Admin-owned, type/size/count constrained, attachable only through managed URLs and protected from Staff/Warehouse/Customer mutation.
- Category identity is Unicode-normalized and duplicate-safe; an Active Category
  cannot be deactivated while an Active Product references it. Product
  activation/reassignment and Category deactivation share a sessioned,
  versioned Category write, preventing stale concurrent commands from violating
  the publication invariant.
- Public catalog exposes only Active Product + Active Category records, supports bounded search/filter/sort/pagination, hides raw Inventory quantities and returns derived `InStock`/`OutOfStock`.
- Best Seller uses the exact 30-calendar-day Asia/Ho_Chi_Minh window over `completedSaleAt`, includes only current Delivered + Paid non-returned sales and public Products, ranks by quantity/revenue/SKU, and falls back to `Sản phẩm mới`.
- Customer Cart is owner-only, read-only on `GET`, non-reserving, versioned and command-idempotent. Reconciliation returns current Product/Category/price/media/availability plus independent issue codes without silently accepting a new price.
- Checkout validates the exact owned active Cart, Cart version, expected lines, dedicated Product price versions, publication and Inventory availability inside the existing SL-003 transaction. Only the exact Cart is closed after all grouped writes succeed.
- Product Listing, Product Detail, Admin Product/Category, Cart and Checkout screens use the new contracts. Home consumes catalog/best-seller data only; Nguyễn Ngọc Thành retains Home layout ownership.

## Key files

- Traceability: `docs/reviews/SL-006_G3_TRACEABILITY.md`.
- Product/Category/catalog: Product, ProductCommand and Category models; `product.service.js`, `productPersistence.js`, `category.service.js`, `catalogQuery.js`, `bestSeller.service.js`, controllers/routes and normalization/rule/persistence helpers.
- Media: `productMediaAsset.model.js`, `productMedia.service.js`, upload controller/routes and Product media manager.
- Cart/checkout: Cart, CartItem and CartCommand models; `cart.service.js`, cart persistence/projection helpers; `order.service.js`; Cart context/services/pages.
- Client catalog: Product service/cards/filters plus public listing/detail/Home and Admin Product/Category pages. The Admin create form retains one command key across ambiguous failures and rotates it only after confirmed success or an explicit form reset.
- Migration: `server/src/scripts/migrateSl006CatalogCart.js` and its repeat-safety tests.
- Release evidence: `docs/reviews/SL-006_RELEASE_AUDIT.md`.

## Test-first evidence

The retained initial server acceptance RED was:

```text
server> node --test src/acceptance/sl006.acceptance.test.js
27 tests, 0 passed, 27 failed, exit code 1
```

Representative failures covered the missing atomic Product + zero Inventory contract, publication/media/SKU/price/Category guards, public catalog privacy/search, Best Seller rules, Cart idempotency/version/reconciliation and exact Cart checkout closure.

Later review findings were also reproduced RED before their minimal fixes:

```text
server> node --test --test-name-pattern="dedicated priceVersion|real dedicated" src/services/order.service.test.js
2 tests, 0 passed, 2 failed

server> node --test --test-name-pattern="AT-113|AT-114|CR AT-218|CR AT-219" src/acceptance/sl006.acceptance.test.js
4 tests, 1 passed, 3 failed

server> node --test --test-name-pattern="physically removes legacy stockQuantity" src/scripts/migrateSl006CatalogCart.test.js
1 test, 0 passed, 1 failed (`0 !== 1`)

server> node --test --test-name-pattern="lost response|creation key|Idempotency-Key|idempotency" src/services/product.service.test.js src/controller/product.controller.test.js
4 tests, 0 passed, 4 failed

client> node --test --test-name-pattern="admin endpoint|creation command key" src/services/productService.test.js src/pages/admin/ProductManagementPage.test.js
2 tests, 0 passed, 2 failed

server> node --test src/models/productCommand.model.test.js src/scripts/migrateSl006CatalogCart.test.js
6 tests, 4 passed, 2 failed
```

The first command proved checkout still coupled price acceptance to generic `updatedAt`; the second proved Best Seller lacked the qualifying-sale aggregation contract and could leak an inactive Product. The third reproduced the deployment-rehearsal P1: Mongoose strict update casting removed the unknown legacy `$unset`, so `stockQuantity` survived while the migration reported no write. The final three commands proved the required Admin create header was ignored end to end, lost-response retries could create a second identity, key reuse was not rejected, no stable client retry key existed, and no durable command/index model existed. All sets are now green. An exact initial client-acceptance RED count was not retained, so this handoff does not invent one.

## Migration

From `server`:

```powershell
npm run migrate:sl006
```

The migration preflights duplicate Category identity, current/former Product SKU identity, active Cart ownership, Cart/Product lines and the exactly-one-Inventory invariant before mutation. It backfills normalized Category identity and `catalogVersion`, Product search data, dedicated price/SKU evidence, managed media records, Cart versions and legacy line price versions; it never copies stock to Product and conservatively inactivates a legacy Product whose publication guards cannot be proved. It then creates/verifies the declared Product, Category, media, Cart, CartItem, CartCommand and ProductCommand indexes. It intentionally creates no ProductCommand records for legacy Products.

The focused migration test is `5/5` green, including physical removal of the strict-schema-unknown legacy `stockQuantity`, preflight-before-mutation, the seven-model index contract and a second run with zero business-data writes.

Independent disposable `rs0` rehearsal on `greenhome_sl006_verify_fixed_20260723220721396` produced:

```text
catalog/cart data apply before command hardening:
  categories=1, products=1, media=1, carts=2, businessWrites=5, indexes=6
final command-index hardening apply:
  categories=0, products=0, media=0, carts=0, businessWrites=0, indexes=7
final repeat:
  categories=0, products=0, media=0, carts=0, businessWrites=0, indexes=7
raw inspection: stockQuantity absent; Category/SKU/unit normalized; Product Active with
priceVersion/search text; Cart version=0; CartItem priceVersion present; mediaCount=1;
productCommandCount=0; product_command_admin_key_unique is scoped unique
```

This is disposable local fixture evidence only; the script has not been run against production or a claimed deployment database.

## Regression

```text
server SL-006 acceptance: 27/27
client SL-006 UI acceptance: 12/12
focused server matrix: 118/118, 14 suites
focused client matrix: 47/47, 11 suites
migration: 5/5
full server: 792/792, 133 suites
full client: 206/206, 55 suites
client production build: PASS (153 modules)
git diff --check: clean except Windows LF/CRLF notices
```

The installed Vite entry point built successfully with exit code `0`; the existing bundle-size warning remains. In this junctioned workspace, `npm run build` could not resolve the missing shared `node_modules/.bin/vite` shim, so the equivalent installed entry point `node node_modules/vite/bin/vite.js build` was used. This is an environment-path quirk, not a source build failure.

## Downstream contracts

- SL-005 remains the sole physical quantity, availability-health and Inventory movement authority. Product never owns or mutates stock.
- SL-003 remains the Order, OrderDetail, reservation, Payment and atomic checkout owner. SL-006 adds exact Cart/catalog preconditions without splitting that transaction.
- SL-004 owns the authoritative fulfillment transition that writes `completedSaleAt`. SL-006 only reads that fact for Best Seller and does not infer or backfill it.
- Nguyễn Quang Huy owns ongoing Cart/checkout behavior; Phạm Thành Chung owns Product, Category, Product media and public catalog behavior.
- Nguyễn Ngọc Thành owns Home layout and final integration. SL-006 supplies data and filtered links/components only.
- Historical Order reporting continues to use immutable OrderDetail snapshots; current inactive Product/Category state must not rewrite historical sales facts.

## Review and deployment checklist

- [x] BR-059–070, BD-063–074, AT-100–124 and CR AT-218/219 mapped to code and tests.
- [x] Guest, Customer, Admin, Staff and Warehouse mutation/read boundaries covered by automated evidence.
- [x] Full server/client regression, focused matrices, migration tests and client production build pass locally.
- [x] Dedicated price-version, Best Seller, legacy-stock migration and durable Admin Product-create idempotency findings reproduced RED and closed GREEN.
- [ ] Independent final diff review records that no P0/P1 finding remains.
- [ ] Integration owner stages/commits and merges through the approved repository workflow.
- [ ] Deployment owner backs up the intended database, confirms replica-set/mongos transaction support, runs and records `npm run migrate:sl006`, then reruns it and confirms zero business-data writes.
- [ ] Deployment owner verifies target-environment indexes/invariants and completes authenticated Admin/Customer plus public browser walkthroughs.
