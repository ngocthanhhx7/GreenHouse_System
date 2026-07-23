# Nguyễn Hữu Anh Nhật - Staff Order Processing and Return/Refund Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Nguyễn Hữu Anh Nhật |
| Role in team | Staff operation owner |
| Main responsibility | Staff Order Processing, Invoice, Order Status Flow, Staff Return/Refund handling |
| Git branch | `feature/nhat-staff-refund-flow` |
| Priority | Must Have |

## 2. Business Objective

Đảm bảo internal Staff có thể xử lý đơn hàng sau khi Customer đặt hàng. Đây là phần chứng minh hệ thống không chỉ tạo order mà còn có quy trình vận hành: confirm, xuất kho, đóng gói, giao hàng, delivered và xử lý return/refund.

## 3. Module Ownership

- Staff order queue.
- Staff order detail.
- Order confirmation.
- Staff request stock export.
- Invoice print view.
- Order status state machine.
- Staff packed/shipped/delivered update.
- Staff return/refund approve/reject.

## 4. Important Flows Owned

| Flow | Trigger | Expected result |
|---|---|---|
| Staff filter order | Staff opens queue | Orders filtered by status/date/priority |
| Staff confirm order | Staff reviews order | Order becomes Confirmed if payment/stock valid |
| Staff request stock export | Staff confirms order | Stock export request created for Warehouse |
| Staff update status | Products packed/shipped/delivered | Customer sees new order status |
| Staff process refund | Refund request submitted | Request approved/rejected and customer notified |

## 5. Frontend Scope

### Pages

| Page | Path suggestion | Purpose |
|---|---|---|
| Staff Dashboard | `client/src/pages/staff/StaffDashboardPage.jsx` | Show order/refund/support summary |
| Staff Order Queue | `client/src/pages/staff/StaffOrderQueuePage.jsx` | Filter and select orders |
| Staff Order Detail | `client/src/pages/staff/StaffOrderDetailPage.jsx` | Confirm/order status actions |
| Invoice Print View | `client/src/pages/staff/InvoicePrintPage.jsx` | Print confirmed order invoice |
| Return/Refund Queue | `client/src/pages/staff/ReturnRefundQueuePage.jsx` | List refund requests |
| Return/Refund Detail | `client/src/pages/staff/ReturnRefundDetailPage.jsx` | Approve/reject request |

### Components

| Component | Purpose |
|---|---|
| StaffOrderFilter | Filter status/date/priority |
| StaffOrderTable | Staff order list |
| OrderStatusActionPanel | Show allowed next statuses |
| InvoiceTemplate | Printable invoice |
| RefundDecisionForm | Approve/reject with note/refund amount |

### Services

| File | Purpose |
|---|---|
| `client/src/services/staffOrderService.js` | Staff order APIs |
| `client/src/services/returnRefundService.js` | Staff refund APIs |

## 6. Backend Scope

### Models

| Model | Ownership level |
|---|---|
| Order | Use/update status fields from Huy's model |
| OrderDetail | Read line items for staff detail/invoice |
| StockExportRequest | Create from Staff side; Warehouse continues from Cường side |
| ReturnRefundRequest | Create/update status and decision fields |

### Routes/Controllers/Services

| Layer | File suggestion | Responsibility |
|---|---|---|
| Route | `server/src/routes/staffOrder.routes.js` | Staff order queue/detail/status APIs |
| Route | `server/src/routes/returnRefund.routes.js` | Return/refund APIs |
| Controller | `server/src/controller/staffOrder.controller.js` | Request/response handling |
| Controller | `server/src/controller/returnRefund.controller.js` | Request/response handling |
| Service | `server/src/services/staffOrder.service.js` | State machine and staff rules |
| Service | `server/src/services/returnRefund.service.js` | Refund eligibility/decision rules |
| Utility | `server/src/utils/orderStateMachine.js` | Allowed status transitions |

## 7. API Scope

| Method | Endpoint | Permission | Request/query | Response | Error cases |
|---|---|---|---|---|---|
| GET | `/api/staff/orders` | Staff | status, dateFrom, dateTo, priority | Order queue | Invalid date |
| GET | `/api/staff/orders/:id` | Staff | order id | Full order detail | Not found |
| POST | `/api/staff/orders/:id/confirm` | Staff | note optional | Confirmed order | Unpaid online order, stock insufficient |
| POST | `/api/staff/orders/:id/stock-export` | Staff | note optional | Stock export request | Duplicate request, invalid status |
| PATCH | `/api/staff/orders/:id/status` | Staff | nextStatus | Updated order | Invalid transition |
| GET | `/api/staff/orders/:id/invoice` | Staff | order id | Invoice data | Order not confirmed |
| GET | `/api/staff/return-refunds` | Staff | status | Request list | Forbidden |
| GET | `/api/staff/return-refunds/:id` | Staff | request id | Request detail | Not found |
| PATCH | `/api/staff/return-refunds/:id/status` | Staff | status, note, refundAmount | Updated request | Invalid transition/amount |

## 8. Database/Model Scope

| Collection | Fields needed | Business constraints |
|---|---|---|
| Order | orderStatus, paymentStatus, paymentMethod, customerId, totalAmount | Staff can only move through allowed statuses |
| StockExportRequest | orderId, requestedBy, status, note, createdAt | One open export request per order |
| ReturnRefundRequest | orderId, customerId, reason, status, refundAmount, resolvedBy, resolvedAt, staffNote | Staff must approve/reject with note |
| AuditLog | action/target/time | Confirm/status/refund decisions logged |

## 9. UI Screens/Components

| Screen | Main data | Main actions |
|---|---|---|
| Staff Dashboard | Counts by order/refund status | Open queue |
| Order Queue | Orders, filters | Filter/open detail |
| Order Detail | Customer, items, payment, status | Confirm, request export, update status, print invoice |
| Invoice Print | Customer/order/items/total | Print |
| Return/Refund Queue | Requests by status | Open request |
| Return/Refund Detail | Reason, items, evidence, order info | Approve/reject |

## 10. Validation And Error Cases

| Case | Expected handling |
|---|---|
| Online order not Paid | Staff cannot confirm |
| Invalid status transition | Return `409` with allowed statuses |
| Duplicate stock export request | Reject duplicate |
| Stock insufficient at confirm | Reject confirm and notify customer if required |
| Invoice for unconfirmed order | Reject |
| Refund amount > order total | Reject |
| Reject refund without reason | Reject |

## 11. Integration Dependencies

| Dependency | Owner |
|---|---|
| Staff auth/role guard | Nguyễn Ngọc Thành |
| Order/payment data | Nguyễn Quang Huy |
| Product/order item detail | Phạm Thành Chung + Nguyễn Quang Huy |
| Warehouse export continuation | Lê Vũ Cường |
| Notification domain event contract | Nguyễn Quang Huy |
| Email delivery hook | Nguyễn Ngọc Thành |
| Audit helper | Nguyễn Ngọc Thành |

## 12. Phase-by-Phase Task List

### Phase 5 - Main Staff Delivery

- [ ] Build Staff order queue API.
- [ ] Build Staff order detail API.
- [ ] Implement order status state machine.
- [ ] Implement confirm order API.
- [ ] Implement stock export request creation.
- [ ] Implement invoice data API.
- [ ] Build Staff dashboard/order queue/order detail/invoice UI.
- [ ] Add status action buttons based on allowed transitions.

### Phase 6 - Warehouse Integration

- [ ] Coordinate StockExportRequest fields with Cường.
- [ ] Ensure Staff sees export status from Warehouse.
- [ ] Allow status update to Packed after Warehouse export.

### Phase 7 - Return/Refund Delivery

- [ ] Implement Staff return/refund queue/detail APIs.
- [ ] Implement approve/reject decision.
- [ ] Update order/payment status according to approved refund policy.
- [ ] Build return/refund queue/detail UI.

### Phase 8 - Report/Audit Support

- [ ] Ensure Staff actions create audit logs.
- [ ] Provide staff handled order/refund data for reports.

## 13. Git Branch/PR Suggestion

| PR | Branch | Content |
|---|---|---|
| PR 1 | `feature/nhat-staff-order-processing` | Staff queue/detail/confirm/status/invoice |
| PR 2 | `feature/nhat-stock-export-request` | Staff stock export request integration |
| PR 3 | `feature/nhat-return-refund-handling` | Staff return/refund queue and decision flow |

## 14. Testing Checklist

- [ ] Staff can list orders by status/date/priority.
- [ ] Staff can view order detail.
- [ ] Staff cannot confirm unpaid online order.
- [ ] Staff can confirm valid COD/Paid order.
- [ ] Staff can create stock export request once.
- [ ] Staff cannot skip invalid status transitions.
- [ ] Invoice view shows correct order lines/total.
- [ ] Staff can approve refund with valid amount.
- [ ] Staff can reject refund with reason.
- [ ] Staff actions create audit logs.

## 15. Demo Script For Mentor

1. Login as Staff.
2. Open Staff Order Queue and filter Pending orders.
3. Open an order detail.
4. Confirm order.
5. Request stock export.
6. After Warehouse export, update status Packed -> Shipped -> Delivered.
7. Open invoice print view.
8. Open Return/Refund Queue.
9. Approve or reject a request and show result.

## 16. Risk And Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Staff skips status | Order workflow becomes invalid | Central `orderStateMachine` |
| Confirm unpaid online order | Business/payment inconsistency | Check payment status before confirm |
| Duplicate export requests | Warehouse confusion | Unique open request per order |
| Refund update conflicts with payment | Wrong refund status | Coordinate with Huy's Payment model |

## 17. Final Checklist

- [ ] Staff queue complete.
- [ ] Staff detail complete.
- [ ] Confirm/status state machine complete.
- [ ] Stock export request complete.
- [ ] Invoice print complete.
- [ ] Return/refund staff decision complete.
- [ ] Manual demo tested.

