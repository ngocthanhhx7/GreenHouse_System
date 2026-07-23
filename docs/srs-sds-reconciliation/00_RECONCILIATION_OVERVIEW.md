# SRS/SDS Reconciliation Implementation Plan

> Người điều phối và reviewer cuối: Nguyễn Ngọc Thành (`HE186491`).
> Mục tiêu của bộ tài liệu này là chia các phần cần sửa sau khi đối chiếu SRS và SDS thành các commit nhỏ, có owner rõ ràng và có thể review độc lập.

## 1. Goal

Đồng bộ Software Design Specification, schema, state machine, API contract và implementation với phần yêu cầu văn bản mới nhất của SRS; loại bỏ các thiết kế cũ có thể gây sai nghiệp vụ như thanh toán một-một, thiếu reservation, sai quyền replenishment và thiếu vòng đời return/refund.

## 2. Source Of Truth

- SRS trên Drive: bản có Record of Changes cập nhật đến 18/07/2026, trạng thái `Text Baseline Candidate`.
- SDS trên Drive: bản Word 40 trang, phần Record of Changes còn trống và thiết kế chi tiết chưa theo kịp SRS.
- Khi text và diagram mâu thuẫn, tạm ưu tiên SRS Sections 5-10 sau khi Thành ghi nhận quyết định trong review.
- Không được tự ý đổi phạm vi sản phẩm ngoài SRS: không thêm voucher, shipper management, native mobile hoặc accounting nâng cao.

## 3. Findings To Resolve

| Priority | Finding | Owner |
|---|---|---|
| P0 | PaymentAttempt/PaymentCallbackEvent/Refund chưa đồng bộ với Payment trong SDS | Nguyễn Quang Huy (domain state) + Nguyễn Ngọc Thành (PayOS provider/webhook) |
| P0 | InventoryReservation và transaction atomic chưa đồng bộ với stock design | Lê Vũ Cường |
| P0 | Order status trong SDS thiếu Packed, Shipped, Delivered và transition guard | Nguyễn Hữu Anh Nhật |
| P0 | Return/refund đang gộp sai entity và sai ownership giữa Staff/Warehouse | Nguyễn Hữu Anh Nhật |
| P0 | Replenishment approval bị giao sai cho Warehouse/Staff thay vì Admin | Lê Vũ Cường |
| P1 | Account/RBAC/audit/API/error contract chưa có design chi tiết | Nguyễn Ngọc Thành |
| P1 | Product/Category/Catalog design chưa phản ánh đầy đủ active rule, snapshot và SKU/image | Phạm Thành Chung |
| P1 | Support, review, reports và settings chưa có contract/design đầy đủ | Lê Vũ Cường; Notification contract do Nguyễn Quang Huy sở hữu |
| P1 | SDS thiếu HTTP endpoint, request/response, status code, pagination và retry contract | Nguyễn Ngọc Thành |
| P2 | Duplicate heading/table number, thiếu version/approval, diagram cũ và Record of Changes trống | Nguyễn Ngọc Thành |

## 4. Ownership And Deliverables

| Member | Deliverable chính | Code area cần kiểm tra | Branch tạm |
|---|---|---|---|
| Nguyễn Ngọc Thành | Baseline governance, RBAC, API/error contract, audit, PayOS provider/webhook và review merge | `server/src/middlewares`, `server/src/utils`, `server/src/config/payos.js`, payment controller/routes, payment frontend integration, `docs` | `feature/thanh-payos-payment` |
| Phạm Thành Chung | Catalog/Product/Category alignment, active visibility, SKU/image/snapshot | `server/src/models/product.model.js`, `category.model.js`, product/category services, public pages | `feature/chung-catalog-schema-alignment` |
| Nguyễn Quang Huy | Cart/Order/Payment domain alignment, idempotency, state machine, late callback/refund rule, COD và Notification domain foundation; không sở hữu PayOS adapter/credential/webhook | cart/order/payment/notification domain models/services, checkout/order pages, in-app notification UI | Payment: `feature/huy-payment-order-reconciliation`; Notification ownership docs only: `feature/huy-notification-ownership-docs`; future Notification code: `feature/huy-notification-domain` (TBD, chưa tạo) |
| Nguyễn Hữu Anh Nhật | Staff order state machine, invoice, return/refund/support ownership | `staffOrder`, `returnRefund`, `support` services/pages | `feature/nhat-order-return-reconciliation` |
| Lê Vũ Cường | Inventory/reservation/export/replenishment/report/settings và phát Notification domain event | inventory, replenishment, report, system setting modules | `feature/cuong-warehouse-admin-reconciliation` |

## 5. Dependency Order

1. Thành chốt vocabulary, role matrix, response/error contract và baseline rules.
2. Chung chốt Product/Category/Inventory reference để các luồng order dùng đúng snapshot và active rule.
3. Huy chốt Cart -> Order -> Payment domain, reservation boundary và payment states; Thành chốt PayOS adapter, webhook signature và provider mapping.
4. Nhật dùng Order/Payment state đã chốt để sửa Staff processing, invoice và return/refund.
5. Cường dùng reservation/export contract của Huy và Staff status của Nhật để sửa warehouse, replenishment và reports, rồi phát event theo Notification contract của Huy.
6. Thành review tất cả diff trên `main`, chạy test/build và merge theo thứ tự trên.

## 6. Branch And Commit Rules

Mỗi branch được push lên GitHub để mentor theo dõi, sau khi Thành merge sẽ xóa branch tạm. Không dùng prefix `codex/`.

| Owner | Commit author | Commit subject đề xuất |
|---|---|---|
| Nguyễn Ngọc Thành | `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>` | `docs: define srs sds reconciliation baseline` |
| Phạm Thành Chung | `Phạm Thành Chung <chungthanhpham2112@gmail.com>` | `docs: align catalog reconciliation scope` |
| Nguyễn Quang Huy | `Nguyễn Quang Huy <quanghuyn267@gmail.com>` | `docs: align payment order reconciliation scope` |
| Nguyễn Hữu Anh Nhật | `Nguyễn Hữu Anh Nhật <nguyenhuuanhnhat2k3@gmail.com>` | `docs: align staff return order scope` |
| Lê Vũ Cường | `Lê Vũ Cường <levucuong0319@gmail.com>` | `docs: align warehouse admin reconciliation scope` |

Không commit asset không liên quan hoặc file `.env`. Hai thư mục asset đang untracked trong `client/public/assets/icon/` phải được giữ nguyên, không stage nếu không nằm trong deliverable.

## 7. Definition Of Done For Every Member

- [ ] Có mục tiêu và phạm vi được ghi trong plan riêng.
- [ ] Có danh sách SRS/SDS discrepancy mà member chịu trách nhiệm.
- [ ] Có file code và file tài liệu cần kiểm tra.
- [ ] Có state, validation, role và failure cases cụ thể.
- [ ] Có test command hoặc checklist kiểm chứng.
- [ ] Không thay đổi module ngoài ownership nếu chưa nêu dependency.
- [ ] Commit đúng author, branch không có `codex/`.
- [ ] Branch đã push lên GitHub trước khi Thành review.
- [ ] Thành đã kiểm tra diff, test evidence và quyết định merge.

## 8. Merge Gate By Nguyễn Ngọc Thành

Thành chỉ merge khi:

1. `git diff main...<branch>` đúng phạm vi member.
2. Không có secret, file build hoặc asset ngoài phạm vi.
3. Unit tests liên quan pass.
4. SRS/SDS terminology không tạo thêm entity/state trái với baseline.
5. Role ownership và transaction boundary khớp ma trận ở tài liệu này.
6. Sau mỗi merge, chạy lại test tổng thể trước khi merge branch kế tiếp.

## 9. Final Acceptance

- SRS text, SRS diagrams, SDS schema và code dùng cùng tên entity/state.
- Payment callback và refund có idempotency, history và failure handling.
- Order không thể đi tắt hoặc bị Staff/Warehouse thực hiện sai quyền.
- Inventory không âm, reservation không bị trừ hai lần.
- Return/refund có đủ Customer -> Staff -> Warehouse -> Refund flow.
- API/error/role contract có thể dùng để viết test và triển khai.
- `main` và `BA` là hai branch dài hạn; các branch feature chỉ tồn tại trong thời gian review rồi được xóa.

## 10. Ownership Addendum - Account, Media, Notification, Address (2026-07-20)

Các yêu cầu mới về upload ảnh, avatar, hồ sơ, thông báo và sổ địa chỉ được phân như sau và ưu tiên hơn bảng ownership cũ:

| Thành viên | Ownership bổ sung |
|---|---|
| Nguyễn Ngọc Thành | Homepage, layout tài khoản dùng chung, upload foundation, User/avatar/profile, Address Book API nền tảng, Notification API + bell/dropdown/detail/read/delete, integration/review/merge |
| Phạm Thành Chung | Product image upload UI, preview, featured image và Product media integration |
| Nguyễn Quang Huy | Chọn địa chỉ đã lưu/mặc định hoặc nhập địa chỉ mới tại Checkout; Order address snapshot |
| Nguyễn Hữu Anh Nhật | Staff Order, Return/Refund, Support; chỉ phát notification event theo contract của Thành |
| Lê Vũ Cường | Warehouse, Reports, Settings; phát event tồn kho/replenishment và tích hợp Notification service của Huy |

## 11. Ownership Addendum - PayOS Online Payment (2026-07-22)

- Nguyễn Ngọc Thành là owner tích hợp PayOS: SDK/configuration, hosted checkout link, `providerOrderCode`, public webhook, signature verification, return/cancel flow và webhook registration.
- Nguyễn Quang Huy giữ Payment domain state, COD, checkout idempotency, callback history/duplicate guard, late-paid/refund rule sau khi provider payload đã được Thành xác minh.
- Endpoint webhook chuẩn: `POST /api/payments/payos/webhook`; webhook không dùng JWT nhưng phải pass Checksum Key signature verification.
- Local development phải publish backend qua HTTPS tunnel. `PAYOS_WEBHOOK_URL` có dạng `https://<tunnel-domain>/api/payments/payos/webhook`.
- Branch/author: `feature/thanh-payos-payment`, `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.

Chi tiết nằm tại `docs/srs-sds-reconciliation/06_ACCOUNT_MEDIA_NOTIFICATION_ADDRESS_PLAN.md`.

## 12. Notification Ownership Transfer Addendum (2026-07-23)

Addendum này chỉ supersede ongoing ownership và maintenance của Notification kể từ ngày 2026-07-23; không thay đổi bằng chứng hay lịch sử baseline do Nguyễn Ngọc Thành triển khai theo addendum 2026-07-20.

- Nguyễn Quang Huy sở hữu Notification model/service/API, in-app bell/dropdown/list/detail, read/unread/delete, domain-event consumption và retry status.
- Nhật/Cường và các module khác phát domain event idempotent theo Notification contract của Huy.
- Nguyễn Ngọc Thành vẫn sở hữu EmailOutbox, Gmail SMTP/email delivery, OTP/password reset, public contact email, PayOS, Audit và final integration.
- `feature/huy-notification-ownership-docs` là branch ownership-docs only. Branch code Notification tương lai là `feature/huy-notification-domain` (TBD, chưa tạo), author `Nguyễn Quang Huy <quanghuyn267@gmail.com>`.
