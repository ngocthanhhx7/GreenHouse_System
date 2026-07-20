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
7. Customer hủy đơn unpaid/pre-confirmation phải claim trạng thái và hoàn toàn bộ reservation trong cùng transaction; retry không được hoàn tồn lần hai.
8. Cập nhật SDS sequence/class/query design và test cho duplicate, stale price, inactive product, insufficient availability, invalid callback và retry.

## Acceptance checklist

- [x] Cart không reserve stock.
- [x] Checkout atomic và idempotent.
- [x] OrderDetail giữ snapshot name/SKU/unit/price/quantity.
- [x] Mỗi callback được lưu append-only.
- [x] Duplicate callback không nhân đôi Paid/Refund/Notification.
- [x] COD và online có initial state đúng.
- [x] Customer chỉ xem/hủy Order của chính mình và chỉ hủy state hợp lệ.
- [x] Hủy Order hoàn reservation đúng một lần trong cùng transaction.
- [x] Checkout tự chọn địa chỉ mặc định từ Address Book.
- [x] Customer có thể chọn địa chỉ đã lưu hoặc nhập địa chỉ mới dùng một lần.
- [x] Địa chỉ mới chỉ được lưu khi Customer chủ động chọn, có tên gợi nhớ riêng.
- [x] Order lưu snapshot bất biến gồm người nhận, số điện thoại, địa chỉ và ghi chú.
- [x] Validation người nhận, số điện thoại Việt Nam và độ dài địa chỉ chạy trước khi reserve tồn kho.

## Bổ sung hoàn thành - Checkout Address Book

- Frontend tải song song giỏ hàng, hồ sơ và Address Book; tự chọn địa chỉ mặc định nhưng vẫn cho đổi sang địa chỉ khác.
- Form địa chỉ mới dùng cấu trúc tỉnh/thành, quận/huyện, phường/xã và địa chỉ chi tiết; tên và số điện thoại được điền từ hồ sơ.
- Customer có thể dùng địa chỉ mới một lần hoặc lưu vào Address Book với tên gợi nhớ; thao tác lưu không thay đổi snapshot của đơn cũ.
- Backend chuẩn hóa và validate snapshot trước transaction đặt hàng, sau đó lưu trực tiếp vào Order để lịch sử giao nhận không phụ thuộc thay đổi hồ sơ tương lai.
- Order Detail hiển thị lại người nhận, số điện thoại, địa chỉ và ghi chú của đúng thời điểm đặt hàng.

## Verification

```powershell
cd server
npm test -- --runInBand src/services/cart.service.test.js src/services/order.service.test.js src/services/payment.service.test.js src/utils/orderStateMachine.test.js
cd ..\client
npm test -- --runInBand src/services/cartService.test.js src/services/orderService.test.js src/services/paymentService.test.js
npm run build
```

Kết quả thực tế trên nhánh `feature/huy-checkout-address-book`:

- Server: `197/197` test đạt.
- Client: `68/68` test đạt.
- Production build đạt; còn cảnh báo bundle Vite lớn hơn 500 kB, không chặn chức năng.
- Browser QA đạt tại `390x844` và `1440x1000`: không tràn ngang, địa chỉ mặc định được chọn đúng, chuyển sang địa chỉ mới hoạt động, console không có lỗi.

## Branch/commit

```text
feature/huy-payment-order-reconciliation
docs: align payment order reconciliation scope

feature/huy-checkout-address-book
feat: integrate address book into checkout
```
