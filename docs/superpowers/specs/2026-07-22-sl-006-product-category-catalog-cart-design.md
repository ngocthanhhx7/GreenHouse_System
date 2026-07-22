# SL-006 Product, Category, Catalog, Search, and Cart Design

**Date:** 2026-07-22

**Status:** Fast-track business package approved; implementation not started

**Business approver:** Project Business Approver (user in this Codex task)

**Implementation baseline:** `547ce65463acec3affa82083b423645d9e8a0c2e`

**SRS baseline:** Google Docs revision `AIroW37xl-9inybbV_Kt8cUUhLWLjhfImasxQ_JiEqN2hcPklBhnb6W4yZNbueA2tCWVmMd5XfIbQTkiJLGM6ni-TNQx-hc6-YKXxEmQoPE`; Drive revision `4842`

## 1. Scope and Gate Status

`SL-006` governs the commercial Product and Category records that Admin publishes, the catalog/search/best-seller views used by Guest and Customer, and the Customer-owned Cart that hands a price- and availability-consistent purchase intent to `SL-003` checkout.

The slice begins when Admin creates or changes Product, Category, price, or Product media, or when Guest/Customer requests a catalog view or Customer submits a Cart command. It ends when publication state, public visibility, search/ranking results, Cart ownership, current-price presentation, availability issues, and the checkout handoff are deterministic and traceable.

This package includes:

- Product identity, metadata, publication, price versioning, and no-hard-delete rules;
- Category identity, activation/deactivation guards, and public visibility;
- Admin-only managed Product media and orphan/reference protection;
- public browse, detail, normalized search, filters, stable pagination, and thirty-day best sellers;
- one Customer-owned active Cart, one line per Product, quantity commands, idempotency, optimistic versioning, and no stock reservation;
- live Cart reconciliation against current Product, Category, price, and `SL-005` Inventory;
- an atomic, versioned handoff into the already-approved `SL-003` checkout.

This package does not define Product-review submission/moderation, authentication/profile/address-book behavior, Inventory operations, promotions/vouchers, curated merchandising campaigns, Order/payment processing, shipping, or after-sales processing. Product detail may read already-authorized active reviews, but review mutation belongs to a later package.

`SL-006` consumes Inventory authority and availability from `SL-005`, checkout/order snapshot rules from `SL-003`, final Return/Refund outcome from `SL-001`, and Exchange sale-count boundaries from `SL-002`.

| Slice | G0 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Next evidence |
|---|---|---|---|---|---|---|---|---|---|
| SL-006 | passed | passed | passed | ready | not-started | not-started | not-started | not-started | Reconcile the approved package to the Google SRS, interfaces, red acceptance tests, implementation, actor walkthrough, and release evidence |

No unresolved business decision remains inside the approved `SL-006` package.

## 2. Source-of-Truth Ledger

| Source ID | Source and location | Revision/date | Evidence it can prove | Authority level | Owner | Conflicts |
|---|---|---|---|---|---|---|
| SRC-035 | [Google SRS](https://docs.google.com/document/d/1j_1Qg_DoFC6Dk5zk_UZcnMnjjqW2wjKPNAH1ZNxNwtE/edit?tab=t.0) | Google Docs revision and Drive revision in the document header | Candidate Guest browse/search/detail, Customer Cart, Admin Product/Category, active visibility, availability, and thirty-day best-seller requirements | Candidate source only where adopted by this approved package | SRS contributors; Project Business Approver approves policy | Does not fully define publication guards, Category deactivation, SKU history, media custody, price acceptance, best-seller return semantics, Cart stale-line handling, command idempotency, or concurrent versions |
| SRC-036 | Explicit fast-track approval, “duyệt gói SL-006” | 2026-07-22 | BD-063 through BD-074 and this complete bounded package | Normative business authority for SL-006 | Project Business Approver | Approver display name is not recorded |
| SRC-037 | Repository `D:\GreenHouse_System-main` | HEAD `547ce65463acec3affa82083b423645d9e8a0c2e`; inspected 2026-07-22 | Current Product, Category, Cart, checkout handoff, Product-media, public/admin UI, and tests | `observed-behavior` only | Engineering team | Duplicate Product stock, stale Cart snapshots, non-best-seller home data, hard-coded home categories, missing availability filter, Staff media permission, and incomplete Category lifecycle conflict with this design |
| SRC-038 | Archived SWR Chapter 17 and SWD Chapters 9–11 | Local archive accessed 2026-07-22 | Requirements completeness/consistency/verifiability and explicit state/event/guard/action modeling | Method guidance only | SWR/SWD archive | Does not decide GreenHouse business policy |
| SRC-039 | Approved `SL-001` through `SL-005` designs | Approved 2026-07-22 | Return completion, Exchange non-sale behavior, accepted current price, free shipping, atomic checkout, Inventory authority, availability, and reconciliation rules | Normative for referenced cross-slice rules | Project Business Approver | Current Product/Cart implementation does not yet honor the approved cross-slice contracts |

## 3. Approved Business Decision Log

| Decision ID | Slice ID | Question | Options considered | Approved decision | Rationale | Approver | Decision date | Affected requirements |
|---|---|---|---|---|---|---|---|---|
| BD-063 | SL-006 | How is a Product created, published, hidden, and reactivated? | Create Active immediately; add a Draft state; use guarded Inactive/Active publication | Create complete Product metadata as `Inactive` and atomically create exactly one zero-dimension Inventory. Admin explicitly activates only after all publication guards pass. Zero AvailableQuantity keeps an Active Product visible as OutOfStock. Deactivation blocks new Cart/reservation effects without cancelling existing Orders or deleting history; reactivation reruns every guard | Keep the two-state vocabulary small while preventing incomplete or stock-authority-breaking publication | Project Business Approver | 2026-07-22 | BR-059 |
| BD-064 | SL-006 | Which Product identity and history rules are stable? | Optional mutable SKU; fully immutable metadata; canonical identity with attributable corrections | Require a canonical unique SKU. Admin correction requires a reason, preserves old SKU history, and never permits an old SKU to identify another Product. Unit becomes immutable after the first InventoryTransaction or OrderDetail. Product is never hard-deleted; mutable commercial metadata retains audit and historical Order snapshots | Preserve operational identity without making a proven correction impossible or rewriting history | Project Business Approver | 2026-07-22 | BR-060 |
| BD-065 | SL-006 | How does a price change affect catalog, Cart, and Order history? | Keep stale Cart price; silently replace it; version current price and require Customer confirmation | Price is a positive integer in VND. Every change is immediate for the catalog, increments a price version, and is audited. Existing Orders retain snapshots. Cart shows old/current difference, and final Place Order explicitly accepts the displayed current version; another change before commit rejects checkout | Prevent both stale undercharging and an unannounced higher charge while preserving immutable Orders | Project Business Approver | 2026-07-22 | BR-061 |
| BD-066 | SL-006 | Who may manage Product media and how is file custody protected? | Arbitrary URLs; Admin and Staff upload; Admin-only managed media | Only Admin may upload, attach, reorder, or remove Product images. Accept one through five system-managed JPEG/PNG/WebP files, each at most 5 MB, after extension, MIME, and content validation. Temporary uploads are owner-bound and cleaned when abandoned; referenced current Product or Order snapshots prevent unsafe deletion | Enforce least privilege, stop executable/path/URL abuse, and preserve historical presentation | Project Business Approver | 2026-07-22 | BR-062 |
| BD-067 | SL-006 | How are Category identity and deactivation handled? | Hard delete/cascade; silently hide linked Products; guarded non-destructive lifecycle | Normalize Category names for whitespace/case uniqueness and never hard-delete. Admin may create with an explicit valid status, update, activate, or deactivate. Deactivation is blocked while any Active Product references the Category; Admin must reassign or deactivate those Products first. Reactivation never auto-reactivates Products | Avoid orphaned public Products and irreversible historical damage | Project Business Approver | 2026-07-22 | BR-063 |
| BD-068 | SL-006 | What Product and stock data may public actors see? | Expose raw inventory dimensions; hide availability entirely; expose sales availability only | Guest/Customer receive only Active Products in Active Categories and a derived InStock/OutOfStock status. Raw Sellable, Reserved, Quarantined, Damaged, threshold, and health dimensions remain hidden. An owning Customer receives current maximum orderable quantity only where needed to correct a Cart line | Give sufficient purchase feedback without exposing warehouse operations or a second quantity authority | Project Business Approver | 2026-07-22 | BR-064 |
| BD-069 | SL-006 | What is the search/filter/pagination contract? | Load all and filter in memory; basic case-sensitive lookup; normalized bounded server query | Server performs stable pagination and normalized case/diacritic-insensitive matching across name, SKU, and description, with Category, valid price-range, and availability filters. Invalid filters receive field feedback; an empty result is successful and explicit | Make search predictable, scalable, and testable for Vietnamese catalog data | Project Business Approver | 2026-07-22 | BR-065 |
| BD-070 | SL-006 | What qualifies and ranks a best-selling Product? | Newest Products; gross Orders regardless of outcome; net completed sales window | Rank up to ten currently public Products using quantities from `Delivered + Paid` Orders in the current Vietnam-time thirty-calendar-day window, excluding Orders whose whole Return/Refund completed as `Returned`. Exchange creates no new sale. Ties use Order-detail snapshot revenue then SKU. With no qualifying sale, show newest Products under the distinct label “Sản phẩm mới” | Avoid calling cancelled, unpaid, returned, exchanged, or merely recent Products best sellers | Project Business Approver | 2026-07-22 | BR-066 |
| BD-071 | SL-006 | Who owns a Cart and when does it exist or reserve stock? | Guest/session Cart; create on read; one Customer active Cart created on first add | Only authenticated Customer owns a Cart. At most one Cart is Active and one Product appears once. Empty read returns an empty representation without writing; first valid add atomically creates the Cart. Cart never reserves stock. Successful checkout marks the exact Cart CheckedOut; a later add may create a new Active Cart | Keep reads side-effect free and separate purchase intent from the `SL-003` reservation boundary | Project Business Approver | 2026-07-22 | BR-067 |
| BD-072 | SL-006 | How do quantity commands behave under retries and concurrency? | Append duplicate lines; overwrite without version; atomic idempotent command semantics | Add uses a positive integer and increments an existing Product line; update sets an exact positive integer; remove is explicit. Add/update cannot exceed current AvailableQuantity at command time. Each command has an idempotency identity and expected Cart version; retries return the existing result with visible feedback, while stale concurrent commands return the current Cart without a lost update | Make intentional repeated adds possible while preventing double-click and concurrency corruption | Project Business Approver | 2026-07-22 | BR-068 |
| BD-073 | SL-006 | What happens when Product, price, Category, or stock changes while an item is in Cart? | Keep stored snapshots; silently delete/replace; retain intent with live issue flags | Every Cart read joins current Product, Category, price/version, and Inventory. Current prices calculate totals. Inactive Product/Category, insufficient stock, ReconciliationRequired, and changed price are returned as explicit independent issues; the line remains until Customer fixes/removes it. Current name/image update for presentation. No invalid line may silently proceed | Preserve Customer intent and give a deterministic correction path without trusting stale snapshots | Project Business Approver | 2026-07-22 | BR-069 |
| BD-074 | SL-006 | What exact Cart state is handed to checkout? | Client totals are trusted; best-effort checkout; versioned atomic handoff | Place Order submits Cart version, displayed Product price versions, and an idempotency key. Server atomically revalidates ownership, Product/Category publication, accepted current price, positive quantity, SL-005 AvailableQuantity/health, delivery/payment input under SL-003, and then creates immutable Order details/reservations/payment state and marks the exact Cart CheckedOut. Any conflict creates no partial effect. Current ShippingFee remains zero | Close the last pre-checkout race without duplicating SL-003 business state | Project Business Approver | 2026-07-22 | BR-070 |

## 4. Actor Responsibility Matrix

| Actor | Business goal | May initiate | Must not perform | State transitions owned | Data read/write scope | Handoffs | Failure paths |
|---|---|---|---|---|---|---|---|
| Guest | Find purchasable GreenHouse Products without an account | Browse active Categories/Products; search/filter; open active Product detail; view best sellers or the explicitly labelled newest fallback | Create/read/mutate Cart; view internal stock dimensions; access inactive Product/Category or admin metadata | None | Read public Product/Category fields, active reviews, current price, images, and derived availability status only | May authenticate as Customer before creating purchase intent | Invalid filter receives field feedback; inactive identity is not disclosed beyond not-found; empty results remain successful |
| Customer | Build and review one owned purchase intent before checkout | All Guest reads; add/update/remove owned Cart lines; review current prices/issues; submit versioned checkout | Set Product price/status/category/media/stock; reserve stock through Cart; read another Customer's Cart; force stale price or availability | Own Cart intent and `Active -> CheckedOut` initiation through valid Place Order; no Product, Inventory, Order, or Payment state ownership | Read own Cart and correction-safe maximum orderable quantity; write own quantities only | Valid current Cart to `SL-003`; receives conflict details back from System | Foreign/stale/invalid command is denied; unavailable lines remain visible for correction; duplicate key returns the existing result |
| Admin | Maintain valid commercial metadata and control catalog publication | Create/update Product and Category; activate/deactivate; correct SKU with reason; change price; upload/attach/reorder/remove Product media; inspect audit | Enter or adjust stock; mutate Customer Cart/Order; bypass Category/Product guards; hard-delete business history; grant Staff Product-media mutation | Product and Category publication transitions; attributable metadata/price/media changes | Read/write Product/Category/media and relevant audit; read Inventory existence/publication context but not fabricate quantity | Product creation to `SL-005` Inventory initialization; Active Product/Category to public catalog | Invalid identity/media/category/activation or atomic Inventory failure changes no partial Product state; blocked deactivation lists the safe prerequisite |
| Staff / CSKH | Identify Products while supporting Customers without governing catalog | Read the minimum public/Product identity needed for support | Create/update/activate/deactivate Product or Category; upload/delete Product media; change price/stock; access or mutate a Customer Cart in SL-006 | None | Support-safe Product identity only; no Product/Category/media/Cart write | Product references into later Support/after-sales slices | Forbidden endpoint returns denial without granting upload or mutation capability |
| Warehouse Manager | Operate physical stock using stable Product identity | Read Product/SKU identity and manage Inventory only through `SL-005` | Change Product commercial metadata, Category, price, media, publication, or Customer Cart | None in SL-006; Inventory states remain owned by `SL-005` | Read Product identity plus authorized internal Inventory context; no catalog write | Committed SL-005 AvailableQuantity/health to System catalog and Cart reconciliation | Forbidden catalog command is denied; reconciliation state exposes zero sales availability without rewriting Product |
| GreenHouse System | Keep publication, public reads, Cart intent, and checkout handoff consistent | Validate and execute authorized commands; derive public views/issues/totals; normalize search; calculate best sellers; enforce idempotency/version guards | Invent Admin publication or Customer quantity/price acceptance; expose protected Inventory; silently remove intent; treat read as approval | Mechanical transitions after valid actor event and guard; derived availability/issue/ranking outputs | Join Product, Category, Inventory, Cart, Order snapshots, and audit within least-privilege response boundaries | Active catalog to Guest/Customer; Cart snapshot to `SL-003`; current conflicts back to Customer/Admin | Grouped writes roll back; stale command returns current state; duplicate event produces no repeated business effect |

Carrier, Supplier, payOS, Notification/Email, and Product-review moderation are not initiating actors in `SL-006`.

## 5. Business Slice Contract

| Slice ID | Actor and outcome | Trigger | Preconditions | Happy path | Alternative/failure paths | Rules/calculations | State invariants | Permissions/data ownership | Acceptance examples | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| SL-006 | Admin publishes valid Product/Category data; Guest/Customer receives a truthful catalog; Customer hands one current owned Cart to checkout | Authorized catalog command, public catalog query, Cart command/read, or Place Order | Authorized actor; valid current entity/version; complete metadata/media; valid publication relationship; valid quantity; SL-005 Inventory context; command identity for writes | Execute UC-PRD-01, UC-CTG-01, UC-PUB-01, UC-CART-01, then UC-HND-01 when Customer checks out | Apply AF-006 branches without leaking data, losing intent, trusting stale state, or creating partial Product/Inventory/Order effects | Positive integer VND price; derived availability; normalized search; thirty-day completed-sale ranking; current-price Cart totals; ShippingFee zero | One Product identity/history; one Inventory authority; Active Product requires valid publication guards; one active Cart/one line per Product; Cart reserves zero; version/idempotency effects occur once | Actor matrix above | AT-100 through AT-124 | `approved-requirement` |

## 6. Normative Requirements

| Requirement ID | Normative requirement | Source decision |
|---|---|---|
| BR-059 | Admin shall create a complete Product as `Inactive` with canonical unique SKU, name, nonblank plain-text description, positive integer VND price, unit, one through five valid managed images, and an existing Active Category. Product input shall contain no stock value. One transaction shall create the Product and exactly one zero-dimension Inventory governed by `SL-005`; either both commit or neither does. `Inactive -> Active` requires all metadata/media/category/Inventory guards. Active with AvailableQuantity zero remains public as OutOfStock. `Active -> Inactive` blocks new Cart adds/reservations but preserves Inventory, Cart intent, Orders, media snapshots, and audit; reactivation reruns every guard. | BD-063 |
| BR-060 | Product SKU shall be normalized, nonblank, and unique across all Product statuses. An Admin SKU correction shall require a reason, retain the former SKU in immutable history, and prevent that former SKU from being assigned to another Product. Unit shall become immutable after the first InventoryTransaction or OrderDetail for the Product; a different unit thereafter requires a new Product. Product shall never be hard-deleted. Name, description, Category, images, price, and publication changes shall preserve actor/time audit and immutable OrderDetail snapshots. | BD-064 |
| BR-061 | Product price shall be a positive integer denominated in VND. Each authorized price change shall record old/new value, actor, event time, and a monotonically changed price version and shall become current for later public/Cart reads. Existing OrderDetail price/subtotal snapshots shall never change. Cart shall expose old/current difference where versions differ; Place Order shall explicitly submit the displayed current price version, and checkout shall reject rather than charge a later version silently. | BD-065 |
| BR-062 | Only Admin shall upload, attach, reorder, detach, or remove Product media. A Product shall have one through five ordered system-managed JPEG, PNG, or WebP images, each no greater than 5 MB, validated by allowed extension, declared MIME, and file-content signature, with server-generated storage identity. The first image is featured. Temporary upload shall be bound to the uploading Admin/draft until attachment and shall expire or be cleaned when abandoned. Media referenced by a current Product or immutable OrderDetail snapshot shall not be physically deleted; arbitrary client URL/path input and Staff mutation shall be denied. | BD-066 |
| BR-063 | Category name shall be Unicode-normalized, trimmed, internal whitespace-collapsed, and unique under case-insensitive comparison while preserving the authored display value. Admin shall explicitly select a valid initial `Active` or `Inactive` status and may update, activate, or deactivate without hard delete. Active Product shall reference exactly one Active Category. Category deactivation shall be rejected while any Active Product references it and shall identify the need to reassign or deactivate those Products. Inactive linked Products may remain historical; Category reactivation shall not reactivate any Product automatically. | BD-067 |
| BR-064 | Public catalog/detail/category interfaces shall return only Active Products whose Category is Active. Guest/Customer shall receive current commercial fields, active authorized reviews where applicable, and derived `InStock` when SL-005 InventoryHealth is Normal and AvailableQuantity is greater than zero, otherwise `OutOfStock`. They shall not receive raw Sellable, Reserved, Quarantined, Damaged, EffectiveThreshold, or InventoryHealth fields. Only an owning Customer Cart correction response may expose current `MaxOrderableQuantity` needed to reduce an insufficient line. Inactive public Product/Category identity shall return not-found rather than protected metadata. | BD-068 |
| BR-065 | Product search shall execute server-side over currently public Products using Unicode-normalized, case- and Vietnamese-diacritic-insensitive matching across name, SKU, and description. It shall support exact active Category, nonnegative minimum/maximum price with minimum not above maximum, and availability filters. Pagination shall use a bounded positive page size and deterministic order with a stable Product-ID tie-breaker so one unchanged query neither skips nor duplicates items. Invalid filters shall return field-specific validation; no match shall return a successful explicit empty page. | BD-069 |
| BR-066 | BestSeller calculation at request time shall use the interval from 00:00:00 on the Vietnam calendar date twenty-nine days before the request through the request instant in `Asia/Ho_Chi_Minh`. It shall sum OrderDetail quantity only for Orders currently `Delivered` with Payment `Paid`, exclude a whole Order once `SL-001` completes it as `Returned`, and create no additional sale from `SL-002` Exchange or replacement fulfillment. Only currently public Products qualify. Rank descending by qualifying quantity, then qualifying OrderDetail snapshot revenue, then canonical SKU ascending, and return at most ten. If none qualifies, return newest currently public Products under “Sản phẩm mới”, never under “Bán chạy”. | BD-070 |
| BR-067 | Only authenticated Customer shall own Cart data. One Customer shall have at most one `Active` Cart and one Cart shall have at most one line per Product. Reading with no Cart shall return an empty representation without persistence. First valid add shall atomically create or obtain the single Active Cart. Cart shall represent intent only and shall create no reservation or Inventory movement. Successful checkout shall mark the exact Cart `CheckedOut`; a future first add may create a new Active Cart. Empty Active Cart does not expire or change stock in the current release. | BD-071 |
| BR-068 | Cart add/update quantity shall be a positive integer and no greater than current SL-005 AvailableQuantity at command time. Add shall increment the existing Product line; update shall set the exact line quantity; remove shall explicitly delete only the owned line. Every state-changing Cart command shall include an idempotency key and expected Cart version. The same Customer/key/command shall return the existing result with explicit already-processed feedback and no repeated quantity effect. A stale expected version shall commit nothing and return the current Cart; concurrent first-add/same-Product operations shall preserve the one-active-Cart/one-line invariants without lost updates. | BD-072 |
| BR-069 | Each Cart read shall join current Product, Category, price/version, images/name, and SL-005 Inventory rather than trust stored Product/price/stock snapshots. Line subtotal shall equal current UnitPrice multiplied by selected Quantity and Cart subtotal shall be their sum; ShippingFee display shall be zero. Changed price, inactive Product/Category, InventoryHealth not Normal, and insufficient AvailableQuantity shall be independent issue flags because several may coexist. Invalid lines shall remain owned and visible until Customer updates/removes them; current presentation metadata may refresh, but no read shall silently delete, reserve, accept price, or hide an issue. | BD-073 |
| BR-070 | Place Order shall carry Customer identity from authentication, Cart ID/version, every displayed Product price version, and a checkout idempotency key. In the `SL-003` transaction, System shall revalidate one owned Active Cart, nonempty lines, Active Product/Category, accepted current price version, positive quantities, SL-005 Normal health and AvailableQuantity, delivery/payment input, and `ShippingFee = 0`; it shall then create one Order, immutable OrderDetails, exact reservations, initial payment state, and mark only that Cart CheckedOut. Duplicate success shall return the same Order. Any stale, invalid, insufficient, or grouped-write failure shall create none of those effects and shall return line-specific correction data where safe. | BD-074 |

## 7. UC-PRD-01 — Manage Product Publication

### Preconditions

1. Actor is authenticated Admin.
2. A target Category exists and is Active for Product creation or reassignment.
3. One through five validated Admin-owned temporary media references are ready to attach.
4. Submitted Product metadata contains no stock field.

### Main Flow

1. Admin submits complete Product metadata and an idempotent command identity.
2. System normalizes and checks SKU, validates price/unit/text/category/media, and denies any stock input.
3. In one transaction, System creates Product as `Inactive`, creates exactly one zero-dimension `SL-005` Inventory, attaches media, and records audit. A failure leaves no partial Product/Inventory relationship.
4. Admin reviews the Inactive Product and explicitly requests activation.
5. System reruns metadata, media, SKU, Category, and Inventory guards and changes `Inactive -> Active` with audit.
6. Public catalog immediately exposes current commercial fields and derived InStock/OutOfStock without raw Inventory dimensions.
7. An authorized price or ordinary metadata change creates attributable history; price additionally increments its version.
8. Admin may deactivate with reason/context. Existing Orders/reservations/history remain; new Cart add/reservation is blocked and existing Cart lines become Unavailable.
9. Reactivation succeeds only after every current publication guard passes again.

## 8. UC-CTG-01 — Manage Category Lifecycle

### Preconditions

1. Actor is authenticated Admin.
2. Name and explicit initial status are valid.

### Main Flow

1. Admin creates or updates Category name/description/status.
2. System normalizes identity for uniqueness while preserving the display value and records audit.
3. Active Categories appear in public navigation/filter data; Inactive Categories do not.
4. Before deactivation, System finds Active Products referencing the Category.
5. If any exist, deactivation is rejected and Admin must reassign or deactivate them.
6. If none exists, Category becomes Inactive; linked Inactive Product history remains.
7. Reactivation exposes the Category but does not change any Product status.

## 9. UC-PUB-01 — Browse, Search, and Rank the Public Catalog

### Browse and Detail

1. Guest or Customer requests Categories, Product listing, or Product detail.
2. System restricts the query to Active Product plus Active Category.
3. System joins current price/media and derives InStock/OutOfStock from `SL-005` without exposing internal dimensions.
4. Product detail includes active authorized reviews as a read-only dependency where available.
5. Zero-available Product remains visible as OutOfStock and its add action is disabled.

### Search and Filter

1. Actor submits optional keyword, Category, price range, availability, and pagination values.
2. System validates field shape/range and normalizes Vietnamese text comparison.
3. System applies every supplied filter on the server and uses deterministic pagination/order.
4. System returns a page with total/paging metadata or a successful empty result.

### Best Sellers

1. System computes the Vietnam-time thirty-calendar-day window at request time.
2. It aggregates qualifying Delivered/Paid OrderDetail snapshots and excludes completed whole-Order returns.
3. Exchange/replacement activity adds no sale quantity or revenue.
4. It removes Products not currently public, applies the approved ranking/ties, and returns up to ten.
5. If no qualifying row remains, System returns newest public Products with fallback type/label `Sản phẩm mới`.

## 10. UC-CART-01 — Manage and Reconcile an Owned Cart

### Read

1. Customer requests own Cart.
2. If no Active Cart exists, System returns an empty representation without creating one.
3. Otherwise System loads each owned line and joins current Product, Category, price/version, presentation fields, and Inventory.
4. System derives independent issue flags and current-price totals without changing Cart, accepting price, or reserving stock.

### Add

1. Customer submits Product, positive quantity, idempotency key, and expected Cart version where an Active Cart exists.
2. System validates current publication and AvailableQuantity.
3. It atomically creates/obtains the one Active Cart and creates one line or increments the existing line.
4. System increments Cart version and returns current reconciled Cart plus an explicit added/already-processed message.

### Update or Remove

1. Customer submits an owned line, expected Cart version, command key, and exact positive quantity for update, or explicit remove.
2. System checks ownership, current state, availability for update, and version.
3. It sets exact quantity or removes the line once and increments Cart version.
4. A stale version changes nothing and returns the current Cart for refresh.

## 11. UC-HND-01 — Confirm Current Cart and Enter Checkout

### Preconditions

1. Customer owns one nonempty Active Cart.
2. Customer has reviewed current prices, any old/current change notice, `ShippingFee = 0`, and delivery/payment inputs.
3. Every line currently has no Unavailable, InsufficientStock, or InventoryReconciliation issue.

### Main Flow

1. Customer selects Place Order, which explicitly accepts every displayed current price version.
2. Client sends Cart ID/version, line price versions, delivery/payment input, and checkout idempotency key.
3. Within the approved `SL-003` transaction, System reruns ownership, publication, price, quantity, Inventory health/availability, and checkout-input guards.
4. System creates one Order, immutable detail snapshots, exact reservations, and initial Payment state, then changes the exact Cart `Active -> CheckedOut`.
5. System returns the one Order; an identical completed retry returns that result.
6. Any conflict returns the current affected line facts and leaves Cart Active with no partial Order/detail/reservation/payment effect.

## 12. Alternative and Failure Paths

| Path | Condition | Required result |
|---|---|---|
| AF-006-01 | Non-Admin or Staff attempts Product/Category/media mutation | Deny before mutation; expose no privileged control or file effect |
| AF-006-02 | Product input contains stock quantity | Reject; create/update no Product stock and do not create a second authority |
| AF-006-03 | Product commits but Inventory/media attachment would fail | Roll back the grouped creation; leave no partial Product or extra Inventory |
| AF-006-04 | SKU is blank/duplicate or former SKU is being reused | Reject with identity feedback; preserve existing Product/history |
| AF-006-05 | Unit change is attempted after InventoryTransaction/OrderDetail exists | Reject; direct Admin to create a distinct Product identity |
| AF-006-06 | Activation lacks valid metadata, media, Active Category, or exactly one Inventory | Keep Inactive and identify guards; expose nothing publicly |
| AF-006-07 | Product is deactivated with existing Cart lines or open Orders | Preserve lines/Orders/reservations/history; block new sale intent and flag affected Cart lines |
| AF-006-08 | Category deactivation has Active Products | Reject with prerequisite information; change neither Category nor Product |
| AF-006-09 | Invalid file count/size/extension/MIME/content/path/owner or arbitrary URL | Reject and store/attach no unsafe media; do not reveal server paths |
| AF-006-10 | Media removal targets a current Product or OrderDetail snapshot reference | Deny physical deletion; detach only where allowed and retain referenced asset |
| AF-006-11 | Public actor requests inactive Product/Category | Return not-found/public-empty behavior without protected metadata |
| AF-006-12 | Search price range is negative, malformed, or minimum exceeds maximum | Return field-specific validation and execute no ambiguous query |
| AF-006-13 | Search has no match | Return successful empty page and visible empty-state guidance |
| AF-006-14 | Best-seller window has no qualifying public sale | Return newest public Products with fallback label `Sản phẩm mới` |
| AF-006-15 | Guest or foreign Customer requests/mutates Cart | Deny; expose or change no Cart data |
| AF-006-16 | Cart quantity is zero, negative, fractional, malformed, or above current AvailableQuantity | Reject; preserve prior Cart and return correction-safe current limit when authorized |
| AF-006-17 | Same Cart command key is retried | Return existing command outcome and explicit already-processed feedback; apply no second effect |
| AF-006-18 | Expected Cart version is stale or concurrent first-add/same-line commands race | Commit at most one valid version/line effect; loser receives current Cart and retries intentionally |
| AF-006-19 | Product/Category/price/stock changes after line creation | Preserve line, recompute current total, and return every applicable issue; do not silently accept/delete/reserve |
| AF-006-20 | Price/version changes after display but before checkout commit | Reject checkout with current price/version; create no Order/reservation/Cart closure |
| AF-006-21 | Inventory enters ReconciliationRequired or Available falls below quantity | Expose line issue/maximum where authorized; block checkout and create no reservation |
| AF-006-22 | Any checkout grouped write fails | Roll back Order/details/reservations/payment/Cart transition as one group |
| AF-006-23 | Completed checkout key is repeated after response loss | Return the same Order; do not create a second Order or new Cart effect |

## 13. State Models

### 13.1 Product Publication State

| Current state | Event | Guard | Action | Next state |
|---|---|---|---|---|
| None | Admin creates Product | Complete valid metadata/media; Active Category; unique canonical SKU; no stock input | Atomically create Product and zero Inventory; attach media; audit | Inactive |
| Inactive | Admin activates | Every current publication guard passes; exactly one Inventory exists | Audit and publish | Active |
| Inactive | Admin activates | Any guard fails | Return missing/invalid guards; no publication | Inactive |
| Active | Available becomes zero or health not Normal | Committed SL-005 fact | Derive OutOfStock; block add/reservation; keep public where Product/Category remain Active | Active |
| Active | Admin deactivates | Authorized command | Audit; block new Cart add/reservation; preserve downstream history | Inactive |
| Active/Inactive | Admin changes price | Valid positive integer VND | Append audit; increment price version; retain Order snapshots | Same publication state |
| Active/Inactive | Delete attempted | Product business identity exists | Deny hard delete | Same state |

### 13.2 Category State

| Current state | Event | Guard | Action | Next state |
|---|---|---|---|---|
| None | Admin creates Category | Unique normalized name and explicit valid status | Create and audit | Active or Inactive as selected |
| Inactive | Admin activates | Valid Category | Audit and expose Category; do not change Products | Active |
| Active | Admin deactivates | No Active Product references it | Audit and hide Category; retain linked Inactive Product history | Inactive |
| Active | Admin deactivates | At least one Active Product references it | Reject and identify prerequisite | Active |
| Active/Inactive | Delete attempted | Category business identity exists | Deny hard delete | Same state |

### 13.3 Cart State

| Current state | Event | Guard | Action | Next state |
|---|---|---|---|---|
| None | Read Cart | Authenticated Customer | Return empty representation; persist nothing | None |
| None | First add | Valid current Product/quantity/key | Atomically create one Active Cart and one line | Active |
| Active | Add/update/remove | Owner, valid key/version/command | Apply once; increment Cart version; reserve nothing | Active |
| Active | Read/reconcile | Owner | Derive current fields/issues/totals; persist no acceptance or reservation | Active |
| Active | Valid atomic checkout | Every SL-003/SL-005 guard passes | Create Order group and close exact Cart | CheckedOut |
| Active | Checkout conflict/failure | Any guard/write fails | Roll back checkout group; return current correction data | Active |
| CheckedOut | Read historical ID or mutate | Terminal Cart instance | Deny mutation; later valid add may create a different Active Cart | CheckedOut |

### 13.4 Cart Line Reconciliation Facts

Cart line issues are independent derived facts, not one mutually exclusive persisted status:

| Derived fact | Condition | Customer consequence |
|---|---|---|
| Eligible | Product/Category Active; Inventory Normal; AvailableQuantity at least selected Quantity; displayed price version current | May proceed to final Place Order confirmation |
| PriceChanged | Stored comparison version differs from current Product price version | Show old/current price and current total; Place Order must explicitly submit the displayed current version |
| Unavailable | Product or Category is Inactive/missing | Preserve line; disable checkout; Customer removes it or waits for valid reactivation |
| InsufficientStock | Inventory Normal but AvailableQuantity is below selected Quantity | Preserve line; show authorized maximum; Customer reduces/removes it |
| InventoryReconciliation | InventoryHealth is not Normal | Preserve line; expose OutOfStock-safe message; block checkout until SL-005 resolves it |

More than one fact may apply simultaneously; the interface shall not hide one issue behind another.

## 14. State, Data, and Calculation Invariants

1. Product ID is the stable internal identity; canonical current SKU and immutable former-SKU history identify its commercial lineage.
2. A current or former SKU of one Product cannot identify any other Product.
3. Product has only `Inactive` and `Active` publication states in the current release; OutOfStock is derived availability, not another Product state.
4. Active Product always has complete metadata, one through five valid managed images, one Active Category, and exactly one Inventory.
5. Product contains no independently writable stock quantity; all sales availability comes from `SL-005` Inventory.
6. Product creation and zero-Inventory creation commit all or none.
7. Price is a positive integer VND and each change has a new auditable version; OrderDetail snapshot never changes.
8. Unit is immutable after the Product first appears in InventoryTransaction or OrderDetail.
9. Product and Category are never hard-deleted; status changes preserve references and audit.
10. Active Category deactivation is impossible while an Active Product references it.
11. Public Product requires both Product Active and Category Active.
12. `InStock = ProductActive AND CategoryActive AND InventoryHealth=Normal AND AvailableQuantity>0`; otherwise public sales availability is OutOfStock or the Product is not public according to publication state.
13. Public responses contain no raw SL-005 physical/reservation/damage/threshold/health dimensions.
14. Search comparison normalizes Unicode, case, and Vietnamese diacritics while retaining authored display values.
15. An unchanged paginated query has deterministic ordering and Product-ID tie-breaking.
16. Best-seller window begins at local 00:00 on date `requestVietnamDate - 29 calendar days` and ends at the request instant.
17. `BestSellerQuantity = sum(OrderDetail.Quantity)` and `BestSellerRevenue = sum(OrderDetail.Subtotal)` only for qualifying Delivered/Paid/non-Returned Orders; each Subtotal is the immutable line snapshot approved in `SL-003`, and current Product price is never used for historic revenue.
18. Exchange, resend, and replacement delivery contribute zero additional best-seller quantity/revenue.
19. At most one Active Cart exists per Customer; at most one CartItem exists per Cart/Product.
20. Cart read with no record creates no record; Cart creates no InventoryReservation or InventoryTransaction.
21. Cart selected quantity is a positive integer. At command time it cannot exceed current AvailableQuantity; later stock change may make the retained line insufficient.
22. `CurrentLineSubtotal = CurrentUnitPrice * SelectedQuantity`; `CurrentCartSubtotal = sum(CurrentLineSubtotal)`; current-release `ShippingFee = 0`.
23. A Cart command idempotency identity changes quantity/version at most once; stale expected version changes nothing.
24. Cart line presentation and issues use current Product/Category/Inventory facts, while comparison/audit values remain available to explain change.
25. No invalid Cart line is silently removed, no Cart read accepts price, and no checkout commits a price version the Customer did not submit from the reviewed display.
26. Successful checkout changes exactly one Active Cart to CheckedOut and creates exactly one atomic `SL-003` Order group; failure changes neither.

## 15. UI Contract

### Guest and Public Catalog

- Home Category cards come from current Active Category data and link to the corresponding filtered listing; decorative hard-coded names are not business Category data.
- Home shows up to ten approved best sellers. If none qualifies, the section visibly changes to `Sản phẩm mới`.
- Listing exposes keyword, Category, minimum/maximum price, and availability filters with loading, empty, invalid, and paging states.
- Product card/detail displays current name, Category, price, managed images, and `Còn hàng`/`Hết hàng`; it does not display raw `stockQuantity` or internal Inventory dimensions.
- OutOfStock disables Add to Cart. Guest is invited to authenticate rather than being given a guest Cart.

### Customer Cart

- Add/update/remove disables the relevant control while pending and carries an idempotency key; a retry or repeated click displays `đã xử lý/đã có trong giỏ` and the resulting quantity.
- Quantity control accepts integers only and shows the authorized maximum when a current owned line is insufficient.
- Every line can display current Product presentation plus separate messages for changed price, unavailable Product/Category, insufficient stock, and Inventory reconciliation.
- Changed price shows old and current values. Cart total always uses current price and Place Order text makes final current-price acceptance clear.
- Invalid lines remain visible with Update/Remove actions; checkout is disabled until blocking issues are corrected.
- Summary shows `Phí vận chuyển: 0 ₫`, not an unspecified “calculated later” fee.
- Stale concurrent action refreshes the current Cart and asks the Customer to retry intentionally; it never reports false success.

### Admin Product and Category

- Product form contains no stock input. New Product is saved as Inactive with a separate guarded Activate action.
- Product form requires canonical SKU, name, plain-text description, positive integer VND price, unit, Active Category, and one through five managed images.
- Media control is Admin-only and supports validated upload, preview, ordered first-featured image, reorder/remove, progress/error, and abandoned-upload cleanup feedback.
- Price, SKU correction, Category/publication change, and validation errors identify the safe action; SKU correction records a reason.
- Product list derives inventory availability from the authorized Inventory view rather than Product stock.
- Category screen supports create/update/activate/deactivate and displays blocking Active Products when deactivation is unsafe.

### Staff / CSKH and Warehouse

- Staff/CSKH has no Product/Category/media mutation or upload control.
- Warehouse uses Product identity in `SL-005` screens but receives no catalog-price/media/status mutation control.
- Forbidden direct endpoint calls remain denied even if UI controls are hidden.

## 16. Acceptance Examples

| AT ID | Given / When / Then evidence | Classification |
|---|---|---|
| AT-100 | Given complete valid Product metadata/media without stock input, when Admin creates it, then one Inactive Product and exactly one zero-dimension Inventory commit atomically with audit. | `approved-requirement` |
| AT-101 | Given stock input, duplicate SKU, invalid metadata/media/category, or injected Inventory/attachment failure, when Product creation runs, then it is rejected or fully rolled back with no partial Product, second stock authority, or orphan attachment. | `approved-requirement` |
| AT-102 | Given valid Inactive Product, zero availability, later deactivation, and later reactivation, when publication commands run, then guards control `Inactive/Active`, zero stock is public OutOfStock, existing history remains, and new Cart/reservation effects are blocked while Inactive. | `approved-requirement` |
| AT-103 | Given SKU correction with/without reason, former-SKU reuse, and unit change before/after first InventoryTransaction or OrderDetail, when Admin acts, then only the allowed attributable identity changes succeed and no Product is hard-deleted. | `approved-requirement` |
| AT-104 | Given an Admin price change and existing Order/Cart, when committed, then catalog/current Cart total use the new integer VND price/version, audit records old/new, Order snapshots stay unchanged, and stale final acceptance cannot charge silently. | `approved-requirement` |
| AT-105 | Given Admin, Staff, invalid files, arbitrary paths/URLs, temporary media, and Product/Order references, when upload/attach/remove/cleanup runs, then only valid Admin-owned managed media changes, abandoned files clean safely, and referenced files remain. | `approved-requirement` |
| AT-106 | Given Category names differing by whitespace/case and explicit valid states, when Admin creates/updates, then normalized duplicates are rejected, authored display survives, valid lifecycle changes are audited, and no hard delete occurs. | `approved-requirement` |
| AT-107 | Given an Active Category with Active Products, when deactivation is attempted, then it is blocked with prerequisites; after all Products are reassigned/deactivated it succeeds, and later Category reactivation does not activate Products. | `approved-requirement` |
| AT-108 | Given active/inactive Product and Category combinations, when Guest/Customer browses/list/detail/categories, then only Active+Active records and authorized active reviews appear; protected identities return not-found. | `approved-requirement` |
| AT-109 | Given Normal positive, Normal zero, and ReconciliationRequired Inventory, when public and owned-Cart responses are inspected, then public sees only InStock/OutOfStock, internal dimensions stay hidden, and correction-safe maximum appears only to the owning insufficient Cart. | `approved-requirement` |
| AT-110 | Given Vietnamese keyword variants with case/diacritic differences across name/SKU/description, when search runs, then normalized matching returns the same currently public set without changing display text. | `approved-requirement` |
| AT-111 | Given valid combined Category/price/availability filters, invalid negative/malformed/reversed ranges, and no-match input, when queried, then all valid filters combine correctly, invalid fields receive validation, and no-match returns a successful empty result. | `approved-requirement` |
| AT-112 | Given multiple pages with deterministic ties, when the unchanged query is paged repeatedly, then bounded server pagination returns stable order with no duplicate/omitted Product across page boundaries. | `approved-requirement` |
| AT-113 | Given Orders around the exact Vietnam-time window boundary with Delivered/Paid and disqualifying statuses, when best sellers calculate, then only qualifying OrderDetail snapshots contribute and ranking uses quantity, snapshot revenue, then SKU for at most ten public Products. | `approved-requirement` |
| AT-114 | Given a completed whole-Order return, Exchange/replacement, inactive former seller, and no qualifying sales, when ranking runs, then returned/inactive rows are excluded, Exchange adds zero sale, and empty ranking becomes explicitly labelled newest Products. | `approved-requirement` |
| AT-115 | Given Guest, two Customers, no Cart, and an existing Active/CheckedOut Cart, when Cart read/add occurs, then Guest/foreign access is denied, empty read persists nothing, first add creates one owned Active Cart, and a post-checkout add uses a new Active Cart. | `approved-requirement` |
| AT-116 | Given valid current Product and availability, when Customer adds, updates exact quantity, or removes, then one Product line changes as requested, current Cart version increments, and no reservation/Inventory movement exists. | `approved-requirement` |
| AT-117 | Given the same Product added intentionally with distinct keys and one key retried/repeated, when commands run, then distinct commands increment one line while the repeated key returns one existing outcome and visible already-processed feedback. | `approved-requirement` |
| AT-118 | Given zero, negative, fractional, malformed, or currently excessive quantity, when add/update runs, then it is rejected, prior Cart remains, and the owner receives the safe current maximum where applicable. | `approved-requirement` |
| AT-119 | Given concurrent first-add, same-line, update/remove, or stale expected-version commands, when they race, then one Active Cart/one Product line and monotonic version remain, no lost update occurs, and stale callers receive current state. | `approved-requirement` |
| AT-120 | Given Product name/image/price changes after add, when Cart is read, then current presentation/current-price subtotal/Cart total appear, old/current price difference is explainable, and the read creates no write, reservation, deletion, or acceptance. | `approved-requirement` |
| AT-121 | Given Product or Category becomes Inactive and may later reactivate, when Cart is read, then the line remains Unavailable and blocks checkout while invalid, then becomes eligible again only after all current guards pass; it is never silently removed. | `approved-requirement` |
| AT-122 | Given availability falls below quantity or Inventory enters ReconciliationRequired after add, when Cart/checkout is evaluated, then the line remains with InsufficientStock/InventoryReconciliation, checkout is blocked, and no reservation is created. | `approved-requirement` |
| AT-123 | Given displayed current price version and an Admin price change before/after Customer selects Place Order, when checkout runs, then exact displayed current version may commit, a later version rejects with line feedback, and no silent higher/lower charge or partial Order exists. | `approved-requirement` |
| AT-124 | Given valid checkout, duplicate retry, stale Cart, invalid line, insufficient stock, or injected grouped-write failure, when Place Order runs, then success creates exactly one SL-003 Order/details/reservations/payment outcome and CheckedOut Cart with ShippingFee zero; duplicate returns it and every failure leaves the Active Cart with no partial business effect. | `approved-requirement` |

## 17. Preliminary G3 Traceability

| Decision | Requirements | Use case/interface | Implementation evidence | Acceptance | Confirmed gap | Status |
|---|---|---|---|---|---|---|
| BD-063 | BR-059 | UC-PRD-01; Admin Product form/API; public Product reads | `server/src/models/product.model.js`; `server/src/services/product.service.js`; `server/src/models/inventory.model.js`; `client/src/pages/admin/ProductManagementPage.jsx` | AT-100 through AT-102 | Product defaults Active, accepts/writes Product stock, and is not atomically created with exactly one zero Inventory | ready |
| BD-064 | BR-060 | UC-PRD-01 identity correction/audit | Product model/service/tests; OrderDetail and InventoryTransaction references | AT-103 | SKU is optional; no former-SKU non-reuse/history or unit immutability guard exists | ready |
| BD-065 | BR-061 | Product price update; Cart read; UC-HND-01 | `product.service.js`; `cartItem.model.js`; `cart.service.js`; `order.service.js`; Product/Cart/checkout UI | AT-104, AT-120, AT-123 | No price version/history; Cart stores stale unitPrice and checkout silently snapshots whatever Product price is current | ready |
| BD-066 | BR-062 | Admin media upload/attach/reorder/remove | `server/src/routes/upload.routes.js`; upload middleware/service; productMedia service; `ProductMediaManager.jsx` | AT-105 | Upload authorizes Staff; Product accepts arbitrary imageUrls; no owner-bound temporary/expiry lifecycle exists | ready |
| BD-067 | BR-063 | UC-CTG-01; Admin/public Category API/UI | `category.model.js`; `category.service.js`; `category.routes.js`; `CategoryManagementPage.jsx` | AT-106, AT-107 | Update/deactivation lacks active-Product guard and complete normalized uniqueness validation; UI only exposes create/list | ready |
| BD-068 | BR-064 | UC-PUB-01 list/detail/category; owned Cart issue response | `product.service.js`; `ProductDetailPage.jsx`; public Product cards/pages; Inventory service | AT-108, AT-109 | Public DTO/UI exposes Product.stockQuantity and does not derive availability/health from SL-005 Inventory | ready |
| BD-069 | BR-065 | Public Product list/search/filter API and `ProductFilter.jsx` | `product.service.js`; product controller/service; `ProductListingPage.jsx`; `ProductFilter.jsx` | AT-110 through AT-112 | Service loads all Products and filters in memory, ignores availability/limit/pagination, and does only lower-case substring matching | ready |
| BD-070 | BR-066 | Home best-seller query/section | `HomePage.jsx`; `homeProductDisplay.js`; Product/Order/OrderDetail services/models | AT-113, AT-114 | Home requests newest Products, server ignores limit, client slices six, and no paid-delivered/return-aware ranking exists | ready |
| BD-071 | BR-067 | UC-CART-01 read/first add/post-checkout | Cart/CartItem models; cart service/routes; `CartPage.jsx` | AT-115, AT-116 | GET creates an empty Cart; current no-reservation behavior is correct but reads/lifecycle are not the approved contract | ready |
| BD-072 | BR-068 | Cart add/update/remove APIs and controls | `cart.service.js`; cart routes/controller/tests; `ProductCard.jsx`; `ProductDetailPage.jsx`; `CartPage.jsx` | AT-116 through AT-119 | No command idempotency or Cart version; same-line/concurrent writes can race; pending feedback is incomplete | ready |
| BD-073 | BR-069 | UC-CART-01 read/reconciliation UI | `cartItem.model.js`; `cart.service.js`; `CartPage.jsx`; Product/Category/Inventory services | AT-120 through AT-122 | Cart read trusts stored name/unitPrice, never joins live Product/Category/Inventory, and exposes no stale issue flags | ready |
| BD-074 | BR-070 | UC-HND-01; checkout API/UI | `server/src/services/order.service.js`; order routes/controller; Checkout page; approved SL-003 implementation points | AT-123, AT-124 | Checkout prechecks Product.stockQuantity, has no Cart/price-version acceptance, and Cart UI says delivery fee is calculated later despite approved zero fee | ready |

## 18. Confirmed Current Conflicts

The following are `observed-behavior`, not approved policy:

1. `product.model.js` persists `stockQuantity`, defaults Product to Active, allows price zero at schema level, and treats SKU as optional.
2. `product.service.js` accepts Product stock on create/update and returns it publicly, conflicting with the approved single Inventory authority.
3. Product creation is not a Product-plus-zero-Inventory atomic operation.
4. Product has no price version, former-SKU history/non-reuse, or unit immutability guard.
5. Product media upload/delete routes authorize both Admin and Staff, while Product service accepts arbitrary image URL arrays outside a complete managed-ownership lifecycle.
6. Upload validation limits type/count/size and checks content, but temporary upload ownership/expiry and durable orphan cleanup are not modeled.
7. Category create performs one duplicate-name check, while update/status lacks full normalized uniqueness and active-Product deactivation guards.
8. Admin Category UI can create/list but has no complete edit/activate/deactivate workflow.
9. Public Product service loads every Product, filters/sorts in memory, ignores requested limit/pagination and availability, and lacks Vietnamese diacritic normalization.
10. Home uses hard-coded decorative Categories that all link to the unfiltered listing rather than current Active Category records.
11. Home requests recent Product data and slices the first six; no thirty-day Delivered/Paid/Returned-aware top-ten calculation exists.
12. Public Product detail displays exact `product.stockQuantity` and leaves Customer add action visible without the approved derived availability contract.
13. CartItem stores `productName` and `unitPrice`; Cart read calculates totals from those stale fields without joining live Product, Category, price version, or Inventory.
14. Cart add/update validates against `Product.stockQuantity`, not `SL-005` AvailableQuantity/InventoryHealth.
15. Cart GET creates an Active Cart as a read side effect; Cart commands have no idempotency identity or expected version.
16. Current same-Product add increments one line, but no concurrency contract prevents duplicate/lost effects and tests encode Product-stock validation.
17. Cart UI sends quantity update from each raw change, has no stale-line issue model, and keeps checkout enabled whenever items exist.
18. Cart UI says shipping is calculated at checkout, conflicting with approved `ShippingFee = 0`.
19. Checkout snapshots current Product price without an explicit displayed price version and prechecks Product stock before Inventory reservation.
20. Existing Product/Cart/Home/Category tests prove current behavior but do not cover AT-100 through AT-124.

## 19. Cross-Slice Consistency Boundaries

1. `SL-005` Inventory is the only quantity authority. `SL-006` may derive availability and validate Cart quantity but may not create reservation or quantity movement.
2. `SL-003` remains the owner of Order/Payment creation and reservation. `SL-006` owns only the current, explicitly accepted Cart handoff and cannot create a parallel checkout state machine.
3. `SL-003` approved `ShippingFee = 0`, immutable OrderDetail snapshots, atomic/idempotent checkout, and accepted current price remain unchanged.
4. `SL-001` whole-Order `Returned` completion removes that Order from current best-seller qualification. A pending/rejected/expired request does not rewrite the delivered sale fact.
5. `SL-002` Exchange and replacement fulfillment preserve same-SKU service lineage and contribute no new commercial sale to best-seller quantity/revenue.
6. Product deactivation does not cancel or rewrite existing reservations, Orders, Shipments, Exchange, Return/Refund, Inventory, or media snapshots; each downstream slice continues under its own approved state machine.
7. Category deactivation is guarded before publication changes so an Active Product cannot silently disappear through an invalid relationship.
8. Product-review submission/moderation must later preserve this slice's public rule that only authorized active reviews appear; SL-006 does not approve review mutation.
9. Account/RBAC work may strengthen authentication/session policy but shall retain the actor boundaries here: Customer owns only own Cart; Staff/CSKH cannot mutate catalog/media; Warehouse cannot mutate commercial metadata; Admin cannot mutate stock.

## 20. Method Basis and Next Phase

Archived SWR Chapter 17 requires requirements to be complete, feasible, verifiable, necessary, sufficient, and consistent before design/construction. Archived SWD Chapters 9–11 model state-dependent behavior through current state, event, guard, action, and next state. GreenHouse business policy in this document comes only from SRC-036 and approved cross-slice decisions, not from the method archives, candidate SRS, passing tests, or current code.

No implementation plan, migration, Google SRS mutation, or code change is authorized by this document alone. The project will continue with the next bounded core business package, then run one cross-system consistency audit before freezing the Google SRS baseline and beginning acceptance-test-first implementation.
