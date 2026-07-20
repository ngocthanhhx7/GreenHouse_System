# Lê Vũ Cường - Warehouse, After-Sale, Notification, Admin Reports Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Lê Vũ Cường |
| Role in team | Warehouse/admin closure owner |
| Main responsibility | Inventory, Stock Export, Replenishment, Support, Review, Notification, Reports, Settings |
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
- Notification/Email wrapper.
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
| `client/src/services/notificationService.js` | Notification APIs |
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
| Notification | userId, type, channel, subject, content, deliveryStatus, isRead, sentAt |
| SystemSetting | key, value, valueType, description, updatedBy |

### Routes/Controllers/Services

| Layer | File suggestion | Responsibility |
|---|---|---|
| Route | `server/src/routes/inventory.routes.js` | Warehouse inventory APIs |
| Route | `server/src/routes/stockExport.routes.js` | Warehouse stock export APIs |
| Route | `server/src/routes/replenishment.routes.js` | Replenishment APIs |
| Route | `server/src/routes/support.routes.js` | Support APIs |
| Route | `server/src/routes/review.routes.js` | Review APIs |
| Route | `server/src/routes/notification.routes.js` | Notification APIs |
| Route | `server/src/routes/report.routes.js` | Admin report APIs |
| Route | `server/src/routes/systemSetting.routes.js` | Setting APIs |
| Service | `server/src/services/inventory.service.js` | Non-negative stock and transaction rules |
| Service | `server/src/services/notification.service.js` | Create/send notification records |
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
| GET | `/api/notifications` | User | filters | Notifications | Unauthorized |
| PATCH | `/api/notifications/:id/read` | User | id | Updated notification | Forbidden |
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
| Notification | userId, deliveryStatus, isRead | User sees own notifications only |
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

### Phase 4 - Notification Support

- [ ] Create Notification model.
- [ ] Implement notification service wrapper.
- [ ] Add helper for order/payment/refund emails.
- [ ] Build notification list/read UI.

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

- [ ] Create SupportRequest model/APIs/UI.
- [ ] Create ProductReview model/APIs/UI.
- [ ] Enforce purchased delivered review rule.
- [ ] Integrate review display into Product Detail.

### Phase 8 - Admin Closure

- [ ] Create SystemSetting model/APIs/UI.
- [ ] Implement report APIs for revenue/order/product/inventory.
- [ ] Build Admin Reports screen.
- [ ] Ensure warehouse/support/review/settings actions create audit logs.

## 13. Git Branch/PR Suggestion

| PR | Branch | Content |
|---|---|---|
| PR 1 | `feature/cuong-notification-service` | Notification model/service/UI |
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
- [ ] Notification complete.
- [ ] Admin reports/settings complete.
- [ ] Manual demo tested.

## Ownership Addendum 2026-07-20

Cường giữ Warehouse/Reports/Settings và bổ sung integration boundary:

- Phát domain event cho low-stock, replenishment, stock export và report anomaly theo payload thống nhất.
- Gọi Notification service/contract của Thành; không tạo Notification model, unread rule hoặc bell riêng.
- Kiểm thử event từ Warehouse/Reports đến notification dropdown bằng integration test.
- Không sửa AccountLayout, Profile, Avatar, Address Book hay Checkout address selector.
