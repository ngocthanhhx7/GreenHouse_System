# Plan - Nguyễn Hữu Anh Nhật

## Owner

- Họ tên: Nguyễn Hữu Anh Nhật
- Mã sinh viên: `HE176402`
- Email commit: `nguyenhuuanhnhat2k3@gmail.com`
- Vai trò: Staff Order Processing, Invoice, Order Status, Return/Refund và Staff Support owner.

## Goal

Đưa order lifecycle và return/refund về đúng ownership: Staff xử lý nghiệp vụ đơn và quyết định return, Warehouse kiểm hàng/đổi tồn, Payment service hoàn tiền; không cho transition tắt hoặc trừ kho sai actor.

## Phạm vi discrepancy cần sửa

- SDS thiếu rõ `Packed`, `Shipped`, `Delivered` và guard của từng transition.
- SDS có chỗ dùng `Shipping` thay cho `Shipped`.
- SDS cho Staff xử lý return/refund quá sớm, chưa có bước Warehouse inspection.
- SRS yêu cầu tách ReturnRequest, ReturnItem và Refund nhưng SDS gộp `ReturnRefundRequest`.
- SDS class table giao một số hành động replenishment sai owner.
- Invoice có use case nhưng chưa có data/format/eligibility contract.

## File cần kiểm tra/cập nhật ở phase triển khai

- `server/src/utils/orderStateMachine.js`
- `server/src/services/staffOrder.service.js`
- `server/src/services/returnRefund.service.js`
- `server/src/services/support.service.js`
- `server/src/routes/staffOrder.routes.js`
- `server/src/routes/returnRefund.routes.js`
- `server/src/routes/support.routes.js`
- `client/src/pages/staff/StaffOrderQueuePage.jsx`
- `client/src/pages/staff/StaffOrderDetailPage.jsx`
- `client/src/pages/staff/InvoicePrintPage.jsx`
- `client/src/pages/staff/ReturnRefundQueuePage.jsx`
- `client/src/pages/staff/ReturnRefundDetailPage.jsx`
- `client/src/pages/staff/SupportQueuePage.jsx`
- `client/src/pages/staff/SupportDetailPage.jsx`

## Chi tiết thực hiện

1. Chốt OrderStatus: `Pending`, `Confirmed`, `Packed`, `Shipped`, `Delivered`, `Cancelled`, `Returned`.
2. Chỉ cho Staff: confirm Pending hợp lệ, xác nhận Packed sau stock export, Packed -> Shipped, Shipped -> Delivered, hủy Pending/Confirmed trước export hoàn tất.
3. COD phải được xác nhận đã thu trước Delivered; Paid cancellation tạo RefundPending và không được trừ/hoàn hai lần.
4. Return flow: Customer tạo whole-order request; Staff approve/reject có reason; Warehouse inspect và phân loại; chỉ sellable quantity được RETURN_IN; Refund hoàn tất mới chuyển ReturnRequest Completed và Order Returned.
5. Support chỉ New -> InProgress -> Resolved; chỉ Staff xử lý/respond/resolve.
6. Invoice chỉ in cho Confirmed order, dùng OrderDetail snapshot và không thay đổi business state.
7. Staff hủy đơn `Pending/Confirmed` phải claim trạng thái và hoàn reservation trong cùng transaction; paid order đồng thời tạo đúng một refund hand-off.
8. Cập nhật SDS sequence/class/state diagram và test stale, backward, skipped, duplicate, missing reason/evidence.

## Acceptance checklist

- [x] Không có transition `Pending -> Delivered` hoặc `Confirmed -> Delivered` trực tiếp.
- [x] Không cho Packed cancel.
- [x] Staff cancellation hoàn reservation đúng một lần; paid cancellation tạo đúng một refund hand-off.
- [x] Staff không trực tiếp mutate inventory ngoài transaction cancellation contract dùng Inventory repository.
- [x] Approval return chưa tạo refund/restock ngay.
- [x] Warehouse inspection là điều kiện trước refund.
- [x] Invoice không làm đổi Order/Payment/Inventory.
- [x] Support status và ownership đúng SRS.

## Verification

```powershell
cd server
npm test
cd ..\client
npm test
npm run build
```

## Branch/commit

```text
feature/nhat-release-staff-reservations
fix: release reservations on staff cancellation
```
