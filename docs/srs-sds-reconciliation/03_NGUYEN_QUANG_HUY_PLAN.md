# Plan - Nguyễn Quang Huy

## Owner

- Họ tên: Nguyễn Quang Huy
- Mã sinh viên: `HE186466`
- Email commit: `quanghuyn267@gmail.com`
- Vai trò: Cart, Checkout, Order, Payment domain state, COD, Customer Order History và ongoing Notification domain owner từ 2026-07-23; không sở hữu PayOS provider integration, EmailOutbox/Gmail delivery, OTP/password reset, public contact email hoặc Audit.

## Goal

Đồng bộ Cart -> Order -> Payment domain với SRS mới, đặc biệt là idempotent checkout, reservation boundary, PaymentAttempt, callback history, COD và refund trigger. Từ 2026-07-23, Huy đồng thời sở hữu ongoing Notification model/service/API, in-app UI, lifecycle và domain-event consumption. PayOS SDK/credential/webhook/provider mapping, EmailOutbox/Gmail delivery, OTP/password reset, public contact email và Audit tiếp tục thuộc Nguyễn Ngọc Thành.

## Phạm vi discrepancy cần sửa

- SDS dùng Payment 1–1 với Order, trong khi SRS yêu cầu nhiều PaymentAttempt và PaymentCallbackEvent append-only.
- SDS chưa mô tả idempotency key, duplicate checkout và late callback.
- SDS chưa có state machine PaymentAttempt/PaymentStatus.
- Cart/CartItem chưa thể hiện rõ ownership và không reserve stock trước order creation.
- Order có `items` nhưng đồng thời có OrderDetail, gây trùng nguồn dữ liệu.
- Tài liệu trước 2026-07-23 ghi nhận Notification baseline do Thành triển khai nhưng chưa tách rõ lịch sử baseline với ownership vận hành/bảo trì đang chuyển sang Huy.
- Notification producer ở các module nghiệp vụ cần dùng một contract idempotent chung; không module nào được tự tạo model, unread rule hoặc bell riêng.

## File cần kiểm tra/cập nhật ở phase triển khai

- `server/src/models/cart.model.js`
- `server/src/models/cartItem.model.js`
- `server/src/models/order.model.js`
- `server/src/models/orderDetail.model.js`
- `server/src/models/payment.model.js`
- `server/src/services/cart.service.js`
- `server/src/services/order.service.js`
- `server/src/services/payment.service.js` cho Payment domain state/invariant; PayOS adapter và provider mapping thuộc Thành.
- `server/src/routes/cart.routes.js`
- `server/src/routes/order.routes.js`
- `server/src/routes/payment.routes.js` cho domain route phối hợp; `POST /api/payments/payos/webhook` thuộc Thành.
- `client/src/pages/customer/CartPage.jsx`
- `client/src/pages/customer/CheckoutPage.jsx`
- `client/src/pages/customer/PaymentPage.jsx` và Result page là integration surface do Thành sở hữu khi nối PayOS.
- `client/src/pages/customer/OrderHistoryPage.jsx`
- `server/src/models/notification.model.js`
- `server/src/services/notification.service.js`
- `server/src/controller/notification.controller.js`
- `server/src/routes/notification.routes.js`
- `client/src/services/notificationService.js`
- `client/src/components/NotificationBell.jsx`
- `client/src/pages/account/NotificationsPage.jsx` hoặc đường dẫn tương đương đang được router sử dụng.

## Chi tiết thực hiện

1. Chốt Cart ownership: mỗi Customer có tối đa một active cart; Product không lặp trong cart; quantity là số nguyên dương.
2. Checkout bắt buộc idempotency key; khi key đã hoàn tất phải trả kết quả cũ, không tạo Order mới.
3. Trong một transaction, tạo Pending Order, OrderDetail snapshot, reservation, initial payment state và xóa đúng cart items.
4. Tách PaymentAttempt khỏi PaymentCallbackEvent; callback phải lưu trước khi acknowledge và side effect chỉ chạy một lần theo provider event/transaction identity.
5. Chốt COD: initial PaymentStatus `Unpaid`; online: `Pending`; không cho Staff confirm unpaid online order.
6. Chốt late paid callback: không mở lại order đã timeout/cancel; tạo Refund/RefundPending theo business rule.
7. Customer hủy đơn unpaid/pre-confirmation phải claim trạng thái và hoàn toàn bộ reservation trong cùng transaction; retry không được hoàn tồn lần hai.
8. Cập nhật SDS sequence/class/query design và test cho duplicate, stale price, inactive product, insufficient availability, invalid callback và retry.
9. Bảo trì Notification model/service/API và in-app bell/dropdown/list/detail; mọi truy vấn/mutation phải giới hạn theo owner hiện tại.
10. Chốt lifecycle read/unread/delete, event consumption idempotent và retry status; deep-link không được bỏ qua RBAC/ownership của target.
11. Giữ ranh giới: Huy không sửa EmailOutbox/Gmail delivery, OTP/password reset, public contact email, PayOS provider/webhook hoặc Audit; các phần này tiếp tục do Thành sở hữu.

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
- [x] Ownership docs phân biệt rõ Notification historical baseline của Thành với ongoing ownership của Huy từ 2026-07-23.
- [ ] Notification code tương lai kiểm tra owner/RBAC cho list/detail/read/delete và không để deep-link cấp thêm quyền.
- [ ] Domain event được consume idempotent; retry status không tạo duplicate notification.
- [ ] EmailOutbox/Gmail/OTP/Contact/PayOS/Audit vẫn nằm ngoài Notification implementation scope của Huy.

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

feature/huy-notification-ownership-docs
docs: transfer notification ownership to huy

feature/huy-notification-domain
TBD - chưa tạo; dùng identity Nguyễn Quang Huy <quanghuyn267@gmail.com>
```

## Trạng thái bàn giao

- Commit của Nguyễn Quang Huy: `8ecd408`.
- Nguyễn Ngọc Thành đã review scope, transaction/idempotency, validation, Order snapshot và kết quả regression.
- Đã merge `--no-ff` vào `main` bằng merge commit `790f132`.

## Ownership Addendum 2026-07-22 - PayOS

Addendum này ưu tiên hơn các mô tả cũ gán toàn bộ callback/provider cho Huy:

- Nguyễn Ngọc Thành sở hữu `@payos/node`, env/credential, create payment link, return/cancel URL, `POST /api/payments/payos/webhook`, signature verification, webhook registration và frontend PayOS redirect/result.
- Nguyễn Quang Huy sở hữu Payment domain state/COD, amount and ownership validation, callback idempotency/history, late-paid/refund invariant sau khi nhận payload PayOS đã được Thành xác minh.
- PayOS implementation dùng branch `feature/thanh-payos-payment` và identity của Nguyễn Ngọc Thành.

## Ownership Addendum 2026-07-23 - Notification Domain

Addendum này chỉ supersede ongoing ownership kể từ 2026-07-23. Các dòng trước đó mô tả Thành triển khai Notification baseline là bằng chứng lịch sử và không bị viết lại.

- Nguyễn Quang Huy sở hữu Notification model/service/API, in-app bell/dropdown/list/detail, read/unread/delete, domain-event consumption và retry status.
- Nhật, Cường và các module nghiệp vụ khác chỉ phát domain event idempotent theo Notification contract của Huy; không tạo Notification model, bell hoặc lifecycle riêng.
- Nguyễn Ngọc Thành tiếp tục sở hữu EmailOutbox, Gmail SMTP/email delivery, OTP/password reset, public contact email, PayOS, Audit và final integration.
- Ownership docs branch là `feature/huy-notification-ownership-docs`. Notification code branch dự kiến là `feature/huy-notification-domain` (TBD, chưa tạo).
- Mọi commit thuộc scope Huy phải dùng `Nguyễn Quang Huy <quanghuyn267@gmail.com>`.

## SL-003 Closure Addendum 2026-07-23

`feature/sl-003-order-payment-cancellation` đóng phạm vi Order, Payment và Cancellation theo thiết kế SL-003 và CR-001 v2.1. Các acceptance decision đã được duyệt:

- Online Order khởi tạo `Pending`, không tạo PaymentAttempt giả tại checkout; `paymentDeadlineAt` bất biến và có migration normalize trạng thái legacy.
- Checkout dùng `expectedItems` với `priceVersion`; mọi mismatch trả conflict có mã riêng, không âm thầm tính lại giá.
- Cancellation yêu cầu reason và idempotency key; replay cùng fingerprint trả kết quả cũ, payload khác trả `IDEMPOTENCY_KEY_REUSED`.
- Late/excess Paid evidence không reopen order/reservation; giữ PaymentAttempt bất biến và tạo Refund obligation.
- Staff confirmation và StockExportRequest là một transaction; expiry worker claim có điều kiện và release reservation exactly once.

Traceability chính:

| Requirement | Implementation evidence | Test evidence |
|---|---|---|
| Checkout idempotency, snapshot, price/version conflict | `server/src/services/order.service.js`, `client/src/pages/customer/CheckoutPage.jsx` | `order.service.test.js`, `CheckoutPage.test.js` |
| Payment callback history, late/excess refund | `server/src/services/payment.service.js` | `payment.service.test.js` |
| Cancellation reason/idempotency and role boundary | `server/src/controller/order.controller.js`, `OrderDetailPage.jsx` | `order.service.test.js`, `OrderDetailPage.cancellation.test.js` |
| Deadline expiry and reservation release | `server/src/services/orderPaymentExpiry.service.js`, `server/src/workers/orderPaymentExpiry.worker.js` | matching service/worker tests |
| Cart price evidence and stale refresh | `server/src/services/cart.service.js`, `server/src/models/cartItem.model.js` | `cart.service.test.js`, `cartItem.model.test.js` |
| Migration/repeat safety | `server/src/scripts/migrateSl003OrderPaymentCancellation.js` | migration test |

Verification: server `511/511`, client `168/168`, production build exit code `0`. Handoff detail is kept in the local-only `docs/superpowers/reconciliation/SL-003_HANDOFF.md` and `SL-003_G3_TRACEABILITY.md`; those files are intentionally not added to Git per project policy.
