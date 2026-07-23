# Plan - Nguyễn Ngọc Thành

## Owner

- Họ tên: Nguyễn Ngọc Thành
- Mã sinh viên: `HE186491`
- Email commit: `thanhnnhe186491@fpt.edu.vn`
- Vai trò: Team lead, Home/About/Contact owner, shared account/API/RBAC/audit owner, PayOS integration owner, reviewer và merge owner.

## Goal

Đóng baseline thống nhất giữa SRS và SDS, đặc tả rõ RBAC, API/error contract, audit và quy tắc tích hợp để bốn member còn lại triển khai theo cùng vocabulary.

## Phạm vi bổ sung do Nguyễn Ngọc Thành phụ trách

- Home, About và Contact tiếng Việt cùng các tài nguyên dùng chung của storefront; bảo đảm không làm lẫn luồng khách hàng với dashboard nội bộ.
- Hồ sơ có thể chỉnh sửa, đổi mật khẩu, avatar upload từ máy local và Address Book của Customer.
- `AccountLayout` dùng chung cho Hồ sơ/Thông báo, tách khỏi sidebar nghiệp vụ Staff/Admin/Warehouse.
- Notification foundation trong bản reconciliation cũ đã được chuyển cho Huy theo ownership addendum 2026-07-23; Thành không còn sở hữu unread badge, dropdown, trang thông báo, deep-link hay delete rule.
- Upload foundation dùng chung cho avatar và ảnh sản phẩm; Chung sở hữu phần tích hợp upload vào Product Management.
- Dữ liệu demo tài khoản, địa chỉ và thông báo để các thành viên clone dự án có cùng baseline kiểm thử.
- PayOS SDK/configuration, hosted checkout link, return/cancel integration, signature webhook và webhook registration.

### Trạng thái triển khai phạm vi bổ sung

- [x] Home, About, Liên hệ và layout storefront dùng chung.
- [x] Profile edit, đổi mật khẩu và avatar upload/remove.
- [x] Customer Address Book API/UI và địa chỉ mặc định.
- [x] Historical baseline only: Notification API/UI, dropdown, unread/read/delete guard và deep-link; ownership hiện tại thuộc Huy theo addendum 2026-07-23.
- [x] Upload foundation có kiểm tra nội dung file, giới hạn kích thước và tên UUID.
- [x] Seed demo dùng chung và regression test.
- [ ] Review/merge Product Media của Phạm Thành Chung.
- [ ] Review/merge Checkout Address của Nguyễn Quang Huy.

## Phạm vi discrepancy cần sửa

- SDS thiếu Guest trong mô hình actor chi tiết.
- SDS chưa có permission matrix theo endpoint/thao tác.
- API mới dừng ở REST khái quát, thiếu method, URL, request/response, status code và pagination.
- Error handling, transaction failure, retry và correlation/audit chưa được đặc tả.
- SDS Record of Changes trống; có duplicate heading `3.1` và duplicate table number.
- SRS diagram/ERD chưa theo kịp text baseline.

## File cần kiểm tra/cập nhật ở phase triển khai

- `docs/SRS_SDS_RECONCILIATION_PLAN.md` hoặc tài liệu baseline tương đương.
- SDS Sections 1-3: version, actor, architecture, package, data vocabulary.
- SRS Sections 4, 6, 8, 9, 10: sửa diagram/traceability theo text.
- `server/src/middlewares/auth.middleware.js`
- `server/src/middlewares/authorize.middleware.js`
- `server/src/middlewares/error.middleware.js`
- `server/src/utils/apiResponse.js`
- `server/src/utils/apiError.js`
- `server/src/utils/auditLogger.js`
- `client/src/components/auth/ProtectedRoute.jsx`
- `client/src/components/auth/RoleRoute.jsx`
- `server/src/config/payos.js`
- `server/src/services/payment.service.js`
- `server/src/controller/payment.controller.js`
- `server/src/routes/payment.routes.js`
- `client/src/services/paymentService.js`
- `client/src/pages/customer/PaymentPage.jsx`
- `client/src/pages/customer/PaymentResultPage.jsx`

## Chi tiết thực hiện

1. Tạo bảng role matrix cho Guest, Customer, Staff, Warehouse Manager và Admin; ghi rõ read/create/update/approve/transition cho từng module.
2. Chuẩn hóa response thành `{ success, data, message, errorCode, requestId }`, giữ backward compatibility với API đang dùng nếu cần.
3. Ghi API contract tối thiểu cho auth, catalog, cart/order/payment, staff, warehouse, return/support và admin.
4. Đặc tả lỗi validation, forbidden, not-found, conflict/idempotency, external gateway failure và internal transaction failure.
5. Chốt audit events: login success/failure, permission change, product/inventory change, order/payment transition, return decision và replenishment approval.
6. Cập nhật SDS version/revision, Record of Changes, mục lục, numbering và source-of-truth note.
7. Sửa SRS diagrams để không còn Staff trực tiếp trừ kho, không còn Warehouse approve replenishment, và dùng `Order Received` thay cho `Order Confirmed` sau checkout.

## Acceptance checklist

- [ ] Mỗi protected route có role rõ ràng.
- [ ] Customer chỉ truy cập dữ liệu sở hữu.
- [ ] Admin không tự động đồng nghĩa với quyền warehouse mutation.
- [ ] Error contract có error code và recovery meaning.
- [ ] Audit record có actor, action, target, oldValue, newValue, reason, timestamp.
- [ ] SRS/SDS không còn duplicate section/table numbering.
- [ ] Version và approval status có thể truy vết.

## Verification

```powershell
cd server
npm test -- --runInBand
cd ..\client
npm test -- --runInBand
npm run build
```

## Branch/commit

```text
feature/thanh-srs-sds-baseline
docs: define srs sds reconciliation baseline

feature/thanh-payos-payment
feat: integrate payos online payment
```

## PayOS Addendum 2026-07-22

- Thành sở hữu provider integration; Huy không sở hữu PayOS credential, SDK hoặc public webhook.
- Required env: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_WEBHOOK_URL`, `PAYOS_PAYMENT_LINK_TTL_MINUTES`.
- Webhook: `POST /api/payments/payos/webhook`; verify signature trước khi tìm `PaymentAttempt` và áp dụng state transition idempotent.
- PayOS validation webhook có thể dùng order code không tồn tại; sau khi signature hợp lệ endpoint acknowledge 2XX nhưng không tạo side effect.
- Local: dùng HTTPS tunnel tới port `5000`, sau đó chạy `npm run payos:confirm-webhook`.
