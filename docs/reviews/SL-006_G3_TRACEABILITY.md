# SL-006 G3 Traceability

Date: 2026-07-24

Owner: Phạm Thành Chung

Status: `G3_IMPLEMENTED_AND_LOCALLY_VERIFIED_REVIEW_PENDING`

Baseline: `a3fbbce2a15c522348e84ea830a9bcb9c23fd155`

This map is normative only for `SL-006` and CR AT-218/AT-219. `SL-005`
remains the sole quantity authority. `SL-003` remains the owner of Order,
Payment, reservation, and atomic checkout. Home layout remains owned by Nguyễn
Ngọc Thành; this slice supplies only Category/catalog data, best-seller data,
and filtered catalog links/components.

## Actor and authorization map

| Actor | Exact allowed interfaces | Exact denied boundary | Code and acceptance evidence |
|---|---|---|---|
| Guest | `GET /api/categories`; `GET /api/products`; `GET /api/products/best-sellers`; `GET /api/products/:id` | Every `/api/cart*` and `/api/admin/*` mutation; inactive identities; raw Inventory dimensions | `category.routes.js`, `product.routes.js`, `cart.routes.js`; AT-108 through AT-115 |
| Customer | Guest reads plus owned `GET /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/:id`, and `POST /api/orders` | Foreign Cart; Product/Category/media/Inventory mutation; Cart reservation | Auth role guards plus ownership filters in Cart service; AT-109, AT-115 through AT-124 |
| Admin | Admin Product/Category list/create/update/status; Admin-only Product media upload/delete | Inventory quantity mutation through Product; Customer Cart/Order mutation; hard delete | `product.routes.js`, `category.routes.js`, `upload.routes.js`; AT-100 through AT-107 |
| Staff / CSKH | Support-safe Product identity through already-authorized support interfaces | Product, Category, media, or Cart mutation | Admin-only route guards and UI control absence; AT-105 |
| WarehouseManager | Product identity consumed by `SL-005` Inventory screens | Product commercial metadata, Category, price, media, or Cart mutation | Existing SL-005 role routes plus SL-006 Admin-only routes; AT-100, AT-105, AT-109 |
| System | Normalize/validate, derive availability/issues/ranking, enforce transaction/version/idempotency | Invent actor intent, expose raw Inventory, silently mutate Cart on read | Services, migrations, and acceptance tests below; AT-100 through AT-124, CR AT-218/219 |

## Exact API and state map

| Interface | Input contract | State/transaction contract | Output/error contract | Acceptance |
|---|---|---|---|---|
| `POST /api/admin/products` | Required safe `Idempotency-Key`; authenticated Admin identity; canonical nonblank SKU; name; plain-text description; positive integer VND price; unit; active `categoryId`; 1–5 Admin-owned temporary managed image URLs; no stock/status authority | One MongoDB transaction creates Product `Inactive`, one zero-dimension Inventory, attaches media, appends identity/price/audit evidence, and binds immutable ProductCommand `(adminId,key)` + canonical effective-request hash + result snapshot; all or none | First call returns the Admin Product projection. Same scoped key/hash replays the exact committed snapshot after a lost response; same key with changed effective facts returns `IDEMPOTENCY_KEY_REUSED`; missing/unsafe keys are rejected | AT-100, AT-101 plus Product service/controller/client idempotency tests |
| `PATCH /api/admin/products/:id` | Mutable metadata; `skuCorrectionReason` when SKU changes; positive integer price; managed media; no stock | Price change increments only price version and appends old/new history. SKU correction appends former identity. Unit is guarded by InventoryTransaction/OrderDetail existence | Separate identity, unit, price, media, and validation errors; no hard-delete API | AT-103 through AT-105 |
| `PATCH /api/admin/products/:id/status` | `Active` or `Inactive` plus optional reason | Activation reruns complete metadata/media/Category/exactly-one-Inventory guards. Deactivation preserves downstream history and only blocks new intent | Current Admin Product and explicit failed guards | AT-102 |
| `POST/PATCH /api/admin/categories[/:id]` | Unicode display name, explicit valid initial status on create, description/status on update | Persist normalized identity; block Active→Inactive while Active Products reference Category; no hard delete | Authored display plus status; duplicate/deactivation conflict contains field/prerequisite data | AT-106, AT-107 |
| `GET /api/categories` | none | Read-only Active Category query | Public Category fields only | AT-106, AT-108 |
| `GET /api/products` | `keyword`, `categoryId`, integer `minPrice/maxPrice`, `availability=InStock|OutOfStock`, positive `page`, bounded `pageSize`, deterministic `sort` | Server query over Active Product + Active Category; normalized Vietnamese search; stable Product-ID tie break | `{items,total,page,pageSize,totalPages}`; each item exposes only `availabilityStatus`; invalid fields are distinct; no match is 200 empty page | AT-108 through AT-112 |
| `GET /api/products/:id` | Product ID | Read-only Active Product + Active Category + current Inventory projection + authorized active reviews | Public fields and `InStock|OutOfStock`; inactive identity is 404; no raw quantities/health | AT-108, AT-109 |
| `GET /api/products/best-sellers` | optional server-bounded `limit<=10`; clock from request | Vietnam 30-calendar-day `CompletedSaleAt` window; current Delivered+Paid; exclude Returned whole Order and non-public Product; Exchange contributes zero | `{type:'BestSeller'|'Newest',label,items}` ranked quantity, snapshot revenue, SKU; empty qualifying set uses `Sản phẩm mới` | AT-113, AT-114, CR AT-218, AT-219 |
| `GET /api/cart` | authenticated Customer | Read creates no Cart and writes no line/price acceptance. Existing line joins current Product/Category/price/media/Inventory | Empty `{id:null,version:0,status:'Empty'}` or owned Cart; independent issue codes; current totals; `shippingFee:0`; safe maximum only for owning insufficient line | AT-115, AT-120 through AT-122 |
| `POST /api/cart/items` | Header `Idempotency-Key`; `productId`; positive integer `quantity`; integer `expectedVersion` (`0` for no active Cart) | Transaction creates/obtains one Active Cart, creates/increments one line, conditionally increments Cart version once, creates no reservation/movement | Reconciled Cart plus `commandStatus:'Applied'|'AlreadyProcessed'`; version conflict returns current Cart; quantity error may return safe maximum | AT-115 through AT-119 |
| `PATCH /api/cart/items/:id` | Header key; exact positive integer quantity; `expectedVersion` | Owned conditional line update plus Cart version increment exactly once; no reservation | Same command/conflict contract as add | AT-116 through AT-119 |
| `DELETE /api/cart/items/:id` | Header key; body `expectedVersion` | Owned explicit removal plus Cart version increment exactly once | Same command/conflict contract as add | AT-116, AT-117, AT-119 |
| `POST /api/orders` | Header checkout key; `cartId`; `cartVersion`; `expectedItems[{productId,quantity,unitPrice,priceVersion}]`; SL-003 address/payment input | Existing SL-003 transaction additionally revalidates exact owned Active Cart/version, Product+Category publication, price versions, positive quantity, Inventory Normal/Available; creates Order/details/exact reservations/payment and marks only exact Cart CheckedOut | Duplicate returns same Order. Cart/price/availability/grouped-write conflict creates no partial business effect and leaves Cart Active. `shippingFee=0` | AT-123, AT-124 |

## State and concurrency map

| Aggregate | Current state | Event/guard | Required next state/effect | Acceptance |
|---|---|---|---|---|
| Product | None | Valid Admin create and grouped writes commit | `Inactive`; one Inventory; managed media attached | AT-100, AT-101 |
| Product | Committed create command | Same Admin retries same key and effective request after a lost response | No write; return the exact committed Product result snapshot | Product service/controller/client idempotency tests |
| Product | Committed create command | Same Admin reuses key with a different effective request | No write; `IDEMPOTENCY_KEY_REUSED` | Product service idempotency tests |
| Product | Inactive | Activate and all current guards pass | `Active` | AT-102 |
| Product | Active | Availability reaches zero or health not Normal | Remains Active/public as `OutOfStock`; new add/checkout blocked | AT-102, AT-109, AT-122 |
| Product | Active | Admin deactivates | `Inactive`; history and existing Cart intent retained | AT-102, AT-121 |
| Category | Active | Deactivate with an Active Product reference | Remains Active; conflict lists prerequisite | AT-107 |
| Category | Active | Deactivate with no Active Product reference | Inactive; no Product auto-transition | AT-107 |
| Cart | None | Read | None; empty projection only | AT-115 |
| Cart | None | Valid first add with expected version 0 | One Active Cart version 1 and one line | AT-115, AT-119 |
| Cart | Active | Valid unique add/update/remove key and exact version | Apply once; version +1; no Inventory effect | AT-116 through AT-119 |
| Cart | Active | Duplicate command key/fingerprint | No write; return recorded/current outcome as already processed | AT-117 |
| Cart | Active | Stale version or racing command | No write; conflict returns current Cart | AT-119 |
| Cart | Active | Read after Product/Category/price/Inventory change | Same persisted Cart/line; derived current presentation, totals, and all applicable issues | AT-120 through AT-122 |
| Cart | Active | Valid atomic SL-003 checkout | Exact Cart becomes CheckedOut and exactly one Order group commits | AT-123, AT-124 |
| Cart | Active | Checkout conflict or grouped-write failure | Remains Active; no partial Order/detail/reservation/payment | AT-123, AT-124 |

## Rule, data, implementation, and acceptance map

| Rule/decision | Exact data authority and planned migration | Exact implementation files | RED acceptance file/test IDs | Confirmed baseline gap |
|---|---|---|---|---|
| BR-059 / BD-063 | Product `Inactive`; Inventory unique `productId`; managed media attachment; immutable Admin-scoped ProductCommand key/fingerprint/result | `product.model.js`, `productMediaAsset.model.js`, `productCommand.model.js`, `productPersistence.js`, `product.service.js`, `product.controller.js`, client `productService.js`/`ProductManagementPage.jsx`, `migrateSl006CatalogCart.js` | AT-100..102; `product.service.test.js` lost-response/key-reuse/race tests; `product.controller.test.js`; `productCommand.model.test.js`; client Product service/Admin-page contract tests | Baseline accepted requested Active state, lacked media ownership and grouped audit, and ignored the required create key so a lost response could create conflicting Product/media state |
| BR-060 / BD-064 | Product `skuAliases`, immutable `skuHistory`; InventoryTransaction/OrderDetail are unit-use evidence | `product.model.js`, `product.service.js`, migration | AT-103 | SKU may be blank; no former-SKU non-reuse or reason; no unit guard |
| BR-061 / BD-065 | Product `priceVersion`, append-only `priceHistory`; OrderDetail snapshots immutable | `product.model.js`, `product.service.js`, `cart.service.js`, `order.service.js`, migration | AT-104, AT-120, AT-123 | `updatedAt` substitutes for price version; Cart read overwrites stored comparison price |
| BR-062 / BD-066 | ProductMediaAsset owner/status/expiry; filesystem remains opaque managed storage | `productMediaAsset.model.js`, `productMedia.service.js`, upload route/controller/service, cleanup worker, Product Admin UI | AT-105 plus `client/src/acceptance/sl006UiContract.test.js` | Staff may mutate Product media; upload has no owner-bound temporary/expiry/attachment record |
| BR-063 / BD-067 | Category `normalizedName` + `catalogVersion`; Product activation/reassignment and Category deactivation use sessioned shared-Category writes | `category.model.js`, `category.service.js`, `product.service.js`, `productPersistence.js`, `catalogLifecycleRace.test.js`, Category Admin UI, migration | AT-106, AT-107 plus deterministic post-claim race regression | Default status and raw case regex; no update duplicate, deactivation guard, or concurrency boundary |
| BR-064 / BD-068 | Inventory only; public projection is `availabilityStatus`; Cart-only safe maximum | `product.service.js`, `cart.service.js`, Product card/detail/list UI | AT-108, AT-109 | Public DTO exposes quantity as `stockQuantity` |
| BR-065 / BD-069 | Product normalized search value plus compound publication/filter indexes | `catalogQuery.js`, `product.model.js`, `product.service.js`, Product filter/list UI, migration | AT-110..112 | Full in-memory filtering; no availability/page/pageSize/field errors; no Vietnamese normalization |
| BR-066 + CR BR-119 | Order `completedSaleAt`; OrderDetail snapshot revenue; current Order/Product/Category state; Return is Order `Returned` | `bestSeller.service.js`, Product controller/route/service, Home data integration | AT-113, AT-114, CR AT-218, AT-219 | Home reads newest general list; no qualifying/ranking projection |
| BR-067 / BD-071 | ShoppingCart partial unique active index; read-only empty projection | `cart.model.js`, `cart.service.js`, CartContext/UI, migration | AT-115, AT-116 | GET persists an Active Cart; checkout deletes lines after close |
| BR-068 / BD-072 | Cart `version`; CartCommand unique Customer/key with immutable fingerprint/result identity; CartItem unique Cart/Product | `cartCommand.model.js`, Cart/CartItem models, `cart.service.js`, controller/routes, client service/components | AT-116..119 | No version/idempotency; races can lose increments/updates |
| BR-069 / BD-073 | CartItem stores comparison price/name only; current Product/Category/Inventory are joined for response | `cart.service.js`, `CartPage.jsx`, `CheckoutPage.jsx` | AT-120..122 | Read writes refreshed snapshots and exposes no independent issues |
| BR-070 / BD-074 | Exact Cart ID/version plus SL-003 Order/Detail/Reservation/Payment transaction | `order.service.js`, `CheckoutPage.jsx`, `orderService.js` | AT-123, AT-124 | Checkout does not accept Cart ID/version, does not guard Category, and closes Cart without version predicate |

## Database and migration map

`server/src/scripts/migrateSl006CatalogCart.js` will:

1. preflight duplicate canonical/current/former SKU identities, duplicate normalized
   Category names, duplicate active Carts, duplicate Cart/Product lines, and
   Products without exactly one Inventory;
2. backfill Category normalized names, Product normalized search values,
   `priceVersion`, immutable current identity aliases, Cart version, and legacy
   Cart comparison price versions without inventing stock;
3. normalize legacy Product publication conservatively to `Inactive` when the
   complete current publication guard cannot be proved;
4. create/verify unique and partial indexes for Product identity, Category
   identity, active Cart, Cart line, Cart command idempotency, and Admin-scoped
   Product creation command idempotency;
5. be repeat-safe: the second run performs zero business-data writes.

The migration does not delete Product/Category/Cart history and never copies
Inventory quantities onto Product. It creates the ProductCommand index but does
not invent command records for legacy Products.

## G4 and release evidence

- RED gate: run
  `node --test src/acceptance/sl006.acceptance.test.js` from `server` and
  `node --test src/acceptance/sl006UiContract.test.js` from `client`; record the
  expected requirement failures before production edits.
- Product-create idempotency RED: server service/controller tests `4/4` failed
  on missing replay/key-reuse/header enforcement; client contracts `2/2`
  failed on the missing header/stable retry key; model/migration boundary had
  `2` expected failures for the absent ProductCommand model/index.
- Focused GREEN: server `118/118` across 14 suites/files; client `47/47`
  across 11 suites; migration `5/5`; SL-006 server acceptance `27/27`; client
  UI acceptance `12/12`.
- Full regression after race hardening: server `792/792` across 133 suites and
  client `206/206` across 55 suites, with zero failures.
- Build: installed Vite entry point completed with exit code `0`, 153 modules
  transformed; only the existing greater-than-500-kB chunk warning remains.
- Disposable replica-set migration evidence: the original data-normalization
  apply wrote `5` business records. After ProductCommand hardening, two
  consecutive runs each wrote `0` business records and verified all `7`
  model index sets; raw inspection found no invented legacy command and found
  the scoped unique ProductCommand index.
- Hygiene: `git diff --check` and scoped status are required immediately before
  handoff.
- No claim in this slice covers staging actors, provider behavior, production
  migration, deployment, staging, or production acceptance.
