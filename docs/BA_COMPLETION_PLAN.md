# GreenHome Kitchen Website - BA Completion Plan

## A. Executive Summary

GreenHome Kitchen System là website thương mại điện tử bán sản phẩm nhà bếp như cookware, tableware, kitchen tools, cleaning supplies và kitchen storage items. Hệ thống sử dụng MERN stack: React.js + Bootstrap ở frontend, Node.js + Express ở backend, MongoDB + Mongoose ở database. Backend đi theo kiến trúc Routes -> Controllers -> Services -> Models, có JWT authentication/authorization và phân quyền theo role.

Mục tiêu hoàn thiện website là đảm bảo developer có một bản nghiệp vụ đủ rõ để triển khai đúng core e-commerce workflow:

Product catalog -> Cart -> Checkout -> Order -> Payment/COD -> Staff processing -> Warehouse stock export/inventory -> Delivery status -> Review/Return/Refund/Support -> Admin reports/audit.

Các điểm trong SRS/SDS hiện tại cần kiểm tra lại:

| Vấn đề | Nhận xét BA | Hướng xử lý đề xuất |
|---|---|---|
| Glossary/definition bị lỗi format | Một số đoạn business rule bị dính vào định nghĩa thuật ngữ | Sửa lại glossary, tách business rule về đúng section |
| Trùng mã requirement | `FR-IWM-12` xuất hiện cho 2 requirement khác nhau | Đổi mã thành `FR-IWM-12` và `FR-IWM-13` |
| Luồng giảm tồn kho chưa chốt rõ | Có thể hiểu giảm tồn khi Staff confirm order hoặc khi Warehouse export | Chọn giảm tồn khi Warehouse xác nhận export; trước đó chỉ check/reserve nếu cần |
| Replenishment owner chưa thống nhất | Có chỗ ghi Staff tạo, có chỗ ghi Warehouse Manager tạo | Chốt Warehouse Manager tạo replenishment request, Admin approve/reject |
| Return/refund scope dễ bị rộng | SDS có nhắc cancel with refund, nhưng SRS giới hạn Customer chỉ cancel Pending unpaid | Chốt cancel trực tiếp chỉ áp dụng Pending unpaid; refund đi qua Return/Refund sau Delivered |
| API contract còn thiếu | SDS mô tả package/class/sequence nhưng chưa đủ endpoint, request/response, validation | Bổ sung API plan RESTful chi tiết |
| Data schema còn ở mức dictionary | Thiếu enum, index, constraint, soft delete/status | Bổ sung schema recommendation theo MongoDB/Mongoose |

Phạm vi nên làm trong project WDP301:

- Product/category management.
- Public catalog/search/filter.
- Authentication, authorization, role-based UI/API.
- Cart, checkout, order placement.
- COD và online payment ở mức sandbox/mock.
- Staff order processing.
- Warehouse inventory, stock export, stock adjustment, low-stock alert.
- Return/refund, support/complaint, product review.
- Notification/email cơ bản.
- Admin dashboard/report cơ bản.
- Audit log cho hành động quan trọng.

Phạm vi không nên làm:

- Native mobile app.
- Real-time delivery tracking.
- Shipper management.
- AI recommendation.
- Promotion/voucher/discount engine.
- Advanced accounting.
- Multi-warehouse hoặc logistics optimization.
- Full financial reconciliation với ngân hàng.

## B. Scope Definition

### In-scope Features

| Nhóm | Feature |
|---|---|
| Account & Access | Register, login, logout, profile, JWT, role-based access |
| Product | Product CRUD, category CRUD, active/inactive status |
| Catalog | Browse, search, filter, product detail, product reviews |
| Cart | Add/update/remove cart item, cart total, stock validation |
| Order | Checkout, order creation, order history, order status, cancel valid order |
| Payment | COD, online payment request, callback, payment status |
| Staff | Confirm order, request stock export, print invoice, pack, ship, deliver |
| Warehouse | Inventory list, stock update, adjustment, low-stock alert, export request |
| Replenishment | Warehouse creates request, Admin approves/rejects, Warehouse receives goods |
| Return/Refund | Customer request, Staff approve/reject, status/email/audit |
| Support | Customer complaint/support request, Staff response/resolution |
| Review | Review purchased delivered product |
| Notification | Email/notification records for key events |
| Admin | Users, roles, staff accounts, settings, reports, audit log |

### Out-of-scope Features

| Feature | Lý do loại khỏi scope |
|---|---|
| Native mobile app | Không cần cho WDP301 web project |
| Shipper management | Vượt phạm vi warehouse/order processing |
| Real-time delivery tracking | Cần hệ thống vận chuyển ngoài |
| Promotion/voucher | Dễ làm phức tạp checkout/payment |
| AI recommendation | Không phải nghiệp vụ lõi |
| Advanced accounting | Không yêu cầu quản trị kế toán |
| Multi-warehouse | Làm phức tạp inventory và stock allocation |

### Assumptions

- Mỗi user có đúng một role.
- Guest chỉ dùng public screens.
- Customer phải login để dùng cart, checkout, order, review, return/refund, support.
- Online payment có thể dùng mock/sandbox gateway.
- Email Service có thể dùng SMTP, mock provider hoặc service wrapper.
- Reports là dữ liệu tổng hợp tính theo query, không cần collection riêng.
- Hệ thống chỉ quản lý một kho hàng.
- Delivery status do Staff cập nhật thủ công.

### Dependencies

| Dependency | Mục đích | Rủi ro | Mitigation |
|---|---|---|---|
| MongoDB | Lưu toàn bộ business data | Inconsistent khi checkout/payment/inventory lỗi giữa chừng | Dùng service transaction nếu có replica set; nếu không dùng idempotency + compensation |
| Payment Gateway | Xử lý online payment | Timeout, duplicate callback, failed payment | Lưu payment request, verify callback, idempotent update |
| Email Service | Gửi email notification | Email fail gây hiểu nhầm | Không rollback order nếu email fail; lưu delivery status |
| JWT middleware | Auth/private APIs | Token hết hạn hoặc role sai | Chuẩn hóa `401/403`, refresh login flow nếu cần |
| System settings | Return period, low-stock threshold | Config sai ảnh hưởng nghiệp vụ | Validate type/range, audit update |

### Technical Constraints

- Frontend dùng React.js + Bootstrap.
- Backend dùng Node.js + Express.
- Database dùng MongoDB + Mongoose.
- API theo RESTful style.
- Password phải hash.
- Không lưu thông tin thẻ/payment sensitive.
- Role/permission phải enforce ở backend, không chỉ ẩn UI.
- Audit log là append-only/read-only.

## C. Actor & Permission Matrix

| Actor | Quyền truy cập | Màn hình được dùng | Chức năng được phép | Chức năng bị cấm | Ghi chú nghiệp vụ |
|---|---|---|---|---|---|
| Guest | Public only | Home, Product Listing, Search Result, Product Detail, Register, Login | Xem sản phẩm, tìm kiếm, lọc, xem chi tiết, xem review, đăng ký | Cart, checkout, order history, review, return/refund, support, internal screens | Chỉ thấy active products/categories |
| Customer | Customer-owned data | Profile, Cart, Checkout, Payment, Order History, Order Detail, Review, Return/Refund, Support, Notifications | Quản lý profile/cart/order, COD/online payment, hủy order hợp lệ, review, return/refund, support | Xem order người khác, quản trị product/user/inventory/report/audit | Mọi query phải filter theo `customerId` |
| Staff | Order/support/refund processing | Staff Dashboard, Order Queue, Order Detail, Invoice, Return/Refund Queue, Support Queue, Damaged Report | Xác nhận đơn, yêu cầu xuất kho, in invoice, cập nhật order status, xử lý refund/support, báo hỏng | Quản lý user/role/product/category/system settings, điều chỉnh stock trực tiếp | Chỉ update order theo state machine |
| Warehouse Manager | Inventory operations | Inventory, Inventory Detail, Low Stock, Stock Export Queue, Inventory Transactions, Replenishment | Cập nhật/điều chỉnh tồn, xử lý stock export, tạo replenishment, xem transaction | Confirm payment, sửa order/customer/user/product master data | Inventory không được âm |
| Admin | Full admin/config/report | Admin Dashboard, Products, Categories, Users/Roles, Reports, Audit Logs, System Settings, Replenishment Approval | Quản lý master data, user/role, settings, reports, audit, approve replenishment | Can thiệp cart riêng của customer, sửa audit log | Audit log chỉ được xem/filter |
| Payment Gateway | Integration callback | N/A | Nhận payment request, trả payment response/callback | Truy cập dữ liệu nội bộ | Callback phải verify và idempotent |
| Email Service | Integration response | N/A | Nhận email dispatch request, trả delivery status | Truy cập dữ liệu nghiệp vụ ngoài payload email | Email failure phải được log |

## D. Module Breakdown

### 1. Authentication & Authorization

| Item | Detail |
|---|---|
| Mục tiêu | Đăng ký, đăng nhập, xác thực JWT và phân quyền theo role |
| Actor | Guest, Customer, Staff, Warehouse Manager, Admin |
| User stories | Guest đăng ký tài khoản Customer; User login và vào đúng dashboard; Admin quản lý user/role |
| Functional requirements | Register, validate input, prevent duplicate email, login, hash password, disabled account block, role redirect, role middleware |
| Business rules | Mỗi user có một role; disabled account không login; user chỉ dùng chức năng theo role |
| Screens | Register, Login, Profile, Admin User/Role |
| APIs | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /users/me`, admin user/role APIs |
| Collections | User, Role, AuditLog |
| Validation | Email unique/format, password length, required fullName/phone/address, valid role |
| Error cases | Duplicate email, invalid credentials, disabled account, expired token, forbidden role |
| Acceptance criteria | User login nhận JWT; sai role bị `403`; disabled account không login được; password không lưu plain text |
| Priority | Must Have |

### 2. Product Browsing/Search/Filter

| Item | Detail |
|---|---|
| Mục tiêu | Cho Guest/Customer xem danh mục sản phẩm active |
| Actor | Guest, Customer |
| User stories | User xem list, tìm kiếm theo keyword, lọc category/price/availability, xem detail |
| Functional requirements | Browse catalog, search, filter, pagination, product detail, display stock status/reviews |
| Business rules | Chỉ active products/categories hiển thị public |
| Screens | Home, Product Listing, Search Result, Product Detail |
| APIs | `GET /products`, `GET /products/:id`, `GET /categories`, `GET /products/:id/reviews` |
| Collections | Product, Category, Inventory, ProductReview |
| Validation | Query params hợp lệ, price range không âm, category tồn tại |
| Error cases | No matching product, product inactive/not found |
| Acceptance criteria | Public catalog không trả inactive product; search/filter trả kết quả đúng và có message khi rỗng |
| Priority | Must Have |

### 3. Product & Category Management

| Item | Detail |
|---|---|
| Mục tiêu | Admin quản lý master data sản phẩm và danh mục |
| Actor | Admin |
| User stories | Admin thêm/sửa/disable product/category |
| Functional requirements | CRUD product/category, assign category, manage status, store image URL, price, unit |
| Business rules | Product active cần category active và inventory record trước khi bán |
| Screens | Product Management, Product Form, Category Management |
| APIs | `POST/PATCH /admin/products`, `PATCH /admin/products/:id/status`, category admin APIs |
| Collections | Product, Category, Inventory, AuditLog |
| Validation | Name required, price > 0, category exists, status enum |
| Error cases | Duplicate category, invalid price, disabling category with active products |
| Acceptance criteria | Admin mutation tạo audit log; public chỉ thấy active data |
| Priority | Must Have |

### 4. Cart Management

| Item | Detail |
|---|---|
| Mục tiêu | Customer quản lý giỏ hàng trước checkout |
| Actor | Customer |
| User stories | Customer add/update/remove item và xem total |
| Functional requirements | One active cart/customer, add item, merge same product, update quantity, remove item, calculate subtotal/total |
| Business rules | Customer phải login; quantity không vượt available stock; cart có item mới checkout |
| Screens | Cart |
| APIs | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id` |
| Collections | ShoppingCart, CartItem, Product, Inventory |
| Validation | Quantity integer > 0, product active, stock enough |
| Error cases | Out of stock, inactive product, cart item not found |
| Acceptance criteria | Update cart phản ánh total đúng; vượt stock bị chặn |
| Priority | Must Have |

### 5. Checkout & Order Placement

| Item | Detail |
|---|---|
| Mục tiêu | Tạo order từ cart hợp lệ |
| Actor | Customer |
| User stories | Customer checkout, xác nhận địa chỉ, chọn payment method |
| Functional requirements | Validate cart, stock check, create Order/OrderDetail, snapshot price/name, clear/mark cart after order |
| Business rules | Cart không rỗng; ordered quantity <= available stock; initial order status Pending hoặc WaitingForPayment |
| Screens | Checkout, Order Confirmation |
| APIs | `POST /orders`, `GET /orders/:id` |
| Collections | Order, OrderDetail, Cart, CartItem, Inventory, Payment, AuditLog |
| Validation | Shipping address required, paymentMethod enum, stock enough |
| Error cases | Empty cart, price changed, stock insufficient, duplicate submit |
| Acceptance criteria | Order tạo đúng line items/snapshot/total; duplicate checkout không tạo nhiều order |
| Priority | Must Have |

### 6. Payment Management

| Item | Detail |
|---|---|
| Mục tiêu | Quản lý COD và online payment |
| Actor | Customer, Payment Gateway, System |
| User stories | Customer chọn COD hoặc online payment; gateway callback cập nhật payment |
| Functional requirements | Create payment request, callback, retry failed payment, update payment/order status, record transaction |
| Business rules | Payment amount khớp order total; Paid thì update payment status; failed/cancelled phải lưu đúng |
| Screens | Payment, Payment Result, Order Detail |
| APIs | `POST /orders/:id/payments`, `POST /payments/callback`, `GET /orders/:id/payment` |
| Collections | Payment, Order, Notification, AuditLog |
| Validation | Valid order, amount match, signature/callback token nếu có |
| Error cases | Gateway timeout, duplicate callback, invalid amount, cancelled payment |
| Acceptance criteria | Callback idempotent; payment success chuyển Paid; failed cho retry |
| Priority | Must Have |

### 7. Customer Order History & Cancel Order

| Item | Detail |
|---|---|
| Mục tiêu | Customer xem đơn của mình và hủy khi hợp lệ |
| Actor | Customer |
| User stories | Customer xem purchase history, order status, cancel Pending unpaid order |
| Functional requirements | List own orders, detail own order, status timeline, cancel valid order |
| Business rules | Customer chỉ xem order của mình; chỉ cancel Pending và unpaid |
| Screens | Order History, Order Detail |
| APIs | `GET /orders/my`, `GET /orders/:id`, `PATCH /orders/:id/cancel` |
| Collections | Order, OrderDetail, Payment, Inventory, AuditLog |
| Validation | Ownership, cancellable status, unpaid |
| Error cases | Order not found, forbidden, already paid/confirmed |
| Acceptance criteria | Paid/confirmed order không cancel được; cancel tạo audit log |
| Priority | Must Have |

### 8. Staff Order Processing

| Item | Detail |
|---|---|
| Mục tiêu | Staff xử lý order theo workflow |
| Actor | Staff |
| User stories | Staff filter order, confirm, request stock export, print invoice, update packed/shipped/delivered |
| Functional requirements | Order queue, filter status/date/priority, confirm, status transition, invoice print |
| Business rules | Staff chỉ update theo luồng hợp lệ; nếu insufficient stock khi confirm thì không confirm |
| Screens | Staff Dashboard, Order Queue, Order Detail, Invoice |
| APIs | `GET /staff/orders`, `POST /staff/orders/:id/confirm`, `PATCH /staff/orders/:id/status`, `GET /staff/orders/:id/invoice` |
| Collections | Order, OrderDetail, Inventory, StockExportRequest, Notification, AuditLog |
| Validation | Allowed transition, payment requirement, stock enough |
| Error cases | Invalid transition, unpaid online order, insufficient stock |
| Acceptance criteria | Chỉ hiện action hợp lệ theo status; customer nhận email status quan trọng |
| Priority | Must Have |

### 9. Warehouse Inventory Management

| Item | Detail |
|---|---|
| Mục tiêu | Quản lý tồn kho chính xác và có trace |
| Actor | Warehouse Manager |
| User stories | Warehouse xem inventory, update/adjust stock, xem low-stock |
| Functional requirements | Inventory list/detail, stock update, manual adjustment, low-stock alert, transaction log |
| Business rules | Inventory không âm; mọi stock movement tạo transaction |
| Screens | Inventory List, Inventory Detail, Low Stock, Transactions |
| APIs | `GET /warehouse/inventory`, `PATCH /warehouse/inventory/:id`, `POST /warehouse/inventory/:id/adjust`, `GET /warehouse/inventory-transactions` |
| Collections | Inventory, InventoryTransaction, Product, AuditLog |
| Validation | Quantity integer >= 0, reason required for adjustment |
| Error cases | Negative result, product not found, concurrent update conflict |
| Acceptance criteria | Stock update tạo transaction; low-stock alert cập nhật đúng |
| Priority | Must Have |

### 10. Stock Export & Replenishment

| Item | Detail |
|---|---|
| Mục tiêu | Liên kết Staff order processing với Warehouse stock movement |
| Actor | Staff, Warehouse Manager, Admin |
| User stories | Staff request export; Warehouse approve/export; Warehouse create replenishment; Admin approve/reject |
| Functional requirements | Export request lifecycle, stock deduction on export, replenishment request lifecycle, receive stock |
| Business rules | Warehouse xử lý export; Admin approve replenishment trước khi nhập hàng |
| Screens | Stock Export Queue, Replenishment List/Form, Admin Replenishment Approval |
| APIs | Stock export and replenishment APIs |
| Collections | StockExportRequest, ReplenishmentRequest, Inventory, InventoryTransaction, AuditLog |
| Validation | Valid order/product, sufficient stock, quantity > 0 |
| Error cases | Duplicate export request, insufficient stock, rejected replenishment |
| Acceptance criteria | Exported request giảm stock và tạo transaction; approved replenishment có thể receive stock |
| Priority | Should Have |

### 11. Return/Refund Management

| Item | Detail |
|---|---|
| Mục tiêu | Xử lý return/refund sau khi order Delivered |
| Actor | Customer, Staff |
| User stories | Customer tạo request; Staff approve/reject; system gửi email |
| Functional requirements | Request form, eligibility check, staff queue, approve/reject, refund status update |
| Business rules | Chỉ Delivered và trong return period; Staff quyết định; approved thì order Returned/payment Refunded nếu áp dụng |
| Screens | Return/Refund Form, My Requests, Staff Return/Refund Queue |
| APIs | `POST /orders/:id/return-refunds`, `GET /staff/return-refunds`, `PATCH /staff/return-refunds/:id/status` |
| Collections | ReturnRefundRequest, Order, Payment, Notification, AuditLog |
| Validation | Delivered, within period, reason required, valid items |
| Error cases | Expired period, duplicate active request, invalid status transition |
| Acceptance criteria | Request không hợp lệ bị chặn; approve/reject gửi notification và audit |
| Priority | Must Have |

### 12. Support/Complaint Management

| Item | Detail |
|---|---|
| Mục tiêu | Customer gửi support/complaint và Staff phản hồi |
| Actor | Customer, Staff |
| User stories | Customer submit support; Staff reply/resolve |
| Functional requirements | Create request, list own requests, staff queue, update status/response |
| Business rules | Support request có status New/InProgress/Resolved/Closed |
| Screens | Support Form, My Support Requests, Staff Support Queue |
| APIs | `POST /support-requests`, `GET /support-requests/my`, staff support APIs |
| Collections | SupportRequest, User, Order, AuditLog |
| Validation | Subject/content required, order belongs to customer nếu có orderId |
| Error cases | Empty content, forbidden order, invalid status |
| Acceptance criteria | Staff response lưu được; Customer chỉ thấy request của mình |
| Priority | Should Have |

### 13. Product Review

| Item | Detail |
|---|---|
| Mục tiêu | Customer review sản phẩm đã mua và đã Delivered |
| Actor | Customer |
| User stories | Customer viết review từ delivered order/product detail |
| Functional requirements | Eligibility check, rating/content form, display reviews |
| Business rules | Chỉ review purchased product có order Delivered |
| Screens | Review Form, Product Detail |
| APIs | `POST /products/:id/reviews`, `GET /products/:id/reviews` |
| Collections | ProductReview, Order, OrderDetail, Product |
| Validation | Rating 1-5, content length, purchased delivered product |
| Error cases | Not purchased, not delivered, duplicate review |
| Acceptance criteria | Guest thấy review approved/active; customer không review sản phẩm chưa mua |
| Priority | Should Have |

### 14. Notification/Email

| Item | Detail |
|---|---|
| Mục tiêu | Gửi/lưu notification cho sự kiện quan trọng |
| Actor | System, Email Service, User |
| User stories | User nhận email registration/order/payment/status/refund |
| Functional requirements | Create email request, send via provider, store delivery status, list notifications |
| Business rules | Email có recipient/type/subject/content; status Sent/Failed/Pending |
| Screens | Notifications, email templates không cần UI riêng ở v1 |
| APIs | `GET /notifications`, `PATCH /notifications/:id/read` |
| Collections | Notification |
| Validation | Recipient email valid, type enum |
| Error cases | Email service unavailable, send failed |
| Acceptance criteria | Email fail không rollback order; failure được lưu |
| Priority | Should Have |

### 15. Admin Dashboard, Reports & Statistics

| Item | Detail |
|---|---|
| Mục tiêu | Admin xem KPI phục vụ quản lý |
| Actor | Admin |
| User stories | Admin xem revenue/order/product/customer/staff/inventory statistics |
| Functional requirements | Date filter, KPI cards, tables/charts basic |
| Business rules | Reports derived/on-demand; chỉ Admin được xem |
| Screens | Admin Dashboard, Reports |
| APIs | `/admin/reports/*` |
| Collections | Order, Payment, Product, User, Inventory, InventoryTransaction, SupportRequest |
| Validation | Valid date range |
| Error cases | Invalid date range, no data |
| Acceptance criteria | Report filter đúng thời gian; không tạo collection report riêng |
| Priority | Should Have |

### 16. Audit Log

| Item | Detail |
|---|---|
| Mục tiêu | Trace các hành động quan trọng |
| Actor | System, Admin |
| User stories | Admin xem/filter audit log |
| Functional requirements | Log login, user/role/product/order/payment/inventory/refund changes; filter by user/action/time |
| Business rules | Audit log read-only, only Admin can view |
| Screens | Audit Logs |
| APIs | `GET /admin/audit-logs` |
| Collections | AuditLog |
| Validation | Filter params valid |
| Error cases | Unauthorized, invalid date range |
| Acceptance criteria | Không user nào sửa/xóa audit log; mutation quan trọng có log |
| Priority | Must Have |

### 17. System Settings

| Item | Detail |
|---|---|
| Mục tiêu | Cho Admin cấu hình tham số nghiệp vụ cơ bản |
| Actor | Admin |
| User stories | Admin update return period, low-stock threshold default, email/payment flags |
| Functional requirements | View/update settings, typed values, audit update |
| Business rules | Settings thay đổi phải validate và audit |
| Screens | System Settings |
| APIs | `GET /admin/system-settings`, `PATCH /admin/system-settings` |
| Collections | SystemSetting, AuditLog |
| Validation | Key whitelist, value type/range |
| Error cases | Invalid setting, forbidden, invalid type |
| Acceptance criteria | Setting update ảnh hưởng flow tương ứng và tạo audit log |
| Priority | Should Have |

## E. End-to-End Business Flow

### 1. Guest browse/search/view product/register

| Item | Detail |
|---|---|
| Trigger | Guest truy cập website |
| Preconditions | Có active products/categories |
| Main steps | Guest mở Home -> xem product list -> search/filter -> xem detail/review -> chọn Register -> nhập thông tin -> system tạo Customer account |
| Alternative/exception | Không có sản phẩm phù hợp; email đã tồn tại; input invalid; email service fail |
| Data updated | User, Notification nếu đăng ký thành công |
| Notification/email | Registration confirmation |
| Audit log | Optional for register; required nếu team coi register là security event |
| Acceptance criteria | Guest xem được active product; register valid tạo account active; duplicate email bị chặn |

### 2. Customer login -> add cart -> checkout -> COD -> place order

| Item | Detail |
|---|---|
| Trigger | Customer muốn mua hàng COD |
| Preconditions | Customer active/login; product active; stock đủ |
| Main steps | Login -> add cart -> update quantity -> checkout -> nhập/xác nhận shipping address -> chọn COD -> create order Pending -> create payment COD/Pending |
| Alternative/exception | Cart empty; stock insufficient; product inactive; duplicate checkout |
| Data updated | Cart, CartItem, Order, OrderDetail, Payment, AuditLog |
| Notification/email | Order confirmation email |
| Audit log | Order created |
| Acceptance criteria | Order có đúng items/total; paymentMethod COD; Staff thấy order trong queue |

### 3. Customer login -> add cart -> checkout -> online payment -> payment callback

| Item | Detail |
|---|---|
| Trigger | Customer chọn online payment |
| Preconditions | Order exists, amount valid |
| Main steps | Checkout -> choose online payment -> system tạo payment request -> redirect/open gateway -> gateway callback -> verify callback -> update Payment/Order |
| Alternative/exception | Payment failed/cancelled; gateway timeout; duplicate callback; invalid amount |
| Data updated | Order, Payment, Notification, AuditLog |
| Notification/email | Payment status email |
| Audit log | Payment status update |
| Acceptance criteria | Paid callback chỉ update một lần; failed payment cho retry; order unpaid không được complete |

### 4. Staff confirm order -> request stock export -> warehouse approves/export -> staff packs -> shipped -> delivered

| Item | Detail |
|---|---|
| Trigger | Staff xử lý order mới |
| Preconditions | Staff login; order Pending/paid enough for selected method; stock đủ |
| Main steps | Staff mở queue -> confirm order -> request stock export -> Warehouse approve/export -> inventory reduced + transaction -> Staff mark Packed -> Shipped -> Delivered |
| Alternative/exception | Online payment chưa Paid; stock insufficient; export rejected; invalid transition |
| Data updated | Order, StockExportRequest, Inventory, InventoryTransaction, Notification, AuditLog |
| Notification/email | Order confirmed/shipped/delivered |
| Audit log | Confirm, export, status updates |
| Acceptance criteria | Chỉ chuyển status theo luồng; inventory giảm khi export; customer thấy status mới |

### 5. Customer cancel pending unpaid order

| Item | Detail |
|---|---|
| Trigger | Customer bấm Cancel Order |
| Preconditions | Order thuộc Customer, status Pending, payment unpaid |
| Main steps | System verify ownership/status/payment -> update order Cancelled -> release reserved stock nếu có |
| Alternative/exception | Order paid/confirmed/shipped/delivered; order không thuộc customer |
| Data updated | Order, Inventory nếu có reservation, AuditLog |
| Notification/email | Cancel confirmation optional |
| Audit log | Cancel order |
| Acceptance criteria | Pending unpaid cancel thành công; paid/confirmed bị từ chối |

### 6. Customer request return/refund after delivered order

| Item | Detail |
|---|---|
| Trigger | Customer chọn Request Return/Refund |
| Preconditions | Order Delivered, thuộc Customer, trong return period |
| Main steps | Customer chọn items/reason/evidence -> system validate -> create request New -> notify Staff |
| Alternative/exception | Order chưa Delivered; hết hạn; duplicate active request; invalid item |
| Data updated | ReturnRefundRequest, Notification, AuditLog |
| Notification/email | Staff notification; customer confirmation |
| Audit log | Request created |
| Acceptance criteria | Request hợp lệ xuất hiện trong Staff queue |

### 7. Staff approve/reject return/refund and system sends email

| Item | Detail |
|---|---|
| Trigger | Staff xử lý request |
| Preconditions | Request New/InReview |
| Main steps | Staff review -> approve/reject -> nhập note/refund amount nếu approve -> update request/order/payment -> send email |
| Alternative/exception | Invalid transition; refund amount vượt order amount |
| Data updated | ReturnRefundRequest, Order, Payment, Notification, AuditLog |
| Notification/email | Return/refund result email |
| Audit log | Refund decision |
| Acceptance criteria | Approved/rejected request có status rõ; customer nhận kết quả |

### 8. Staff reports damaged product

| Item | Detail |
|---|---|
| Trigger | Staff phát hiện sản phẩm hư trong xử lý đơn |
| Preconditions | Product exists, Staff login |
| Main steps | Staff nhập product, quantity, reason, order reference optional -> system tạo damaged report/transaction hoặc chuyển Warehouse xử lý |
| Alternative/exception | Quantity invalid; product not found; stock không đủ để chuyển damaged |
| Data updated | Inventory, InventoryTransaction, AuditLog |
| Notification/email | Notify Warehouse/Admin optional |
| Audit log | Damaged stock report |
| Acceptance criteria | Damaged quantity/transaction được ghi nhận, sellable stock không âm |

### 9. Warehouse adjusts stock and creates inventory transaction

| Item | Detail |
|---|---|
| Trigger | Warehouse cần chỉnh tồn thực tế |
| Preconditions | Warehouse login; product/inventory exists |
| Main steps | Warehouse nhập adjustment quantity/reason -> system validate non-negative -> update inventory -> create transaction -> refresh low-stock |
| Alternative/exception | Result negative; reason missing; concurrent update |
| Data updated | Inventory, InventoryTransaction, AuditLog |
| Notification/email | Low-stock notification optional |
| Audit log | Inventory adjustment |
| Acceptance criteria | Mọi adjustment có before/after/reason/performedBy |

### 10. Low stock detected -> replenishment request -> Admin approve/reject

| Item | Detail |
|---|---|
| Trigger | Stock below threshold |
| Preconditions | Inventory threshold configured |
| Main steps | System marks low-stock -> Warehouse creates replenishment -> Admin approve/reject -> if approved, Warehouse receives goods -> stock increased |
| Alternative/exception | Duplicate open request; invalid quantity; rejected request |
| Data updated | ReplenishmentRequest, Inventory, InventoryTransaction, AuditLog |
| Notification/email | Admin notification optional |
| Audit log | Replenishment create/approve/receive |
| Acceptance criteria | Approved request mới được receive; received stock tạo transaction |

### 11. Admin manages product/category/user/report/audit log

| Item | Detail |
|---|---|
| Trigger | Admin vận hành hệ thống |
| Preconditions | Admin login |
| Main steps | Admin CRUD master data -> manage user/role -> update settings -> view reports -> filter audit |
| Alternative/exception | Invalid data; duplicate name/email; forbidden operation |
| Data updated | Product, Category, User, Role, SystemSetting, AuditLog |
| Notification/email | Account status email optional |
| Audit log | Required for every admin mutation |
| Acceptance criteria | Admin mutation validated/audited; audit log read-only |

## F. Recommended Screen List & UI Plan

### Public/Guest Screens

| Screen | Purpose | Components | Actions | Data displayed | Validation/error | API consumed |
|---|---|---|---|---|---|---|
| Home | Entry + featured catalog | Header, category nav, best-selling/featured products | Search, view product, register/login | Product cards, categories | Empty catalog | `GET /products`, `GET /categories` |
| Product Listing | Browse/filter products | Filter sidebar, product grid, pagination | Filter, sort, view detail | Name, image, price, availability | No result | `GET /products` |
| Search Result | Show keyword result | Search box, result list | Change keyword/filter | Matching products | Empty keyword/no result | `GET /products?keyword=` |
| Product Detail | Product information | Gallery, product info, stock status, reviews | Add to cart if login, login prompt if guest | Description, price, reviews | Product not found/inactive | `GET /products/:id`, `GET /products/:id/reviews` |
| Register | Create account | Form fields | Submit, go login | N/A | Invalid/duplicate email | `POST /auth/register` |
| Login | Authenticate | Email/password form | Login | N/A | Invalid/disabled account | `POST /auth/login` |

### Customer Screens

| Screen | Purpose | Components | Actions | Data displayed | Validation/error | API consumed |
|---|---|---|---|---|---|---|
| Profile | Manage account | Profile form | Save | Personal info | Invalid phone/email | `GET/PATCH /users/me` |
| Cart | Manage cart | Cart table, quantity controls | Update/remove/checkout | Items, subtotal,total | Quantity > stock | Cart APIs |
| Checkout | Confirm order | Address form, order summary, payment selector | Place order | Items,total,address | Empty cart/stock insufficient | `POST /orders` |
| Payment Result | Show payment result | Status panel | Retry/view order | Payment status | Failed/cancelled | Payment APIs |
| Order History | List orders | Filter/list | View detail | Order code,date,total,status | Empty list | `GET /orders/my` |
| Order Detail | Track order | Timeline, items, payment panel | Cancel/request refund/review | Order details | Invalid action by status | `GET /orders/:id`, cancel/refund APIs |
| Review Form | Submit review | Rating/content | Submit | Product/order info | Rating missing/not eligible | Review APIs |
| Return/Refund Form | Create request | Reason, items, evidence URLs | Submit | Delivered order items | Expired/not delivered | Return/refund APIs |
| Support | Complaint/support | Request form/list | Submit/view response | Requests/status | Empty subject/content | Support APIs |
| Notifications | User notifications | Notification list | Mark read | Message/status | N/A | Notification APIs |

### Staff Screens

| Screen | Purpose | Components | Actions | Data displayed | Validation/error | API consumed |
|---|---|---|---|---|---|---|
| Staff Dashboard | Work summary | KPI cards, urgent queue | Open orders/refunds/support | Counts/status | N/A | Staff summary APIs |
| Order Queue | Process orders | Filters, table | Filter/open/confirm | Order list | Invalid date | `GET /staff/orders` |
| Order Detail | Manage order | Customer info, items, status actions | Confirm, request export, update status, print invoice | Full order | Invalid transition/unpaid | Staff order APIs |
| Invoice Print | Print invoice | Printable layout | Print | Order/customer/items | Order not confirmed | `GET /staff/orders/:id/invoice` |
| Return/Refund Queue | Process refund | Queue/table/detail | Approve/reject | Request info | Invalid transition | Staff refund APIs |
| Support Queue | Handle complaint | Queue/detail/response form | Assign/respond/resolve | Support content | Response missing | Staff support APIs |
| Damaged Report | Report damaged item | Product selector, qty, reason | Submit | Product/order optional | Invalid qty | Inventory/damaged API |

### Warehouse Manager Screens

| Screen | Purpose | Components | Actions | Data displayed | Validation/error | API consumed |
|---|---|---|---|---|---|---|
| Inventory List | View stock | Table, filters | View/edit/adjust | Product, stock, threshold | Empty list | `GET /warehouse/inventory` |
| Inventory Detail/Edit | Update stock | Stock form, history | Save adjustment | Before/after stock | Negative stock/reason missing | Inventory APIs |
| Low Stock Alerts | Monitor low stock | Alert table | Create replenishment | Product, current, threshold | Duplicate request | Low-stock/replenishment APIs |
| Stock Export Queue | Handle export | Queue/detail | Approve/reject/export | Order items/stock | Insufficient stock | Stock export APIs |
| Transactions | Trace stock | Filterable table | View | Type, before/after, reason | Invalid filter | Transaction APIs |
| Replenishment | Request/receive stock | Form/list | Create/receive | Request status | Invalid qty/not approved | Replenishment APIs |

### Admin Screens

| Screen | Purpose | Components | Actions | Data displayed | Validation/error | API consumed |
|---|---|---|---|---|---|---|
| Admin Dashboard | Overview | KPI cards, charts/tables | Filter date | Revenue/orders/products/inventory | Invalid date | Report APIs |
| Product Management | Manage products | Table/form | Create/update/disable | Product master data | Invalid price/category | Product admin APIs |
| Category Management | Manage categories | Table/form | Create/update/disable | Category data | Duplicate name | Category admin APIs |
| User/Role Management | Manage access | User table, role selector | Create/update/disable/assign role | User/role/status | Duplicate email/invalid role | User admin APIs |
| Reports | Detailed reports | Filters, charts, tables | Filter/export optional | Revenue/order/product/customer/staff/inventory stats | Invalid range | Report APIs |
| Audit Logs | Trace actions | Filterable table | Filter/view | Actor/action/target/time | Invalid range | Audit APIs |
| System Settings | Configure rules | Settings form | Save | Return period, threshold defaults | Invalid type/range | Settings APIs |
| Replenishment Approval | Approve stock request | Queue/detail | Approve/reject | Request/product/qty | Invalid status | Replenishment admin APIs |

## G. API Planning

Response chuẩn:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "errors": []
}
```

### Auth

| Method | Endpoint | Actor | Request | Response | Collection | Validation | Error | Notes |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/auth/register` | Guest | fullName,email,phone,password,address | user summary | User, Role | email unique, password valid | 400 duplicate/invalid | Assign Customer role |
| POST | `/api/auth/login` | User | email,password | token,user,role | User, Role, AuditLog | active account | 401/403 | Log login success/failure if required |
| GET | `/api/auth/me` | User | token | user profile | User, Role | valid JWT | 401 | Used for session restore |
| POST | `/api/auth/logout` | User | token | success | AuditLog | valid JWT | 401 | Stateless logout optional |

### User/Profile

| Method | Endpoint | Actor | Request | Response | Collection | Validation | Error | Notes |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/users/me` | Customer/User | token | profile | User | own account | 401 | Staff/Admin can reuse for own profile |
| PATCH | `/api/users/me` | Customer/User | fullName,phone,address | updated profile | User, AuditLog | valid phone/address | 400 | Email change optional/not recommended |
| GET | `/api/admin/users` | Admin | filters | users | User, Role | role/status filters | 403 | Paginated |
| POST | `/api/admin/users` | Admin | user info,roleId | user | User, Role, AuditLog | email unique, role exists | 400 | Staff/Warehouse/Admin creation |
| PATCH | `/api/admin/users/:id` | Admin | profile/status fields | updated user | User, AuditLog | user exists | 404 | No password plain text |
| PATCH | `/api/admin/users/:id/role` | Admin | roleId | updated role | User, Role, AuditLog | role exists | 400 | Cannot remove last Admin if enforced |

### Product/Category

| Method | Endpoint | Actor | Request | Response | Collection | Validation | Error | Notes |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/products` | Public | keyword,categoryId,minPrice,maxPrice,availability,page | product list | Product, Category, Inventory | valid query | 400 | Public active only |
| GET | `/api/products/:id` | Public | id | product detail | Product, Category, Inventory | active for public | 404 | Include reviews summary |
| POST | `/api/admin/products` | Admin | product fields | product | Product, Inventory, AuditLog | price>0, category exists | 400 | Create inventory if needed |
| PATCH | `/api/admin/products/:id` | Admin | product fields | updated | Product, AuditLog | valid fields | 404 | Audit before/after |
| PATCH | `/api/admin/products/:id/status` | Admin | status | updated | Product, AuditLog | enum | 400 | Soft disable |
| GET | `/api/categories` | Public | status optional | category list | Category | active public |  |  |
| POST/PATCH | `/api/admin/categories` | Admin | category fields | category | Category, AuditLog | unique name | 400 | Soft disable |

### Cart/Order/Payment

| Method | Endpoint | Actor | Request | Response | Collection | Validation | Error | Notes |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/cart` | Customer | token | cart | Cart, CartItem | own cart | 401 | Create empty cart if missing |
| POST | `/api/cart/items` | Customer | productId,quantity | cart | CartItem, Inventory | active product, stock enough | 400 | Merge same product |
| PATCH | `/api/cart/items/:id` | Customer | quantity | cart | CartItem | quantity>0, stock enough | 400 |  |
| DELETE | `/api/cart/items/:id` | Customer | id | cart | CartItem | own cart item | 403/404 |  |
| POST | `/api/orders` | Customer | shippingAddress,paymentMethod | order | Order, OrderDetail, Cart, Payment | cart non-empty, stock enough | 400 | Idempotency recommended |
| GET | `/api/orders/my` | Customer | filters | orders | Order | own only | 401 |  |
| GET | `/api/orders/:id` | Customer/Staff/Admin | id | order detail | Order, OrderDetail | ownership/role | 403 |  |
| PATCH | `/api/orders/:id/cancel` | Customer | reason optional | cancelled order | Order, Inventory, AuditLog | Pending + unpaid | 409 |  |
| POST | `/api/orders/:id/payments` | Customer | paymentMethod | payment request/result | Payment, Order | amount match | 400 | Online/COD |
| POST | `/api/payments/callback` | Gateway | transactionId,orderId,status,amount,signature | success | Payment, Order, AuditLog | verify signature/idempotency | 400 | Public but protected by gateway verification |

### Staff/Warehouse/Admin Operations

| Method | Endpoint | Actor | Request | Response | Collection | Validation | Error | Notes |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/staff/orders` | Staff | status,dateFrom,dateTo,priority | order queue | Order | valid date | 400 |  |
| POST | `/api/staff/orders/:id/confirm` | Staff | note optional | order | Order, AuditLog | paid if online, stock enough | 409 |  |
| PATCH | `/api/staff/orders/:id/status` | Staff | status | order | Order, Notification, AuditLog | allowed transition | 409 |  |
| GET | `/api/staff/orders/:id/invoice` | Staff | id | invoice data | Order, OrderDetail | confirmed+ | 409 | Print client-side |
| POST | `/api/staff/orders/:id/stock-export` | Staff | note | request | StockExportRequest | order confirmed | 409 | Prevent duplicate open request |
| GET | `/api/warehouse/inventory` | Warehouse | filters | inventory list | Inventory, Product | valid filter | 400 |  |
| PATCH | `/api/warehouse/inventory/:id` | Warehouse | stockQuantity/threshold | inventory | Inventory, Transaction, AuditLog | non-negative | 400 | Direct update |
| POST | `/api/warehouse/inventory/:id/adjust` | Warehouse | delta/reason | inventory | InventoryTransaction | reason required | 400 |  |
| GET | `/api/warehouse/stock-exports` | Warehouse | status | requests | StockExportRequest |  |  |  |
| PATCH | `/api/warehouse/stock-exports/:id/status` | Warehouse | status,note | request | StockExportRequest, Inventory, Transaction | allowed transition, stock enough | 409 | Export reduces stock |
| POST | `/api/warehouse/replenishments` | Warehouse | productId,quantity,reason | request | ReplenishmentRequest | qty>0 | 400 |  |
| GET | `/api/admin/replenishments` | Admin | status | requests | ReplenishmentRequest |  |  |  |
| PATCH | `/api/admin/replenishments/:id/status` | Admin | approve/reject,note | request | ReplenishmentRequest, AuditLog | allowed transition | 409 |  |
| POST | `/api/warehouse/replenishments/:id/receive` | Warehouse | receivedQty | inventory | ReplenishmentRequest, Inventory, Transaction | approved only | 409 |  |

### Return/Refund, Support, Review, Notification, Report, Audit, Settings

| Method | Endpoint | Actor | Request | Response | Collection | Validation | Error | Notes |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/orders/:id/return-refunds` | Customer | items,reason,evidenceImages | request | ReturnRefundRequest | Delivered, within period | 409 |  |
| GET | `/api/staff/return-refunds` | Staff | status | requests | ReturnRefundRequest |  |  |  |
| PATCH | `/api/staff/return-refunds/:id/status` | Staff | status,note,refundAmount | request | ReturnRefundRequest, Order, Payment | allowed transition | 409 |  |
| POST | `/api/support-requests` | Customer | subject,content,orderId optional | request | SupportRequest | required fields | 400 |  |
| GET | `/api/support-requests/my` | Customer | status | requests | SupportRequest | own only | 401 |  |
| GET/PATCH | `/api/staff/support-requests` | Staff | filters/update | requests | SupportRequest | allowed status | 409 |  |
| POST | `/api/products/:id/reviews` | Customer | rating,content,orderId | review | ProductReview | purchased+delivered | 409 |  |
| GET | `/api/products/:id/reviews` | Public | page | reviews | ProductReview | product exists | 404 | Active reviews |
| GET | `/api/notifications` | User | filters | notifications | Notification | own only | 401 |  |
| PATCH | `/api/notifications/:id/read` | User | id | notification | Notification | own only | 403 |  |
| GET | `/api/admin/reports/revenue` | Admin | date range | report | Order, Payment | valid range | 400 | Similar for orders/products/customers/staff/inventory |
| GET | `/api/admin/audit-logs` | Admin | filters | logs | AuditLog | valid filters | 400 | Read-only |
| GET/PATCH | `/api/admin/system-settings` | Admin | settings | settings | SystemSetting | key/type/range | 400 | Audit updates |

## H. Data Schema Review & Recommendation

| Collection | Purpose | Main fields | Type/required/reference | Enum/index/constraint |
|---|---|---|---|---|
| User | Account/profile | fullName, email, passwordHash, phone, address, roleId, status | email/passwordHash/roleId required; roleId ref Role | unique email; status Active/Disabled; timestamps |
| Role | Authorization | roleName, description, permissions | roleName required | unique roleName; seed Customer/Staff/WarehouseManager/Admin |
| Product | Product master | name, description, imageUrls, price, unit, categoryId, status | categoryId ref Category; price required | index name/category/status; status Active/Inactive |
| Category | Product grouping | name, description, status | name required | unique active name; soft disable |
| ShoppingCart | Active cart | customerId, status | customerId ref User required | one Active cart/customer |
| CartItem | Cart line | cartId, productId, quantity, unitPriceSnapshot | cartId/productId ref; quantity required | unique cartId+productId; quantity > 0 |
| Order | Order header | orderCode, customerId, totalAmount, paymentMethod, paymentStatus, orderStatus, shippingAddress, deliveredAt | customerId ref User | unique orderCode; index customer/status/date |
| OrderDetail | Order line | orderId, productId, productNameSnapshot, priceSnapshot, quantity, subtotal | orderId/productId ref | snapshot required |
| Payment | Payment transaction | orderId, transactionId, paymentMethod, amount, paymentStatus, paidAt, rawResponse | orderId ref Order | unique transactionId when online; amount >= 0 |
| Inventory | Stock | productId, stockQuantity, reservedQuantity, damagedQuantity, lowStockThreshold, lastUpdatedBy | productId ref Product | product unique; no negative quantity |
| InventoryTransaction | Stock movement | productId, orderId, performedBy, type, quantity, beforeQuantity, afterQuantity, reason | refs Product/Order/User | append-only; type IN/OUT/ADJUST/RETURN/DAMAGED/REPLENISH |
| ProductReview | Review/rating | productId, customerId, orderId, rating, content, status | refs Product/User/Order | rating 1-5; unique per customer/product/order if needed |
| Notification | Email/in-app notification | userId, type, channel, subject, content, deliveryStatus, isRead, sentAt | userId ref User | delivery Pending/Sent/Failed |
| ReturnRefundRequest | Return/refund | requestCode, orderId, customerId, items, reason, evidenceImages, status, refundAmount, resolvedBy, resolvedAt | refs Order/User | unique open request per order if selected |
| SupportRequest | Complaint/support | requestCode, customerId, orderId, subject, content, status, handledBy, response | refs User/Order | status New/InProgress/Resolved/Closed |
| ReplenishmentRequest | Restock request | requestCode, productId, requestedBy, approvedBy, quantity, status, reason, receivedAt | refs Product/User | status Requested/Approved/Rejected/Received |
| AuditLog | Action trace | userId, action, targetEntity, targetId, before, after, ip, userAgent, timestamp | userId ref User optional for system | read-only; index user/action/time |
| SystemSetting | Config | key, value, valueType, description, updatedBy | key required | unique key; validate value by type |

## I. Order Status & Payment Status Design

### Order Status

| Status | Owner | Allowed next | Conditions | Notification | Audit |
|---|---|---|---|---|---|
| Pending | System/Customer | WaitingForPayment, Confirmed, Cancelled | Created order; COD may stay Pending | Order created | Yes |
| WaitingForPayment | System | Confirmed, Cancelled | Online payment required | Payment pending | Yes |
| Confirmed | Staff | StockExportRequested | Valid order, online Paid if required | Order confirmed | Yes |
| StockExportRequested | Staff/System | Packed, Cancelled | Warehouse exported stock before Packed | Optional | Yes |
| Packed | Staff | Shipped | Package ready | Optional | Yes |
| Shipped | Staff | Delivered | Sent to customer | Shipping email | Yes |
| Delivered | Staff | Returned | Delivered complete | Delivered email | Yes |
| Cancelled | Customer/Staff/System | None | Pending unpaid or Staff cancellation due stock issue | Cancel email | Yes |
| Returned | Staff/System | None | Approved return/refund | Refund result | Yes |

### Payment Status

| Status | Owner | Allowed next | Conditions | Notification | Audit |
|---|---|---|---|---|---|
| Pending | System | Paid, Failed, Cancelled, Refunded for COD policy if needed | Payment created | Optional | Yes |
| Paid | Gateway/System | Refunded | Valid callback amount/signature | Payment success | Yes |
| Failed | Gateway/System | Pending retry | Gateway failed | Payment failed | Yes |
| Cancelled | Gateway/System/Customer | Pending retry | Customer cancelled gateway flow | Payment cancelled | Yes |
| Refunded | System/Staff | None | Approved refund | Refund success | Yes |

### Return/Refund Status

| Status | Owner | Allowed next | Conditions |
|---|---|---|---|
| New | Customer/System | InReview, Rejected | Delivered + within period |
| InReview | Staff | Approved, Rejected | Staff reviewing |
| Approved | Staff | Refunded, Closed | Valid reason/items |
| Rejected | Staff | Closed | Rejection reason required |
| Refunded | System/Staff | Closed | Refund completed or marked completed |
| Closed | Staff/System | None | Final |

### Stock Export Request Status

| Status | Owner | Allowed next | Conditions |
|---|---|---|---|
| Requested | Staff | Approved, Rejected, Cancelled | Order confirmed |
| Approved | Warehouse | Exported | Stock still enough |
| Rejected | Warehouse | None | Reason required |
| Exported | Warehouse | None | Inventory reduced, transaction created |
| Cancelled | Staff/System | None | Order cancelled before export |

### Replenishment Request Status

| Status | Owner | Allowed next | Conditions |
|---|---|---|---|
| Requested | Warehouse | Approved, Rejected, Cancelled | Quantity > 0 |
| Approved | Admin | Received, Cancelled | Admin approval |
| Rejected | Admin | None | Reason required |
| Received | Warehouse | None | Stock increased, transaction created |
| Cancelled | Warehouse/Admin | None | Not received yet |

### Support Request Status

| Status | Owner | Allowed next | Conditions |
|---|---|---|---|
| New | Customer/System | InProgress, Closed | Customer submitted |
| InProgress | Staff | Resolved, Closed | Staff handling |
| Resolved | Staff | Closed, InProgress | Response provided |
| Closed | Customer/Staff/System | None | Final |

## J. Gap Analysis

| Nhóm | Có thể dùng lại | Nên sửa | Thiếu | Mâu thuẫn/quá rộng |
|---|---|---|---|---|
| System context | Actors, external systems, high-level data flows | Sửa wording/format | N/A | N/A |
| Use cases | Guest/Customer/Staff/Warehouse/Admin use cases | Chốt state names | Permission matrix chi tiết | Staff cancel with refund có thể rộng |
| Functional requirements | FR theo module khá đầy đủ | Fix duplicate FR-IWM-12 | API contract, validation, error response | Replenishment owner chưa thống nhất |
| Business rules | Account/order/payment/inventory/refund/review/audit rules tốt | Chốt stock deduction timing | Idempotency payment callback | Cancel/refund boundary cần rõ |
| Data schema | 18 collections hợp lý | Thêm enum/index/constraints | StockExportRequest chưa nằm trong list schema chính nếu cần collection riêng | Order 1-N refund request cần giới hạn active duplicate |
| SDS architecture | MERN layered architecture đúng | Bổ sung endpoint/service responsibility | Detailed design cho module còn thiếu | Một số class method chưa map rõ REST API |
| Reports | Revenue/order/product/customer/staff/inventory | Giữ mức basic | Query/filter definition | Staff/customer analytics có thể quá rộng |

Phần cần xác nhận với team/giảng viên:

- Payment Gateway dùng provider thật, sandbox hay mock?
- Stock giảm khi Warehouse export hay khi Staff confirm?
- COD khi Delivered có tự chuyển `Paid` không?
- Return/refund period chính xác là 7 ngày hay config khác?
- Một order có được tạo nhiều return/refund request không?
- Một customer có được review cùng product nhiều lần nếu mua nhiều lần không?
- Damaged product do Staff report có cần Warehouse approve trước khi giảm stock không?

## K. Implementation Roadmap

| Sprint | Mục tiêu | Features | Backend tasks | Frontend tasks | Database tasks | Test cases | Deliverables | Risk |
|---|---|---|---|---|---|---|---|---|
| Sprint 1 | Foundation/Auth/Layout/Role | Auth, JWT, role navigation | Setup Express, auth routes, middleware, error handler | React layout, login/register, role route guard | User, Role seed | Register/login/403 | Running skeleton app | Role bypass |
| Sprint 2 | Product/Categories/Public Catalog | Product/category admin + public catalog | Product/category APIs, public filters | Home, listing, detail, admin CRUD | Product, Category, Inventory base | Active-only catalog | Product browsing complete | Image/category inconsistency |
| Sprint 3 | Cart/Checkout/Order | Cart and order creation | Cart APIs, order service, stock validation | Cart, checkout, order confirmation/history | Cart, CartItem, Order, OrderDetail | Empty cart, out-of-stock, duplicate checkout | Customer can place order | Stock race condition |
| Sprint 4 | Payment/COD/Email | COD, online payment, notifications | Payment service, callback, email wrapper | Payment page/result, notification list | Payment, Notification | Paid/failed/callback duplicate | Payment flow complete | Gateway timeout |
| Sprint 5 | Staff Order Processing | Staff queue/status/invoice | Staff order APIs, state machine | Staff dashboard, queue, detail, invoice | Audit logs for staff actions | Invalid transition, unpaid order | Staff can process order | Status confusion |
| Sprint 6 | Inventory/Warehouse | Inventory/export/replenishment | Inventory service, export, transaction, low-stock | Warehouse screens | InventoryTransaction, StockExportRequest, ReplenishmentRequest | Non-negative, export reduce stock | Warehouse workflow complete | Inventory inconsistency |
| Sprint 7 | Return/Refund/Support/Review | After-sale workflows | Refund/support/review APIs | Customer/staff forms and queues | ReturnRefund, Support, Review | Delivered-only refund/review | After-sale complete | Duplicate requests |
| Sprint 8 | Admin Reports/Audit/Polish/Testing | Admin dashboards and final QA | Report queries, settings, audit filters | Admin reports/settings/audit UI, UX polish | SystemSetting indexes | RBAC, E2E, regression | Project-ready system | Report query mismatch |

## L. Testing & Acceptance Plan

### Unit Test Scope

- Auth service: hash password, login, disabled account.
- Authorization middleware: role allow/deny.
- Cart service: add/update/remove/total.
- Order service: checkout validation, snapshot price/name, status machine.
- Payment service: amount match, callback idempotency.
- Inventory service: non-negative stock, transaction creation.
- Return/refund service: delivered + within period.
- Review service: purchased + delivered validation.
- Audit helper: required fields.

### Integration Test Scope

| Scenario | Expected |
|---|---|
| Register -> login -> profile | User can authenticate and access own profile |
| Product admin -> public catalog | Active product visible, inactive hidden |
| Cart -> checkout -> order | Order and order details created correctly |
| Online payment callback success | Payment Paid, order payment status updated |
| Staff confirm -> stock export -> warehouse export | Order progresses, inventory reduced, transaction created |
| Return/refund approve | Request approved, order/payment updated as configured |
| Admin audit filter | Audit logs filter correctly and cannot mutate |

### E2E Scenarios

- Guest browse/search/detail/register.
- Customer COD order from cart to order history.
- Customer online payment success.
- Online payment failed and retry.
- Staff confirm/request export/pack/ship/deliver.
- Customer cancel Pending unpaid order.
- Customer request return/refund and Staff approve/reject.
- Customer submit support and Staff resolve.
- Customer review delivered product.
- Warehouse adjust stock and low-stock/replenishment flow.
- Admin manage product/category/user/report/audit/settings.

### Role-Based Access Test

| Actor | Test |
|---|---|
| Guest | Cannot access `/cart`, `/orders`, staff/admin/warehouse APIs |
| Customer | Cannot access other customer order or staff/admin APIs |
| Staff | Cannot manage product/category/user/settings |
| Warehouse | Cannot update order status/payment/user |
| Admin | Can access admin APIs but should not mutate audit log |

### Payment Test

- Amount mismatch callback rejected.
- Duplicate callback does not double-update.
- Failed/cancelled payment keeps order unpaid.
- Paid payment unlocks Staff confirmation for online order.

### Inventory Consistency Test

- Cannot create/export quantity greater than available stock.
- Inventory never negative.
- Every stock movement creates InventoryTransaction.
- Cancelled order releases reserved stock if reservation is implemented.
- Returned stock only added back after inspection/approved policy.

### Error Handling Test

- Invalid ObjectId -> 400.
- Not found -> 404.
- Unauthorized -> 401.
- Forbidden -> 403.
- Invalid state transition -> 409.
- Validation error -> 400 with field-level message.

### Security Test

- Password hash only.
- JWT required for private APIs.
- Backend enforces role, not only frontend.
- No sensitive payment data in response/log.
- Input validation for quantity, price, enum status, date range.

### Module Acceptance Criteria

| Module | Acceptance |
|---|---|
| Auth | Register/login/role redirect works; wrong role blocked |
| Product | Admin CRUD works; public only sees active products |
| Cart | Quantity validation and total calculation correct |
| Order | Checkout creates correct order/detail and handles stock errors |
| Payment | COD and online payment statuses update correctly |
| Staff | State transitions enforced and visible in UI |
| Warehouse | Export/adjustment updates stock and transaction |
| Return/Refund | Only eligible delivered orders can request |
| Support | Customer request and Staff response lifecycle works |
| Review | Only delivered purchased product can be reviewed |
| Notification | Important events create notification/email record |
| Reports | Admin sees filtered summary data |
| Audit | Important mutations logged and read-only |
| Settings | Config updates validated and audited |

## M. Final Deliverables

### 1. Feature Backlog

| Priority | Feature |
|---|---|
| Must Have | Auth & Authorization |
| Must Have | Product & Category Management |
| Must Have | Product Browsing/Search/Filter |
| Must Have | Cart Management |
| Must Have | Checkout & Order Placement |
| Must Have | Payment Management |
| Must Have | Customer Order History & Cancel Order |
| Must Have | Staff Order Processing |
| Must Have | Warehouse Inventory Management |
| Must Have | Return/Refund Management |
| Must Have | Audit Log |
| Should Have | Stock Export & Replenishment |
| Should Have | Support/Complaint Management |
| Should Have | Product Review |
| Should Have | Notification/Email |
| Should Have | Admin Reports & Statistics |
| Should Have | System Settings |
| Could Have | Responsive mobile browser polish |
| Could Have | Advanced dashboard charts |

### 2. Screen Backlog

| Priority | Screen |
|---|---|
| Must | Home, Product Listing, Product Detail |
| Must | Register, Login, Profile |
| Must | Cart, Checkout, Payment Result |
| Must | Order History, Order Detail |
| Must | Staff Order Queue, Staff Order Detail, Invoice |
| Must | Inventory List, Inventory Detail |
| Must | Admin Product, Category, User/Role |
| Should | Return/Refund Form/Queue |
| Should | Support Form/Queue |
| Should | Review Form |
| Should | Notifications |
| Should | Low Stock, Stock Export, Replenishment |
| Should | Admin Reports, Audit Logs, System Settings |

### 3. API Backlog

| Priority | API Group |
|---|---|
| Must | Auth |
| Must | User/Profile |
| Must | Product |
| Must | Category |
| Must | Cart |
| Must | Order |
| Must | Payment |
| Must | Staff Order |
| Must | Inventory |
| Must | Audit Log |
| Should | Stock Export |
| Should | Replenishment |
| Should | Return/Refund |
| Should | Support |
| Should | Review |
| Should | Notification |
| Should | Report |
| Should | System Setting |

### 4. Database Backlog

| Priority | Collection |
|---|---|
| Must | User, Role |
| Must | Product, Category |
| Must | ShoppingCart, CartItem |
| Must | Order, OrderDetail |
| Must | Payment |
| Must | Inventory, InventoryTransaction |
| Must | AuditLog |
| Should | StockExportRequest |
| Should | ReturnRefundRequest |
| Should | SupportRequest |
| Should | ProductReview |
| Should | Notification |
| Should | ReplenishmentRequest |
| Should | SystemSetting |

### 5. Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Scope creep | Không kịp WDP301 deadline | Chỉ làm core workflow, defer advanced features |
| Payment callback duplicate | Sai trạng thái/thanh toán | Idempotency by transactionId/orderId |
| Inventory inconsistency | Bán quá tồn hoặc tồn âm | Central inventory service, non-negative validation, transaction log |
| Role bypass | Lộ dữ liệu/chức năng | Backend RBAC tests, not only UI guard |
| Email failure | User không nhận thông báo | Log delivery status, allow retry, do not rollback core transaction |
| Report query sai | Admin số liệu sai | Define report formulas and integration tests |
| Duplicate refund/review | Sai nghiệp vụ after-sale | Unique constraints and eligibility checks |

### 6. Checklist hoàn thiện tài liệu SRS/SDS

- [ ] Sửa lỗi format/glossary trong SRS.
- [ ] Fix duplicate `FR-IWM-12`.
- [ ] Bổ sung Actor & Permission Matrix.
- [ ] Bổ sung state machine cho order/payment/refund/export/replenishment/support.
- [ ] Chốt stock deduction timing.
- [ ] Bổ sung REST API contract.
- [ ] Bổ sung schema enum/index/constraint.
- [ ] Bổ sung screen/API mapping.
- [ ] Bổ sung module-level acceptance criteria.
- [ ] Cập nhật SDS sequence/class diagrams theo API/service thực tế.
- [ ] Tách rõ out-of-scope để tránh mở rộng quá mức.

### 7. Checklist hoàn thiện code implementation

- [ ] Setup backend structure routes/controllers/services/models/middlewares/config.
- [ ] Setup frontend structure pages/components/services/routes.
- [ ] Seed roles and default system settings.
- [ ] Implement auth/JWT/RBAC.
- [ ] Implement product/category/catalog.
- [ ] Implement cart/checkout/order.
- [ ] Implement payment COD/online callback.
- [ ] Implement staff processing and order state machine.
- [ ] Implement inventory/export/transaction/low-stock.
- [ ] Implement return/refund/support/review.
- [ ] Implement notification/email wrapper.
- [ ] Implement admin reports/audit/settings.
- [ ] Add validation/error handling.
- [ ] Add unit/integration/E2E tests.
- [ ] Prepare demo data and final presentation flow.

### 8. Câu hỏi cần hỏi lại team để chốt nghiệp vụ

1. Payment Gateway dùng cổng thật, sandbox hay mock?
2. Online order sau payment Paid có tự chuyển Confirmed không, hay Staff vẫn phải confirm?
3. COD payment status khi Delivered có chuyển Paid không?
4. Tồn kho giảm khi Staff confirm order hay khi Warehouse export?
5. Có cần reserved stock ngay sau checkout không?
6. Return/refund period chính xác là bao nhiêu ngày?
7. Một order có được tạo nhiều return/refund request không?
8. Một customer có được review cùng product nhiều lần nếu mua nhiều lần không?
9. Damaged product report có cần Warehouse/Admin approve trước khi giảm stock không?
10. Replenishment request do Warehouse Manager tạo hay Staff cũng được tạo?
11. Admin report cần chart hay chỉ bảng/KPI là đủ?
12. Email failure có cần retry tự động hay chỉ ghi Failed?
13. Có cần export invoice PDF không, hay chỉ print view?
14. Có cần lock account sau nhiều lần login fail không?
15. Có cần phân quyền chi tiết bằng permissions array, hay role cố định là đủ cho WDP301?
