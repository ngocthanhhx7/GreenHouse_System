# GreenHome Kitchen System - Team Implementation Overview

## 1. Project Goal

Mục tiêu của bộ plan này là chia rõ phần việc triển khai GreenHome Kitchen System cho 5 thành viên nhóm, để mỗi người đều có:

- Module nghiệp vụ quan trọng.
- Cả frontend và backend.
- API, database/model, validation và test checklist rõ ràng.
- Branch/PR riêng để mentor theo dõi tiến độ trên GitHub.
- Demo script riêng để chứng minh phần mình làm có giá trị.

Core workflow cần ưu tiên:

`Product -> Cart -> Checkout -> Order -> Payment/COD -> Staff Processing -> Warehouse Stock -> Delivery -> Review/Return/Refund/Support -> Admin Reports/Audit`

## 2. Team Member Ownership Matrix

| Thành viên | Vai trò chính | Module sở hữu | Frontend chính | Backend chính | Flow mentor có thể kiểm tra |
|---|---|---|---|---|---|
| Nguyễn Ngọc Thành | Team lead, storefront foundation, integration | Home, About, Contact, Auth/RBAC, layout, shared API client, audit foundation, PayOS gateway/webhook, final merge | Home, About, Contact, Login, Register, Profile, Role Guard, Layout, PayOS redirect/result | User, Role, Auth, JWT, Authorization, Audit helper, PayOS adapter/webhook | Guest browse Home/About/Contact, register/login, role redirect, forbidden access, online payment qua PayOS |
| Phạm Thành Chung | Catalog owner | Product, Category, Public Catalog, Search/Filter | Product Listing, Product Detail, Admin Product/Category; hỗ trợ dữ liệu sản phẩm cho Home | Product, Category, catalog APIs, admin product/category APIs | Guest browse/search/filter/view product, Admin manage product |
| Nguyễn Quang Huy | Customer purchase & Notification domain owner | Cart, Checkout, Order, Payment state, COD, Order History, Cancel, Notification domain foundation; không sở hữu tích hợp cổng PayOS | Cart, Checkout, Order History, Order Detail, Notification bell/dropdown/list | Cart, CartItem, Order, OrderDetail, Payment domain state, Notification model/service/API | Customer add cart, tạo online order/COD, cancel Pending unpaid order, read/unread/delete in-app notification |
| Nguyễn Hữu Anh Nhật | Staff operation owner | Staff Order Processing, Invoice, Order Status, Return/Refund handling | Staff Dashboard, Order Queue, Order Detail, Invoice, Refund Queue | Staff order APIs, order state machine, ReturnRefundRequest | Staff confirm order, request export, ship/deliver, approve/reject refund |
| Lê Vũ Cường | Warehouse/admin closure owner | Inventory, Stock Export, Replenishment, Support, Review, Reports, Settings; phát domain event cho Notification của Huy | Warehouse screens, Support, Review, Admin Reports/Settings | Inventory, Transaction, StockExport, Replenishment, Support, Review, Report, Setting | Warehouse export/adjust stock, low-stock replenishment, support/review/report |

## 3. Phase Roadmap

| Phase | Tên phase | Owner chính | Mục tiêu | Output cần pull lên GitHub |
|---|---|---|---|---|
| Phase 1 | Foundation/Auth/Layout/Role | Nguyễn Ngọc Thành | Tạo nền tảng app, auth, role guard, shared API/error format | PR auth + layout + middleware |
| Phase 2 | Product/Catalog | Phạm Thành Chung | Tạo product/category và public catalog | PR product/category models/APIs/screens |
| Phase 3 | Cart/Checkout/Order | Nguyễn Quang Huy | Customer mua hàng được từ cart tới order | PR cart/order models/APIs/screens |
| Phase 4 | Payment/COD/Email/Notification | Nguyễn Ngọc Thành + Nguyễn Quang Huy | Thành sở hữu PayOS và EmailOutbox/SMTP/OTP/contact delivery; Huy giữ Payment state/COD và Notification domain foundation; các module phát event theo contract của Huy | PR PayOS + payment state + email delivery + notification integration |
| Phase 5 | Staff Processing | Nguyễn Hữu Anh Nhật | Staff xử lý order theo trạng thái hợp lệ | PR staff queue/detail/status/invoice |
| Phase 6 | Warehouse/Inventory | Lê Vũ Cường | Warehouse xuất kho, điều chỉnh tồn, transaction, low-stock | PR inventory/export/replenishment |
| Phase 7 | Return/Refund/Support/Review | Nguyễn Hữu Anh Nhật + Lê Vũ Cường | After-sale workflows hoạt động | PR refund/support/review |
| Phase 8 | Admin Reports/Audit/Polish | Nguyễn Ngọc Thành + Lê Vũ Cường | Report, audit, settings, polish, testing | PR reports/audit/settings/final fixes |

## 4. GitHub Workflow

Branch format:

| Thành viên | Branch gợi ý |
|---|---|
| Nguyễn Ngọc Thành | `feature/thanh-auth-rbac-foundation`; PayOS dùng `feature/thanh-payos-payment` |
| Phạm Thành Chung | `feature/chung-product-catalog` |
| Nguyễn Quang Huy | Cart/Order/Payment: `feature/huy-cart-order-payment`; Notification ownership docs only: `feature/huy-notification-ownership-docs`; future Notification code: `feature/huy-notification-domain` (TBD, chưa tạo) |
| Nguyễn Hữu Anh Nhật | `feature/nhat-staff-refund-flow` |
| Lê Vũ Cường | `feature/cuong-warehouse-admin-after-sale` |

Pull request format:

```md
## Module
- Tên module:
- Owner:
- Phase:

## Frontend files
- `client/src/...`

## Backend files
- `server/src/...`

## APIs
- Method + endpoint + permission

## Manual test evidence
- Account used:
- Steps tested:
- Result:

## Notes/Risks
- Remaining dependency:
- Known limitation:
```

PR rules:

- Mỗi PR tập trung vào một phase/module, không gom quá lớn.
- PR phải có frontend và backend nếu module có UI và API.
- Không merge nếu phá role guard, auth hoặc core purchase flow.
- Nếu một người làm thay phần của người khác, vẫn commit/branch theo ownership để mentor thấy tracking rõ.

## 5. Dependency Map

| Dependency | Vì sao quan trọng | Người cần phối hợp |
|---|---|---|
| Auth/RBAC trước tất cả private modules | Cart, staff, warehouse, admin đều cần JWT và role guard | Thành -> tất cả |
| Product APIs trước Cart | Cart cần product active, price, stock visibility | Chung -> Huy |
| Order APIs trước Staff Processing | Staff queue xử lý order đã tạo từ Customer | Huy -> Nhật |
| Staff status trước Warehouse Export hoàn chỉnh | Warehouse export gắn với order đã Confirmed/StockExportRequested | Nhật -> Cường |
| Notification contract trước integration polish | Các module phát domain event cần contract và trạng thái retry của Notification | Huy -> Nhật/Cường/Thành |
| Audit helper dùng chung | Mọi mutation quan trọng phải log | Thành -> tất cả |

## 6. Definition of Done

Một module được xem là hoàn thành khi có đủ:

- [ ] Frontend screen/page hoặc component cần thiết.
- [ ] Backend route/controller/service/model nếu module có dữ liệu.
- [ ] API service ở frontend để gọi backend.
- [ ] Validation input cơ bản.
- [ ] Error handling rõ ràng.
- [ ] Role guard ở frontend và backend.
- [ ] Manual test checklist có kết quả.
- [ ] Demo script cho mentor.
- [ ] PR description ghi rõ files, APIs, test evidence.

## 7. Phase Checklist

### Phase 1 - Foundation/Auth/Layout/Role

- [ ] User model.
- [ ] Role model.
- [ ] Register/login APIs.
- [ ] JWT auth middleware.
- [ ] Role authorization middleware.
- [ ] React API client.
- [ ] Login/Register/Profile screens.
- [ ] Role-based route guard.

### Phase 2 - Product/Catalog

- [ ] Category model/API.
- [ ] Product model/API.
- [ ] Public product listing/search/filter.
- [ ] Product detail.
- [ ] Admin product/category screens.

### Phase 3 - Cart/Checkout/Order

- [ ] Cart/CartItem model/API.
- [ ] Checkout stock validation.
- [ ] Order/OrderDetail model/API.
- [ ] Customer order history/detail.
- [ ] Cancel Pending unpaid order.

### Phase 4 - Payment/COD/Email/Notification

- [ ] Payment model/API.
- [ ] COD order payment status.
- [x] PayOS hosted payment link và signature-verified webhook do Nguyễn Ngọc Thành sở hữu.
- [x] Payment page redirect sang hosted checkout và result page cho PayOS.
- [ ] Nguyễn Ngọc Thành: EmailOutbox/Gmail email delivery hook.
- [ ] Nguyễn Quang Huy: Notification domain/in-app event consumption hook.

### Phase 5 - Staff Processing

- [ ] Staff order queue.
- [ ] Confirm order.
- [ ] Request stock export.
- [ ] Print invoice view.
- [ ] Packed/Shipped/Delivered status update.

### Phase 6 - Warehouse/Inventory

- [ ] Inventory model/API.
- [ ] Inventory transaction.
- [ ] Stock export queue.
- [ ] Warehouse approve/export stock.
- [ ] Low-stock alert.
- [ ] Replenishment request.

### Phase 7 - Return/Refund/Support/Review

- [ ] Customer return/refund request.
- [ ] Staff approve/reject refund.
- [ ] Support request and staff response.
- [ ] Product review eligibility.

### Phase 8 - Admin Reports/Audit/Polish

- [ ] Audit log view/filter.
- [ ] Revenue/order/product/inventory reports.
- [ ] System settings.
- [ ] Final integration test.
- [ ] Final mentor demo script.

## 8. Mentor Tracking Board

| Member | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 | Phase 8 |
|---|---|---|---|---|---|---|---|---|
| Nguyễn Ngọc Thành | Auth/RBAC | Support product integration | Support order integration | PayOS gateway/webhook + payment auth/email integration | Review staff permissions | Review warehouse permissions | Review after-sale permissions | Audit/final merge |
| Phạm Thành Chung | Wait for auth | Product/catalog main | Product data support | Product display support | Product info support | Stock visibility support | Review display support | Product report support |
| Nguyễn Quang Huy | Wait for auth | Need product APIs | Cart/order main | Payment state/COD + Notification domain; không giữ PayOS credentials/webhook | Order data support | Notification event contract | Notification event contract | Order report + notification data support |
| Nguyễn Hữu Anh Nhật | Wait for auth | Need product/order data later | Need order APIs | Need payment status | Staff main | Export dependency | Refund main | Staff report support |
| Lê Vũ Cường | Wait for auth | Need product model | Need order model | Phát warehouse event theo contract Huy | Need staff export request | Warehouse main | Support/review main + event emission | Report/settings main + event emission |

## 9. Final Integration Demo Order

1. Guest xem Home/Product Listing/Product Detail.
2. Guest register account.
3. Customer login.
4. Customer add product to cart.
5. Customer checkout COD.
6. Staff confirm order and request stock export.
7. Warehouse approve/export stock.
8. Staff update Packed -> Shipped -> Delivered.
9. Customer review product.
10. Customer submit return/refund or support request.
11. Staff process return/refund/support.
12. Admin view reports and audit logs.

## Ownership Addendum 2026-07-20

| Thành viên | Phần phải thực hiện và bàn giao |
|---|---|
| Nguyễn Ngọc Thành | Home, About, Contact, layout tài khoản dùng chung, upload foundation, hồ sơ/avatar, Address Book API nền tảng, Notification API/UI historical baseline và review/merge |
| Phạm Thành Chung | Upload ảnh sản phẩm, preview/sắp xếp/chọn ảnh đại diện trong Product Management |
| Nguyễn Quang Huy | Tích hợp địa chỉ đã lưu/mặc định và nhập địa chỉ mới vào Checkout; lưu snapshot địa chỉ trong Order |
| Nguyễn Hữu Anh Nhật | Staff Order, Return/Refund, Support; phát event theo Notification contract của Thành |
| Lê Vũ Cường | Warehouse, Reports, Settings; phát event tồn kho/replenishment, không sở hữu bell/read/delete notification |

### Addendum 2026-07-22 - Email Và Validation

- Nguyễn Ngọc Thành sở hữu email delivery foundation dùng Gmail SMTP/App Password, password reset OTP 6 số (hash-only + payload mã hóa, TTL/cooldown/attempt limit), public contact email và delivery/retry/read status theo baseline tại thời điểm 2026-07-22; Nguyễn Quang Huy phát sự kiện `ORDER_CREATED` idempotent sau khi transaction tạo đơn thành công. Ongoing in-app Notification ownership chỉ chuyển sang Huy theo addendum 2026-07-23 bên dưới.
- Validation áp dụng cho toàn hệ thống ở cả frontend và backend. Thành sở hữu primitive validator, request-schema adapter và error envelope; mỗi module owner vẫn sở hữu rule trạng thái/invariant nghiệp vụ và test của module mình.

### Addendum 2026-07-22 - PayOS Online Payment

- Nguyễn Ngọc Thành là owner của tích hợp cổng PayOS: SDK backend, tạo hosted checkout link, biến môi trường, return/cancel URL, xác minh signature webhook, đăng ký webhook và xử lý integration/frontend redirect.
- Nguyễn Quang Huy tiếp tục sở hữu Cart, Checkout, Order, Payment domain state, COD, idempotency và late-payment/refund business rule; không giữ PayOS credential, provider adapter hoặc webhook public.
- Webhook chuẩn là `POST /api/payments/payos/webhook`. Khi chạy local phải dùng HTTPS tunnel tới port backend; `localhost` không thể nhận callback trực tiếp từ PayOS.
- Branch triển khai PayOS: `feature/thanh-payos-payment`, commit bằng `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.
- Mọi lỗi validation phải có thông báo tiếng Việt rõ ràng theo từng trường; backend là nguồn xác thực cuối cùng, frontend không được thay thế backend validation.
- `docs/superpowers/` và `docs/ui-prompts/` là tài liệu làm việc local, không theo dõi hoặc push lên Git. Thay đổi ownership/scope chính thức phải được phản ánh trong `docs/member-plans/`.

### Addendum 2026-07-23 - Notification Ownership Transfer

Addendum này chỉ supersede ownership vận hành và bảo trì Notification kể từ ngày 2026-07-23; không sửa hoặc xóa lịch sử triển khai baseline của Nguyễn Ngọc Thành được ghi nhận trong addendum 2026-07-20.

- Nguyễn Quang Huy sở hữu ongoing Notification domain foundation: model/service/API, in-app UI bell/dropdown/list/detail, read/unread/delete, event consumption và retry status.
- Nhật/Cường và các module khác chỉ phát domain event idempotent theo Notification contract của Huy.
- Nguyễn Ngọc Thành tiếp tục sở hữu EmailOutbox, Gmail SMTP/email delivery, OTP/password reset, public contact email, PayOS, Audit và final integration.
- Branch `feature/huy-notification-ownership-docs` chỉ dùng cho ownership docs. Branch code Notification dự kiến là `feature/huy-notification-domain` (TBD, chưa tạo), author `Nguyễn Quang Huy <quanghuyn267@gmail.com>`.

Không đưa Profile/Notifications vào dashboard nghiệp vụ. Header public/customer có bell dropdown; dashboard nội bộ dùng topbar vận hành và không có giỏ hàng.
