# Lê Vũ Cường - Warehouse, After-Sale, Admin Reports Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Lê Vũ Cường |
| Role in team | Warehouse/admin closure owner |
| Main responsibility | Inventory, Stock Export, Replenishment, Support, Review, Reports, Settings; phát domain event theo Notification contract của Huy |
| Git branch | `feature/cuong-warehouse-admin-after-sale` |
| Priority | Must Have + Should Have |

## 2. Business Objective

Hoàn thiện phần vận hành kho và các nghiệp vụ sau bán hàng để hệ thống không dừng ở việc tạo order. Phần này giúp mentor thấy hệ thống có kiểm soát tồn kho, xuất kho, low-stock, replenishment, support/review, notification và report/admin closure.

## 3. Module Ownership

- Warehouse Inventory Management.
- Inventory Transaction.
- Stock Export processing from Warehouse side.
- Low-stock alert.
- Replenishment request and receive stock.
- Support/Complaint Management.
- Product Review.
- Phát warehouse/admin domain event idempotent theo Notification contract của Huy.
- Admin Reports.
- System Settings.

## 4. Important Flows Owned

| Flow | Trigger | Expected result |
|---|---|---|
| Warehouse export stock | Staff creates export request | Warehouse approves/exports, inventory reduced, transaction created |
| Warehouse adjust stock | Warehouse corrects quantity | Inventory updated, transaction logged |
| Low-stock replenishment | Stock below threshold | Replenishment request created and Admin approves/rejects |
| Customer support | Customer submits complaint | Staff can respond/resolve |
| Product review | Delivered customer reviews product | Review appears on Product Detail |
| Admin reports/settings | Admin opens dashboard | Reports/settings shown and configurable |

## 5. Frontend Scope

### Pages

| Page | Path suggestion | Purpose |
|---|---|---|
| Inventory List | `client/src/pages/warehouse/InventoryListPage.jsx` | View stock records |
| Inventory Detail | `client/src/pages/warehouse/InventoryDetailPage.jsx` | Adjust/update stock |
| Low Stock Page | `client/src/pages/warehouse/LowStockPage.jsx` | View low-stock alerts |
| Stock Export Queue | `client/src/pages/warehouse/StockExportQueuePage.jsx` | Process export requests |
| Stock Export Detail | `client/src/pages/warehouse/StockExportDetailPage.jsx` | Approve/reject/export |
| Replenishment Page | `client/src/pages/warehouse/ReplenishmentPage.jsx` | Create/track replenishment |
| Support Request Pages | `client/src/pages/customer/SupportPage.jsx`, `client/src/pages/staff/SupportQueuePage.jsx` | Customer support + staff response |
| Review Form/Display | Product detail integration | Create/display product reviews |
| Admin Reports | `client/src/pages/admin/ReportsPage.jsx` | View system statistics |
| System Settings | `client/src/pages/admin/SystemSettingsPage.jsx` | Configure return period/threshold |

### Components

| Component | Purpose |
|---|---|
| InventoryTable | Show product stock |
| StockAdjustmentForm | Update/adjust stock with reason |
| InventoryTransactionTable | Trace stock movements |
| LowStockBadge | Show low-stock status |
| StockExportActionPanel | Approve/reject/export request |
| ReplenishmentForm | Create request |
| SupportRequestForm | Customer complaint |
| SupportResponseForm | Staff response |
| ReviewForm | Rating/content |
| ReportCards | Revenue/order/product/inventory KPIs |

### Services

| File | Purpose |
|---|---|
| `client/src/services/inventoryService.js` | Inventory APIs |
| `client/src/services/stockExportService.js` | Stock export APIs |
| `client/src/services/replenishmentService.js` | Replenishment APIs |
| `client/src/services/supportService.js` | Support APIs |
| `client/src/services/reviewService.js` | Review APIs |
| `client/src/services/reportService.js` | Admin report APIs |
| `client/src/services/systemSettingService.js` | System setting APIs |

## 6. Backend Scope

### Models

| Model | Fields |
|---|---|
| Inventory | productId, stockQuantity, reservedQuantity, damagedQuantity, lowStockThreshold, lastUpdatedBy |
| InventoryTransaction | productId, orderId, performedBy, transactionType, quantity, beforeQuantity, afterQuantity, reason |
| StockExportRequest | orderId, requestedBy, processedBy, status, note, exportedAt |
| ReplenishmentRequest | productId, requestedBy, approvedBy, quantity, status, reason, receivedAt |
| SupportRequest | customerId, orderId, subject, content, status, handledBy, response |
| ProductReview | productId, customerId, orderId, rating, content, status |
| SystemSetting | key, value, valueType, description, updatedBy |

### Routes/Controllers/Services

| Layer | File suggestion | Responsibility |
|---|---|---|
| Route | `server/src/routes/inventory.routes.js` | Warehouse inventory APIs |
| Route | `server/src/routes/stockExport.routes.js` | Warehouse stock export APIs |
| Route | `server/src/routes/replenishment.routes.js` | Replenishment APIs |
| Route | `server/src/routes/support.routes.js` | Support APIs |
| Route | `server/src/routes/review.routes.js` | Review APIs |
| Route | `server/src/routes/report.routes.js` | Admin report APIs |
| Route | `server/src/routes/systemSetting.routes.js` | Setting APIs |
| Service | `server/src/services/inventory.service.js` | Non-negative stock and transaction rules |
| Service | `server/src/services/report.service.js` | Aggregate report queries |

## 7. API Scope

| Method | Endpoint | Permission | Request/query | Response | Error cases |
|---|---|---|---|---|---|
| GET | `/api/warehouse/inventory` | Warehouse | filters | Inventory list | Forbidden |
| GET | `/api/warehouse/inventory/:id` | Warehouse | id | Inventory detail | Not found |
| PATCH | `/api/warehouse/inventory/:id` | Warehouse | stockQuantity, threshold | Updated inventory | Negative stock |
| POST | `/api/warehouse/inventory/:id/adjust` | Warehouse | delta, reason | Updated inventory + transaction | Missing reason/negative result |
| GET | `/api/warehouse/inventory-transactions` | Warehouse/Admin | filters | Transaction list | Invalid filter |
| GET | `/api/warehouse/stock-exports` | Warehouse | status | Export requests | Forbidden |
| PATCH | `/api/warehouse/stock-exports/:id/status` | Warehouse | status, note | Updated request | Invalid transition/insufficient stock |
| POST | `/api/warehouse/replenishments` | Warehouse | productId, quantity, reason | Request | Invalid quantity |
| GET | `/api/admin/replenishments` | Admin | status | Requests | Forbidden |
| PATCH | `/api/admin/replenishments/:id/status` | Admin | status, note | Updated request | Invalid status |
| POST | `/api/warehouse/replenishments/:id/receive` | Warehouse | receivedQty | Inventory updated | Not approved |
| POST | `/api/support-requests` | Customer | subject, content, orderId optional | Support request | Empty content |
| GET | `/api/support-requests/my` | Customer | status | Own requests | Unauthorized |
| GET | `/api/staff/support-requests` | Staff | status | Support queue | Forbidden |
| PATCH | `/api/staff/support-requests/:id` | Staff | status, response | Updated support request | Invalid transition |
| POST | `/api/products/:id/reviews` | Customer | rating, content, orderId | Review | Not purchased/not delivered |
| GET | `/api/products/:id/reviews` | Public | page | Reviews | Product not found |
| GET | `/api/admin/reports/revenue` | Admin | date range | Revenue report | Invalid range |
| GET | `/api/admin/reports/orders` | Admin | date range | Order report | Invalid range |
| GET | `/api/admin/reports/products` | Admin | date range | Product report | Invalid range |
| GET | `/api/admin/reports/inventory` | Admin | date range | Inventory report | Invalid range |
| GET/PATCH | `/api/admin/system-settings` | Admin | key/value | Settings | Invalid type/range |

## 8. Database/Model Scope

| Collection | Required indexes | Business constraints |
|---|---|---|
| Inventory | productId unique | stockQuantity/reserved/damaged cannot be negative |
| InventoryTransaction | productId, orderId, createdAt | Append-only |
| StockExportRequest | orderId, status | One open export request per order |
| ReplenishmentRequest | productId, status | Receive only after Admin approval |
| SupportRequest | customerId, status | Customer sees own requests only |
| ProductReview | productId, customerId, orderId | Review only purchased delivered product |
| SystemSetting | key unique | Validate by valueType |

## 9. UI Screens/Components

| Screen | Main data | Main actions |
|---|---|---|
| Inventory List | Product, stock, threshold | View/detail/adjust |
| Inventory Detail | Before/after stock, transaction history | Update threshold, adjust stock |
| Low Stock | Products below threshold | Create replenishment |
| Stock Export Queue | Requests from Staff | Approve/reject/export |
| Replenishment | Requests and status | Create/receive |
| Support | Customer request/staff response | Submit/respond/resolve |
| Review | Rating/content | Submit/display |
| Admin Reports | KPIs and tables | Filter date |
| System Settings | Return period, low-stock default | Update settings |

## 10. Validation And Error Cases

| Case | Expected handling |
|---|---|
| Stock result negative | Reject with `400` |
| Adjustment missing reason | Reject |
| Export stock insufficient | Reject/export cannot proceed |
| Replenishment receive before approval | Reject |
| Customer support with empty content | Reject |
| Customer review product not purchased | Reject |
| Customer review order not Delivered | Reject |
| Admin report invalid date range | Reject |
| Setting wrong value type | Reject |

## 11. Integration Dependencies

| Dependency | Owner |
|---|---|
| Warehouse/Admin/Staff/Customer auth guard | Nguyễn Ngọc Thành |
| Product model and product data | Phạm Thành Chung |
| Order/payment data | Nguyễn Quang Huy |
| Staff stock export request | Nguyễn Hữu Anh Nhật |
| Audit helper | Nguyễn Ngọc Thành |

## 12. Phase-by-Phase Task List

### Phase 4 - Notification Event Integration

- [ ] Emit idempotent warehouse/admin domain events to Notification contract của Huy.
- [ ] Verify notification failure does not roll back warehouse/admin operations.

### Phase 6 - Warehouse Main Delivery

- [ ] Create Inventory model.
- [ ] Create InventoryTransaction model.
- [ ] Implement inventory list/detail/update/adjust APIs.
- [ ] Implement stock export queue/detail APIs.
- [ ] Implement approve/reject/export stock logic.
- [ ] Build warehouse inventory/export UI.
- [ ] Implement low-stock alert.
- [ ] Implement replenishment request/approval/receive flow.

### Phase 7 - After-Sale Delivery

- [x] Create SupportRequest model/APIs/UI.
- [x] Create ProductReview model/APIs/UI.
- [x] Enforce purchased delivered review rule.
- [x] Integrate review display into Product Detail.

### Phase 8 - Admin Closure

- [ ] Create SystemSetting model/APIs/UI.
- [ ] Implement report APIs for revenue/order/product/inventory.
- [ ] Build Admin Reports screen.
- [ ] Ensure warehouse/support/review/settings actions create audit logs.

## 13. Git Branch/PR Suggestion

| PR | Branch | Content |
|---|---|---|
| PR 1 | `feature/cuong-notification-events` | Warehouse/admin event emission theo Notification contract của Huy |
| PR 2 | `feature/cuong-inventory-stock-export` | Inventory, transaction, stock export |
| PR 3 | `feature/cuong-replenishment-low-stock` | Low-stock and replenishment |
| PR 4 | `feature/cuong-support-review` | Support and product review |
| PR 5 | `feature/cuong-admin-reports-settings` | Reports and system settings |

## 14. Testing Checklist

- [ ] Warehouse can view inventory.
- [ ] Warehouse can adjust stock with reason.
- [ ] Negative stock is rejected.
- [ ] Inventory adjustment creates transaction.
- [ ] Warehouse can approve/export stock request.
- [ ] Export reduces stock and creates transaction.
- [ ] Low-stock product appears in alert page.
- [ ] Warehouse can create replenishment request.
- [ ] Admin can approve/reject replenishment.
- [ ] Approved replenishment can be received into stock.
- [ ] Customer can submit support request.
- [ ] Staff can respond/resolve support request.
- [ ] Customer can review delivered purchased product.
- [ ] Customer cannot review non-purchased product.
- [ ] Admin can view reports.
- [ ] Admin can update valid system settings.

## 15. Demo Script For Mentor

1. Login as Warehouse Manager.
2. Open Inventory List and adjust a product stock.
3. Show Inventory Transaction created.
4. Open Stock Export Queue and approve/export a Staff request.
5. Show stock reduced and transaction recorded.
6. Show Low Stock page and create replenishment request.
7. Login as Admin and approve replenishment.
8. Receive replenishment as Warehouse and show stock increased.
9. Login as Customer and submit support request/review.
10. Login as Staff and respond to support.
11. Login as Admin and show reports/settings.

## 16. Risk And Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Inventory goes negative | Critical business error | Central non-negative validation in service |
| Transaction not created | No traceability | Only update stock through inventory service |
| Export before Staff confirm | Invalid warehouse operation | Check order/export request status |
| Review eligibility too loose | Fake reviews | Verify delivered order detail includes product |
| Reports too complex | Sprint delay | Implement basic KPI/table first |
| Notification failure blocks order | Bad UX | Log Failed but do not rollback core action |

## 17. Final Checklist

- [ ] Inventory complete.
- [ ] Inventory transaction complete.
- [ ] Stock export complete.
- [ ] Low-stock/replenishment complete.
- [ ] Support complete.
- [ ] Review complete.
- [ ] Notification domain events integrated with Huy contract.
- [ ] Admin reports/settings complete.
- [ ] Manual demo tested.

## Ownership Addendum 2026-07-20

Cường giữ Warehouse/Reports/Settings và bổ sung integration boundary:

- Phát domain event cho low-stock, replenishment, stock export và report anomaly theo payload thống nhất.
- Gọi Notification service/contract của Thành; không tạo Notification model, unread rule hoặc bell riêng.
- Kiểm thử event từ Warehouse/Reports đến notification dropdown bằng integration test.
- Không sửa AccountLayout, Profile, Avatar, Address Book hay Checkout address selector.

## Ownership Addendum 2026-07-23 - Notification Domain Transfer

Addendum này chỉ supersede ongoing Notification integration ownership kể từ ngày 2026-07-23; addendum 2026-07-20 phía trên vẫn là lịch sử baseline.

- Cường tiếp tục sở hữu Warehouse/Reports/Settings và phát domain event idempotent cho low-stock, replenishment, stock export và report anomaly.
- Các event của Cường được gửi theo Notification contract do Nguyễn Quang Huy sở hữu; Cường không sở hữu Notification model/service/API, retry status, unread/read/delete hoặc in-app bell.
- EmailOutbox/Gmail email delivery vẫn thuộc Nguyễn Ngọc Thành, không chuyển cho Cường hoặc Huy.

## Ownership Addendum 2026-07-23 - SL-005 Implementation Evidence

This addendum records the tracked Definition-of-Done evidence for SL-005. The normative baseline remains `docs/superpowers/specs/2026-07-22-sl-005-inventory-damage-replenishment-design.md`. Detailed local-only records are `docs/superpowers/reconciliation/SL-005_HANDOFF.md` and `docs/superpowers/reconciliation/SL-005_G3_TRACEABILITY.md`; repository policy ignores `docs/superpowers/`, so this section is the tracked closure artifact.

### Scope and ownership

- Le Vu Cuong owns the SL-005 Warehouse Inventory, damage custody, low-stock, replenishment, receipt, and migration implementation.
- Staff may report and withdraw an own pending damage report. WarehouseManager owns physical count, damage decision/disposition, threshold override, replenishment request/receipt/correction, and short-closure initiation. Admin owns exact request approval/rejection, global threshold policy, and short-closure decision.
- Supplier remains external and has no GreenHouse account. Purchasing, contract, supplier payment, and accounts payable are out of scope.
- Inventory is the only quantity authority. Product input cannot set stock; persistent Product creation creates exactly one zero-dimension Inventory in the same transaction.

### Acceptance and implementation traceability

| Acceptance | Delivered evidence |
|---|---|
| AT-075-077 | Product stock-input rejection and atomic zero Inventory initialization; four dimensions, OnHand/Available calculations, and reconciliation health in product/inventory service tests and `sl005.acceptance.test.js` |
| AT-078-082 | Staff evidence-backed quarantine/idempotency/withdrawal; Warehouse full, partial, zero decisions and confirmed-damage disposition in damage model/service/routes plus acceptance/client-service tests |
| AT-083-086 | Evidence-backed counted Sellable, server-derived delta and before/after transaction, duplicate handling, shortage reconciliation and recovery in inventory service/API/UI tests |
| AT-087-088 | Global-default/Product-override threshold behavior and one-open-alert index in inventory acceptance and `lowStockAlert.model.test.js` |
| AT-089-093 | Immutable one-Product request, active-request uniqueness, withdrawal, exact Admin decision and no approval stock effect in replenishment service/model/API tests |
| AT-094-098 | Append-only partial/final receipts, accepted/rejected arithmetic, at-most-once stock effect, short closure, and compensating correction in acceptance, replenishment, and receipt-model tests |
| AT-099 | Actor authorization routes, evidence attribution, idempotent commands, grouped repository behavior, migration/index tests, and full regressions |

### Local Definition of Done

- [x] BR-047 through BR-058 implemented and mapped to AT-075 through AT-099.
- [x] Server acceptance tests were introduced red for the intended missing behavior before the implementation turned them green.
- [x] Server regression after SL-003 rebase and independent review remediation: `588/588` tests passed across `102` suites.
- [x] Client regression after SL-003 rebase: `175/175` tests passed across `51` suites.
- [x] Client production build passed; only the existing Vite large-chunk warning remains.
- [x] SL-005 migration is available as `npm run migrate:sl005`, has a timestamp-preserving repeat-safety test, and passed a disposable `rs0` verification twice with zero business writes on the second run.
- [x] Detailed handoff and G3 traceability are recorded locally under `docs/superpowers/reconciliation/`.
- [x] No SL-003 or SL-007 implementation file is included in this delivery.
- [ ] Deployment owner must run and record `npm run migrate:sl005` on the target database.
- [x] SL-003 reservation/cancellation lineage was regression-tested after rebase while consuming the SL-005 availability/alert hooks.
- [ ] SL-004 fulfillment/export must continue to consume `ReconciliationRequired` and zero availability.
- [ ] SL-001/SL-002 return/exchange owners must consume the four-dimension Inventory vocabulary at their integration seams.

This evidence establishes local implementation closure only. It does not claim a production migration, deployment, live Supplier integration, production notification delivery, or a completed browser actor walkthrough.

### Verification refresh 2026-07-24

- Targeted cross-slice regression: `99/99` server tests and `4/4` client tests passed after resolving the SL-003/SL-005 reservation-lineage seam.
- Full regression: server `588/588`, client `175/175`; production build passed with only the existing large-chunk warning.
- Disposable MongoDB replica-set migration:
  - first run: Inventory `1`, damage report `1`, quarantine movement `1`, replenishment `3`, index groups `6`;
  - second run: Inventory `0`, damage report `0`, quarantine movement `0`, replenishment `0`;
  - physical custody ended at Sellable `6`, Reserved `8`, Quarantined `4`, `ReconciliationRequired`, with exactly one linked movement;
  - legacy replenishment states became `PendingApproval`, `PartiallyReceived`, and `Completed`;
  - duplicate active replenishments were rejected before mutation with an actionable preflight error.
- Detailed tracked evidence is in `docs/reviews/SL-005_RELEASE_AUDIT.md`, `docs/reviews/SL-005_G3_TRACEABILITY.md`, and `docs/reviews/SL-005_HANDOFF.md`.

## Seam Addendum 2026-07-24 - SL-004 Warehouse Evidence

Lê Vũ Cường remains the Warehouse seam owner consumed by Nguyễn Hữu Anh Nhật's
primary SL-004 fulfillment implementation.

- Warehouse runs one exact export command; it does not approve/reject a
  commercial decision and never auto-packs the Order.
- Export consumes complete SL-003 reservation lineage, blocks
  `ReconciliationRequired`, posts one stable movement per line, and leaves the
  Order Confirmed for Staff packing.
- Warehouse has a returned-parcel queue and one exact, evidence-backed receipt
  that classifies every physical line into sellable/damaged Inventory effects.
- Warehouse has no delivery/COD/payment/refund/destination authority and sees no
  bank/payout controls.
- The SL-005 Inventory authority and four-dimension vocabulary remain intact.

Seam evidence is included in focused server `72/72`, focused client `17/17`,
full server `747/747`, full client `190/190`, and `npm run build` PASS.
Migration contract evidence is `6/6`; disposable replica-set double runs
verified the legacy export's attached Initial cycle, zero business writes on
run two, and preservation of a post-migration Resend request. No target
database was mutated.

Remaining work is deployment-only evidence: target backup/preflight/migration,
zero-write second run, authenticated Warehouse walkthrough, signed-Carrier
target verification, and DomainOutbox worker verification. No production claim
is made by this addendum.

## Implementation Addendum 2026-07-25 - SL-008 Review and Support

Le Vu Cuong owns the completed local SL-008 Product Review and Customer Support
implementation on `feature/cuong-support-review`.

- Review now uses one Customer+Product identity, delivered owned evidence,
  independent publication/moderation state, immutable histories, safe public
  aggregate paging and durable retry/version semantics.
- Support now implements seven reference types, immutable chronological
  messages, first claim, current-active-assignee operations, disabled-assignee
  recovery, Customer withdraw and the exact 72-hour reopen window.
- Customer and Staff UI use authorized selectors, safe paged projections,
  role/state-specific controls, pending deduplication and typed field errors.
- `npm run migrate:sl008` coordinates Review and Support preflight, dry-run,
  locked indexes and repeat-safe apply without inventing ambiguous history.
- Focused SL-008 server tests pass `129/129`; full server passes `909/909`;
  full client passes `248/248`; the production client build passes.
- Final remediation also closes stale-conflict privacy, production SL-007
  disable-to-Support recovery in one Mongo transaction, production Role lookup,
  same-key race replay, transactional fail-closed migration, exact history/state
  proof, bounded ticket/message paging, collision-safe repeated recovery outbox
  identity, and runtime-reopen resolver/assignee attribution.
- Detailed tracked evidence is in `docs/reviews/SL-008_G3_TRACEABILITY.md`,
  `docs/reviews/SL-008_HANDOFF.md`, and `docs/reviews/SL-008_RELEASE_AUDIT.md`.

Nguyen Quang Huy owns downstream Notification consumption. Nguyen Ngoc Thanh
retains final review/integration and EmailOutbox/Gmail ownership. Target backup,
migration execution, zero-write second run and authenticated browser walkthrough
remain deployment-owner actions.

## Implementation Addendum 2026-07-25 - SL-009 Reports and Settings

Lê Vũ Cường hoàn tất Admin Reports và System Settings của SL-009. Reports dùng
Asia/Ho_Chi_Minh, event-time measures, immutable Gross/Refund/Net facts và tách
current snapshot. Settings chỉ cho phép `PAYMENT_TIMEOUT_MINUTES` và
`LOW_STOCK_DEFAULT_THRESHOLD`, dùng version/CAS/idempotency/reason và commit
Audit + reevaluation outbox atomically. `RETURN_WINDOW_DAYS` không còn là
setting hợp lệ; Product threshold override của Warehouse vẫn thắng global
default.

## UX Relocation Evidence 2026-07-25 - Customer Reviews

- Product Detail now renders public Review content only; Customer Review
  mutations are no longer hosted there.
- The protected `/reviews` purchase center separates pending and completed
  per-product Reviews derived from delivered purchases.
- The focused Review client set passed `54/54`; the production client build
  exited `0` with the existing Vite chunk-size warning.
- This focused relocation verification does not claim a new full regression.
