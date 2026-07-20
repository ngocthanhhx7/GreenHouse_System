# Plan - Nguyễn Quang Huy

## Owner

- Họ tên: Nguyễn Quang Huy
- Mã sinh viên: `HE186466`
- Email commit: `quanghuyn267@gmail.com`
- Vai trò: Cart, Checkout, Order, Payment, COD và Customer Order History owner.

## Goal

Đồng bộ toàn bộ Cart -> Order -> Payment với SRS mới, đặc biệt là idempotent checkout, reservation boundary, PaymentAttempt, callback history, COD và refund trigger.

## Phạm vi discrepancy cần sửa

- SDS dùng Payment 1–1 với Order, trong khi SRS yêu cầu nhiều PaymentAttempt và PaymentCallbackEvent append-only.
- SDS chưa mô tả idempotency key, duplicate checkout và late callback.
- SDS chưa có state machine PaymentAttempt/PaymentStatus.
- Cart/CartItem chưa thể hiện rõ ownership và không reserve stock trước order creation.
- Order có `items` nhưng đồng thời có OrderDetail, gây trùng nguồn dữ liệu.

## File cần kiểm tra/cập nhật ở phase triển khai

- `server/src/models/cart.model.js`
- `server/src/models/cartItem.model.js`
- `server/src/models/order.model.js`
- `server/src/models/orderDetail.model.js`
- `server/src/models/payment.model.js`
- `server/src/services/cart.service.js`
- `server/src/services/order.service.js`
- `server/src/services/payment.service.js`
- `server/src/routes/cart.routes.js`
- `server/src/routes/order.routes.js`
- `server/src/routes/payment.routes.js`
- `client/src/pages/customer/CartPage.jsx`
- `client/src/pages/customer/CheckoutPage.jsx`
- `client/src/pages/customer/PaymentPage.jsx`
- `client/src/pages/customer/OrderHistoryPage.jsx`

## Chi tiết thực hiện

1. Chốt Cart ownership: mỗi Customer có tối đa một active cart; Product không lặp trong cart; quantity là số nguyên dương.
2. Checkout bắt buộc idempotency key; khi key đã hoàn tất phải trả kết quả cũ, không tạo Order mới.
3. Trong một transaction, tạo Pending Order, OrderDetail snapshot, reservation, initial payment state và xóa đúng cart items.
4. Tách PaymentAttempt khỏi PaymentCallbackEvent; callback phải lưu trước khi acknowledge và side effect chỉ chạy một lần theo provider event/transaction identity.
5. Chốt COD: initial PaymentStatus `Unpaid`; online: `Pending`; không cho Staff confirm unpaid online order.
6. Chốt late paid callback: không mở lại order đã timeout/cancel; tạo Refund/RefundPending theo business rule.
7. Cập nhật SDS sequence/class/query design và test cho duplicate, stale price, inactive product, insufficient availability, invalid callback và retry.

## Acceptance checklist

- [ ] Cart không reserve stock.
- [ ] Checkout atomic và idempotent.
- [ ] OrderDetail giữ snapshot name/SKU/unit/price/quantity.
- [ ] Mỗi callback được lưu append-only.
- [ ] Duplicate callback không nhân đôi Paid/Refund/Notification.
- [ ] COD và online có initial state đúng.
- [ ] Customer chỉ xem/hủy Order của chính mình và chỉ hủy state hợp lệ.

## Verification

```powershell
cd server
npm test -- --runInBand src/services/cart.service.test.js src/services/order.service.test.js src/services/payment.service.test.js src/utils/orderStateMachine.test.js
cd ..\client
npm test -- --runInBand src/services/cartService.test.js src/services/orderService.test.js src/services/paymentService.test.js
npm run build
```

## Branch/commit

```text
feature/huy-payment-order-reconciliation
docs: align payment order reconciliation scope
```
