# Plan - Nguyễn Ngọc Thành

## Owner

- Họ tên: Nguyễn Ngọc Thành
- Mã sinh viên: `HE186491`
- Email commit: `thanhnnhe186491@fpt.edu.vn`
- Vai trò: Team lead, baseline owner, API/RBAC/audit owner, reviewer và merge owner.

## Goal

Đóng baseline thống nhất giữa SRS và SDS, đặc tả rõ RBAC, API/error contract, audit và quy tắc tích hợp để bốn member còn lại triển khai theo cùng vocabulary.

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
```
