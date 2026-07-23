# SL-001 Handoff — Return/Refund

**Handoff state:** hoàn tất và verified local trên worktree cô lập; chưa deploy production
**Date:** 2026-07-23
**Working branch:** `feature/sl-001-return-refund`
**Base commit:** `1e625cfbbddf8c2ef4f17dbcb1b103f00899356f`

> SL-001 đã được tách khỏi checkout ban đầu sang worktree/branch riêng; mọi review và commit phải thực hiện trên `feature/sl-001-return-refund`.

> Hai hồ sơ mới `SL-001_HANDOFF.md` và `SL-001_G3_TRACEABILITY.md` hiện bị rule `docs/superpowers/` trong `.gitignore` che khuất. Khi tạo commit bàn giao, chỉ force-add đúng hai đường dẫn này hoặc thay đổi chính sách ignore có chủ đích; không force-add cả thư mục.

## 1. Outcome đã bàn giao

SL-001 hiện xử lý trọn luồng trả toàn bộ đơn hàng:

```text
Customer tạo New
  -> Staff Approved hoặc Rejected
  -> Customer bàn giao đúng hạn và xác nhận tài khoản
  -> Staff xác minh tài khoản
  -> Warehouse nhận đủ toàn bộ đơn: Received + Inventory + một RefundPending
  -> PayOS/manual evidence được đối soát
  -> Refund Refunded + Request Completed + Order Returned
```

Nếu Shop/System/PayOS làm sai sau khi từng ghi nhận hoàn tất, hệ thống sửa trạng thái về `Received/Delivered/Unknown`, mở incident do `ShopOrProvider`, rồi chỉ hoàn tất lại khi có bằng chứng chi đúng mới. Nếu giao dịch đã dùng đúng tài khoản Customer xác nhận nhưng Customer nhập sai, incident thuộc `Customer` và hệ thống không tự chi lần hai.

## 2. Actor contract

| Actor | Được làm | Không được làm / không được thấy |
|---|---|---|
| Customer | Tạo yêu cầu trên Order của mình; nhập reason/evidence; ghi nhận bàn giao; tạo phiên bản tài khoản và xác nhận trách nhiệm | Không duyệt; không nhập/chọn số tiền; không sửa kiểm hàng; không xem hồ sơ người khác |
| Staff / CSKH | Duyệt/từ chối có lý do; xem bằng chứng; xem đầy đủ tài khoản ở trang chi tiết; verify/reject; khởi tạo/đối soát PayOS; ghi chứng từ manual; mở recovery | Không sửa dữ liệu Customer xác nhận; không nhập số tiền; không kiểm kho; không tự khai kết quả PayOS qua API manual |
| WarehouseManager | Xem hồ sơ đã được duyệt; xem bằng chứng điều kiện; nhận đủ từng dòng và phân loại sellable/damaged | Không thấy tài khoản/chi trả; không quyết định eligibility; không nhập tiền; không nhận thiếu một phần |
| GreenHouse System | Enforce deadline, ownership, atomicity, idempotency, encryption, redaction, notification identity | Không thay quyết định actor; không coi Processing/Unknown là thành công |
| PayOS | Thực hiện lệnh payout đúng snapshot và trả trạng thái/provider evidence | Không quyết định lý do, eligibility, amount hay inventory |

## 3. Quy tắc đã khóa

- Thời hạn tạo yêu cầu: `DeliveredAt + 5 ngày`, inclusive tại đúng deadline.
- Toàn bộ Order được trả; không có “số lượng muốn đổi/trả”.
- Staff quyết định reason/evidence, luôn ghi lý do.
- Sau duyệt: `ShipByAt = ApprovedAt + 3 ngày`; timestamp bàn giao thực tế quyết định đúng hạn.
- Không có bằng chứng bàn giao đúng hạn: `Expired`, không Inventory, không Refund.
- Customer tạo immutable destination version; Staff verify/reject nhưng không edit.
- Warehouse phải gửi đúng một dòng cho mỗi OrderDetail và đủ số đã mua; `sellable + damaged = received = purchased`.
- Warehouse transaction gồm Request `Received`, Inventory/Product, `RETURN_IN`/`RETURN_DAMAGED_IN` và đúng một `NORMAL_RETURN` Refund obligation; lỗi bất kỳ rollback toàn bộ.
- Amount luôn lấy từ `Order.totalAmount`; API Staff từ chối trường `amount`; Customer/Staff form không hiển thị hoặc nhận số tiền.
- Payout chỉ được bắt đầu khi đã `Received + DestinationVerified`.
- Processing/Failed/Unknown không terminal; manual fallback không được vượt qua một attempt chưa đối soát.
- Completion chỉ đến từ evidence `Succeeded` khớp amount và destination snapshot; Payment/PaymentAttempt gốc vẫn `Paid`.
- Evidence ảnh không còn public dưới `/uploads`; phải đọc qua API authenticated và quyền theo actor.
- Destination được mã hóa at rest; Customer/queue chỉ thấy masked, Staff detail mới thấy full, Warehouse không nhận field này.

## 4. API contract

### Customer

- `POST /api/return-refunds/evidence`
- `GET /api/return-refunds/evidence/:filename`
- `POST /api/orders/:id/return-refund`
- `GET /api/return-refunds/my`
- `POST /api/return-refunds/:id/handoff-proof`
- `POST /api/return-refunds/:id/destination`

### Staff / CSKH

- `GET /api/staff/return-refunds`
- `GET /api/staff/return-refunds/:id`
- `PATCH /api/staff/return-refunds/:id/status`
- `PATCH /api/staff/return-refunds/:id/destination`
- `POST /api/staff/return-refunds/:id/expire`
- `POST /api/staff/return-refunds/:id/payout-evidence`
- `POST /api/staff/return-refunds/:id/payos-payout`
- `POST /api/staff/return-refunds/:id/payos-reconcile`
- `POST /api/staff/return-refunds/:id/payout-incident`
- `POST /api/staff/return-refunds/:id/complete-refund` — guarded reconciliation only; không thể hoàn tất bằng note.

### Warehouse

- `GET /api/warehouse/return-refunds`
- `GET /api/warehouse/return-refunds/:id`
- `POST /api/warehouse/return-refunds/:id/inspection`

## 5. Persistence contract

Các record chính:

- `ReturnRefundRequest`: lifecycle, deadlines, handoff, receipt, completion and void metadata.
- `RefundDestination`: versioned, encrypted, Customer-confirmed destination.
- `ReturnItem`: exact per-order-line physical receipt.
- `InventoryTransaction`: `RETURN_IN` and `RETURN_DAMAGED_IN`, unique movement identity.
- `RefundPending`: separate `NORMAL_RETURN` obligation and payout state.
- `RefundPayoutEvidence`: append-only provider/manual result under idempotency identity.
- `RefundPayoutIncident`: responsibility, correction and resolution lineage.

Run migration before using the new indexes/schema:

```powershell
cd D:\GreenHouse_System-main\server
npm run migrate:cod-reconciliation
```

Migration đã chạy hai lần trên local database và idempotent.

## 6. Configuration

- `REFUND_DESTINATION_ENCRYPTION_KEY`: bắt buộc ở production; phải là secret mạnh và ổn định. Đổi/mất key sẽ làm destination cũ không giải mã được.
- `CARRIER_WEBHOOK_SECRET`: bắt buộc cho bằng chứng COD do carrier gửi; không dùng endpoint Staff để tự khai đã thu COD.
- `RETURN_EVIDENCE_SCANNER_URL`: bắt buộc ở production, phải dùng HTTPS và trả kết quả sạch/bẩn cho từng tệp trước khi lưu.
- `RETURN_EVIDENCE_SCANNER_API_KEY`: credential của dịch vụ quét nếu nhà cung cấp yêu cầu.
- `RETURN_EVIDENCE_CLAIM_SECRET`: secret HMAC ổn định để buộc bằng chứng đã upload vào đúng Customer và kích thước đã xác minh.
- `RETURN_EVIDENCE_RETENTION_DAYS`: số ngày lưu bằng chứng terminal đã được business/compliance phê duyệt; production không được khởi động worker nếu thiếu.
- `RETURN_EVIDENCE_UNLINKED_TTL_HOURS`: thời gian dọn tệp upload nhưng chưa được gắn vào yêu cầu; mặc định `24` giờ.
- PayOS credential hiện có của dự án vẫn được dùng cho payment; payout còn yêu cầu merchant account được PayOS cấp quyền Payout.
- Không đưa `server/.env` vào Git. `.env.example` chỉ chứa tên biến/mô tả.

PayOS online đã được nối theo official `@payos/node` surface `payouts.create/get` với idempotency và snapshot matching. Chưa có credential/quyền merchant để chạy một giao dịch tiền thật; vì vậy production owner phải làm controlled payout test trước release.

## 7. Verification evidence

```powershell
cd D:\GreenHouse_System-main\server
npm test                         # 368/368, 72 suites
npm run migrate:cod-reconciliation
npm run verify:sl001

cd D:\GreenHouse_System-main\client
npm test                         # 123/123, 40 suites
npm run build                    # passed, 134 modules
npm run dev
$env:PYTHONUTF8='1'
python scripts/verify_sl001_ui.py
```

Observed live result:

- Normal lifecycle: `New → Approved → Received → Completed`.
- Recovery lifecycle: `Completed → Received → Completed`.
- Inventory movements: `2`; payout evidence: `2`; incident: `Resolved`.
- Refund: `Refunded`; Order: `Returned`; primary Payment: `Paid`.
- Warehouse destination visible: `false`.
- Browser: 3 actors passed, Customer blocked from Staff route, 0 amount inputs, 0 console errors.
- Temporary verification records after cleanup: Orders `0`, ReturnRefundRequests `0`, Categories `0`.

## 8. Scoped implementation manifest

### Core backend

- `.gitignore` — loại trừ database MongoDB local dùng cho verification.
- `server/src/services/returnRefund.service.js` and tests
- `server/src/services/returnEvidence.service.js` and tests
- `server/src/services/returnEvidenceRetention.service.js` and tests
- `server/src/services/upload.service.js` and tests
- `server/src/config/payos.js` and tests
- `server/src/controller/returnRefund.controller.js`
- `server/src/controller/upload.controller.js`
- `server/src/routes/returnRefund.routes.js` and tests
- `server/src/routes/upload.routes.js` and tests
- `server/src/middlewares/upload.middleware.js`
- `server/src/models/refundDestination.model.js` and tests
- `server/src/models/refundPayoutEvidence.model.js` and tests
- `server/src/models/refundPayoutIncident.model.js` and tests
- `server/src/models/refundPending.model.js` and tests
- `server/src/models/returnRefundRequest.model.js` and tests
- `server/src/models/returnItem.model.js`
- `server/src/models/inventoryTransaction.model.js`
- `server/src/models/order.model.js`
- `server/src/models/product.model.js`
- `server/src/models/schemaAlignment.model.test.js`
- `server/src/demo-data/demoFixtures.js`, `demoGraphValidator.js` and tests — giữ primary Payment là `Paid` sau Return thường.
- `server/src/security/securityConfig.test.js`
- `server/src/workers/returnRefundExpiry.worker.js` and tests
- `server/src/workers/returnEvidenceRetention.worker.js` and tests
- `server/src/scripts/migrateCodReconciliation.js` and tests
- `server/src/scripts/verifySl001ReturnRefund.js` and tests
- `server/src/utils/refundDestinationCrypto.js`
- `server/src/utils/returnEvidenceClaim.js` and tests
- `server/src/app.js`, `server/src/server.js`, `server/package.json`, `server/.env.example`

### Required COD seam

- `server/src/controller/cod.controller.js`
- `server/src/middlewares/carrierSignature.middleware.js` and tests
- `server/src/models/codEvidence.model.js` and tests
- `server/src/models/codRecoveryReceipt.model.js` and tests
- `server/src/routes/cod.routes.js` and tests
- `server/src/routes/staffOrder.routes.js` and tests
- `server/src/services/codReconciliation.service.js` and tests
- supporting `order.service.js`, `payment.service.js`, `staffOrder.service.js` changes and tests

### Client

- `client/src/components/returnRefund/AuthenticatedEvidenceList.jsx`
- `client/src/pages/customer/OrderDetailPage.jsx`
- `client/src/pages/customer/ReturnRefundPage.jsx`
- `client/src/pages/staff/ReturnRefundDetailPage.jsx`
- `client/src/pages/staff/ReturnRefundQueuePage.jsx`
- `client/src/pages/staff/StaffDashboardPage.jsx`
- `client/src/pages/staff/StaffOrderDetailPage.jsx`
- `client/src/pages/warehouse/ReturnRefundInspectionPage.jsx`
- `client/src/pages/warehouse/ReturnRefundQueuePage.jsx`
- `client/src/services/returnRefundService.js` and tests
- `client/src/services/staffOrderService.js` and tests
- `client/src/utils/formatters.js`
- actor/UI contract tests and `client/scripts/verify_sl001_ui.py`
- routing changes in `client/src/App.jsx`

Do not include unrelated `docs/presentation/`, `outputs/`, or any pre-existing unrelated working-tree changes when preparing the SL-001 commit.

## 9. Explicit handoff to later slices

- SL-002 must consume the shared active-case rule and reuse physical/inventory lineage on Exchange→Return conversion.
- SL-003–SL-009 remain separate packages; this handoff does not claim they are implemented.
- Production owner must verify PayOS payout entitlement and one controlled real-provider lifecycle.
- Production owner must configure and smoke-test the evidence scanner, claim secret, and approved retention period.
- Reviewer should first compare this handoff, `SL-001_G3_TRACEABILITY.md`, and the scoped diff; do not infer correctness from green tests alone.
