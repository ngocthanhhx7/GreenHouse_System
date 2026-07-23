# Nguyễn Ngọc Thành - Foundation, Auth/RBAC, Audit, Integration Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Nguyễn Ngọc Thành |
| Role in team | Team lead, integration owner, foundation owner |
| Main responsibility | Xây nền tảng auth, role-based access, shared layout/API client, audit, tích hợp PayOS và final merge |
| Git branch | Foundation: `feature/thanh-auth-rbac-foundation`; PayOS: `feature/thanh-payos-payment` |
| Priority | Must Have |

## 2. Business Objective

Tạo nền tảng để mọi module khác hoạt động đúng quyền. Nếu phần này lỗi, Customer có thể truy cập Staff/Admin/Warehouse, hoặc Staff không vào được màn xử lý đơn. Đây là phần quan trọng để mentor thấy hệ thống có security và role separation rõ ràng.

## 3. Module Ownership

- Authentication & Authorization.
- User/Role model foundation.
- JWT authentication middleware.
- Role authorization middleware.
- Shared backend error response format.
- Shared frontend API service wrapper.
- Role-based frontend route guard.
- Login/Register/Profile basic.
- AuditLog model/helper foundation.
- PayOS provider adapter, hosted checkout link, webhook signature verification và cấu hình môi trường.
- Final integration review and merge coordination.

## 4. Important Flows Owned

| Flow | Trigger | Expected result |
|---|---|---|
| Guest register | Guest submit register form | Customer account created, password hashed, default Customer role assigned |
| User login | User submit credentials | JWT returned, user redirected to correct role dashboard |
| Role redirect | Authenticated user opens app | Customer/Staff/Warehouse/Admin see correct navigation |
| Unauthorized access blocked | User accesses wrong role route/API | Frontend shows Forbidden; backend returns `403` |
| Audit login/action | Login or important mutation occurs | AuditLog entry created with actor/action/target/time |

## 5. Frontend Scope

### Pages

| Page | Path suggestion | Purpose |
|---|---|---|
| Login Page | `client/src/pages/auth/LoginPage.jsx` | User login |
| Register Page | `client/src/pages/auth/RegisterPage.jsx` | Guest creates Customer account |
| Profile Page | `client/src/pages/profile/ProfilePage.jsx` | User views/updates own profile |
| Unauthorized Page | `client/src/pages/errors/UnauthorizedPage.jsx` | Show when not logged in |
| Forbidden Page | `client/src/pages/errors/ForbiddenPage.jsx` | Show when role is not allowed |

### Components

| Component | Path suggestion | Purpose |
|---|---|---|
| AppLayout | `client/src/components/layout/AppLayout.jsx` | Shared layout wrapper |
| Header | `client/src/components/layout/Header.jsx` | Top navigation |
| Sidebar | `client/src/components/layout/Sidebar.jsx` | Role-based menu |
| ProtectedRoute | `client/src/components/auth/ProtectedRoute.jsx` | Require login |
| RoleRoute | `client/src/components/auth/RoleRoute.jsx` | Require role |

### Services/Context

| File | Purpose |
|---|---|
| `client/src/services/apiClient.js` | Axios/fetch wrapper, base URL, token injection, error handling |
| `client/src/services/authService.js` | register, login, get current user, logout |
| `client/src/contexts/AuthContext.jsx` | Store current user/token/role |
| `client/src/hooks/useAuth.js` | Simple hook for pages/components |

## 6. Backend Scope

### Models

| Model | Fields |
|---|---|
| `User` | fullName, email, passwordHash, phone, address, roleId, status, createdAt, updatedAt |
| `Role` | roleName, description, permissions, createdAt, updatedAt |
| `AuditLog` | userId, action, targetEntity, targetId, description, before, after, ip, userAgent, timestamp |

### Routes/Controllers/Services

| Layer | File suggestion | Responsibility |
|---|---|---|
| Route | `server/src/routes/auth.routes.js` | `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout` |
| Controller | `server/src/controller/auth.controller.js` | Parse request, return response |
| Service | `server/src/services/auth.service.js` | Register/login business logic |
| Middleware | `server/src/middlewares/auth.middleware.js` | Verify JWT |
| Middleware | `server/src/middlewares/authorize.middleware.js` | Check allowed roles |
| Utility | `server/src/utils/auditLogger.js` | Create audit log entries |
| Utility | `server/src/utils/apiResponse.js` | Standard response shape |
| Utility | `server/src/utils/apiError.js` | Standard error object |

## 7. API Scope

| Method | Endpoint | Permission | Request | Success response | Error cases |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Public | fullName, email, phone, password, address | Customer account summary | Duplicate email, invalid input |
| POST | `/api/auth/login` | Public | email, password | JWT, user summary, role | Invalid credentials, disabled account |
| POST | `/api/auth/forgot-password` | Public | email | Anti-enumeration acknowledgement | Invalid email, rate limited |
| POST | `/api/auth/reset-password` | Public | email, otp, password, confirmPassword | Password reset acknowledgement | OTP incorrect/expired/used/attempt limit, weak password |
| POST | `/api/contact` | Public | name, email, phone, subject, message | Contact request summary | Field validation, rate limited |
| GET | `/api/auth/me` | Authenticated | Bearer token | Current user | Missing/expired token |
| POST | `/api/auth/logout` | Authenticated | Bearer token | Success | Missing token |
| GET | `/api/admin/audit-logs` | Admin | filters | Audit list | Forbidden, invalid date |

## 8. Database/Model Scope

| Collection | Required indexes | Business constraints |
|---|---|---|
| User | unique email, roleId, status | One user has exactly one role; disabled cannot login |
| Role | unique roleName | Seed Customer, Staff, WarehouseManager, Admin |
| AuditLog | userId, action, timestamp | Append-only; no update/delete from user UI |

## 9. Validation And Error Cases

| Case | Expected handling |
|---|---|
| Email exists | Return `400`, message "Email already exists" |
| Password too short | Return `400`, field-level error |
| Login wrong password | Return `401` |
| Disabled account | Return `403` |
| Missing token | Return `401` |
| Wrong role | Return `403` |
| Invalid role assignment | Return `400` |

## 10. Integration Dependencies

| Needed by | What they need from Thành |
|---|---|
| Chung | Admin role guard for Product/Category management |
| Huy | Customer auth for Cart/Checkout/Order |
| Nhật | Staff role guard for Staff order processing |
| Cường | Warehouse/Admin role guard and audit helper |

## 11. Phase-by-Phase Task List

### Phase 1 - Main Delivery

- [ ] Create User, Role, AuditLog models.
- [ ] Seed default roles.
- [ ] Implement register/login/auth-me APIs.
- [ ] Implement JWT middleware.
- [ ] Implement role authorization middleware.
- [ ] Implement frontend login/register/profile.
- [ ] Implement AuthContext and route guard.
- [ ] Implement shared API client.

### Phase 2 - Support Product/Catalog

- [ ] Provide Admin guard for Product/Category pages.
- [ ] Confirm public routes do not require login.
- [ ] Review product APIs for standard error response.

### Phase 3 - Support Cart/Order

- [ ] Confirm Customer guard works for cart/checkout/order pages.
- [ ] Add audit helper usage examples for order creation/cancel.

### Phase 4 - Payment/Email Support

- [x] PayOS webhook không yêu cầu JWT người dùng nhưng bắt buộc xác minh signature bằng Checksum Key.
- [x] Tạo hosted checkout link ở backend; không đưa Client ID/API Key/Checksum Key xuống frontend.
- [x] Giữ callback idempotent và audit action cho payment status changes.

### Phase 5-8 - Integration

- [ ] Review role access for Staff/Warehouse/Admin modules.
- [ ] Review audit logs for important mutations.
- [ ] Coordinate final merge and conflict resolution.
- [ ] Prepare final demo account list.

## 12. Git Branch/PR Suggestion

| PR | Branch | Content |
|---|---|---|
| PR 1 | `feature/thanh-auth-rbac-foundation` | Auth, roles, middleware, frontend login/register/layout |
| PR 2 | `feature/thanh-audit-integration` | Audit helper, audit APIs, integration fixes |
| PR 3 | `feature/thanh-final-polish` | Final merge fixes, route guards, demo accounts |

## 13. Testing Checklist

- [ ] Register with valid email creates Customer account.
- [ ] Register duplicate email is rejected.
- [ ] Password is not stored as plain text.
- [ ] Login valid account returns token.
- [ ] Login disabled account is rejected.
- [ ] Customer cannot access Staff API.
- [ ] Staff cannot access Admin API.
- [ ] Admin can view audit logs.
- [ ] Missing token returns `401`.
- [ ] Wrong role returns `403`.

## 14. Demo Script For Mentor

1. Open Register page and create a Customer account.
2. Login as Customer and show Customer navigation.
3. Try to open Admin route and show Forbidden.
4. Login as Staff and show Staff dashboard route.
5. Login as Admin and show Admin route.
6. Open audit logs and show login/action records.

## 15. Risk And Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Role guard only implemented on frontend | User can call backend API manually | Enforce role middleware in backend |
| Token format inconsistent | Other modules cannot call APIs | Centralize `apiClient.js` |
| No default roles | Register/login cannot assign permissions | Seed roles before testing |
| Audit helper too hard to use | Other members skip audit logging | Provide simple `logAudit({ userId, action, targetEntity, targetId })` |

## 16. Final Checklist

- [ ] Auth APIs complete.
- [ ] Role middleware complete.
- [ ] Frontend auth flow complete.
- [ ] Shared API client complete.
- [ ] Audit helper complete.
- [ ] Demo accounts prepared.
- [ ] Integration notes shared to team.

## Design DNA Decision — 2026-07-22

The responsive foundation uses Fraunces for display typography and Be Vietnam Pro for UI typography because the official Outfit release lacks Vietnamese glyph coverage. Both fonts must remain self-hosted from official OFL sources; runtime network font imports are prohibited.

## Ownership Addendum 2026-07-20

Thành là owner chính của Home, About và Liên hệ cùng các tài nguyên storefront dùng chung, bổ sung ngoài Auth/RBAC:

- Hoàn thiện `HomePage.jsx`, `AboutPage.jsx` và `ContactPage.jsx` tiếng Việt, responsive desktop/mobile, commerce-first và các layout dùng chung không làm hỏng luồng role.
- Chịu trách nhiệm nội dung, bố cục, header/footer integration và route-level regression của ba màn public này; Product/Catalog của Chung chỉ cung cấp dữ liệu và component sản phẩm được nhúng.
- Xây upload foundation cho product/avatar, gồm MIME/size/role validation và thư mục runtime `server/uploads`.
- Tách AccountLayout; xây Profile chỉnh sửa được, avatar, đổi mật khẩu và Address Book API nền tảng.
- Xây Notification API/UI: unread count, dropdown preview, detail route, read state và rule chỉ xóa notification đã đọc.
- Review contract của Chung/Huy/Nhật/Cường, chạy regression test, commit/merge cuối bằng danh tính `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.

Chi tiết execution: `docs/srs-sds-reconciliation/06_ACCOUNT_MEDIA_NOTIFICATION_ADDRESS_PLAN.md`.

## Ownership Clarification 2026-07-23 — Public Storefront

Để tránh assignment cũ gây hiểu nhầm, Nguyễn Ngọc Thành là người phụ trách triển khai và bảo trì giao diện ba màn public:

| Màn hình | Owner | Phạm vi |
|---|---|---|
| Home | Nguyễn Ngọc Thành | Hero, featured/category sections, product display integration, responsive desktop/mobile |
| About | Nguyễn Ngọc Thành | Brand story, sustainability content, responsive layout và shared shell |
| Liên hệ | Nguyễn Ngọc Thành | Contact form, frontend/backend validation boundary, email hand-off và responsive layout |

Phạm Thành Chung không còn ownership giao diện Home; Chung chỉ sở hữu Product/Category/Catalog và cung cấp dữ liệu/component sản phẩm cho Home khi cần. Các dòng lịch sử trước ngày 2026-07-23 được giữ để traceability và được addendum này supersede.

## Ownership Addendum 2026-07-22 - Email Delivery Và Validation Toàn Hệ Thống

Nguyễn Ngọc Thành bổ sung vai trò owner nền tảng cho email delivery và điều phối validation xuyên suốt hệ thống:

- Xây email delivery dùng chung theo cơ chế outbox/queue; lỗi nhà cung cấp email không được rollback tạo đơn, thanh toán hoặc mutation nghiệp vụ đã hoàn tất.
- Hoàn thiện quên mật khẩu bằng OTP 6 số gửi qua Gmail SMTP, form liên hệ gửi email và email xác nhận đơn hàng. OTP chỉ lưu dạng HMAC hash, payload outbox được mã hóa, có TTL 10 phút, cooldown gửi lại 60 giây, tối đa 5 lần nhập sai, dùng một lần và không làm lộ email có tồn tại hay không. Đổi mật khẩu cập nhật `passwordChangedAt` để vô hiệu hóa JWT cũ.
- Chuẩn hóa hợp đồng lỗi dùng chung gồm HTTP status, `errorCode`, `message` tiếng Việt và `fieldErrors`; frontend hiển thị lỗi riêng theo trường, backend luôn validate lại toàn bộ input.
- Điều phối audit validation trên mọi body/query/path param của Public, Customer, Staff, WarehouseManager và Admin. Validation cú pháp/shape đặt tại request boundary; validation quyền, trạng thái và invariant nghiệp vụ tiếp tục nằm trong service của module sở hữu.
- Triển khai theo ba phase để giữ code gọn và giảm regression: V1 bảo mật nền tảng/rate limit/body limit/CORS/ObjectId; V2 schema nghiệp vụ và pagination/filter bounds; V3 chuẩn hóa thông báo tiếng Việt, accessibility và route-level regression tests.
- Mọi thay đổi scope/contract phải cập nhật `docs/member-plans` trước khi merge. Hai thư mục làm việc nội bộ `docs/superpowers/` và `docs/ui-prompts/` không được theo dõi hoặc push lên Git.

Thông tin cần cấu hình ngoài Git cho email: `MAIL_PROVIDER=smtp`, Gmail App Password, `MAIL_FROM`, `CONTACT_INBOX`, `RESET_OTP_SECRET`, public URL, CORS origin và rate-limit policy. Không ghi Gmail password, App Password hoặc secret thật vào tài liệu/commit.

## Ownership Addendum 2026-07-22 - PayOS Online Payment

Nguyễn Ngọc Thành sở hữu toàn bộ lớp tích hợp PayOS, tách khỏi Payment domain của Nguyễn Quang Huy:

- SDK `@payos/node`, adapter cấu hình, hosted checkout URL và TTL.
- Các biến `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_WEBHOOK_URL` và `PAYOS_PAYMENT_LINK_TTL_MINUTES`.
- Webhook `POST /api/payments/payos/webhook`, xác minh HMAC/signature trước khi chuyển dữ liệu đã tin cậy vào payment state machine.
- Script `npm run payos:confirm-webhook` để PayOS xác nhận URL webhook công khai.
- Local development dùng một public HTTPS URL forward tới backend `http://localhost:5000`, ví dụ `PAYOS_WEBHOOK_URL=https://<tunnel-domain>/api/payments/payos/webhook`; return/cancel URL có thể quay về frontend local.
- Branch: `feature/thanh-payos-payment`; commit author: `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.

Huy vẫn sở hữu Order/PaymentAttempt state, COD, checkout idempotency, late callback và refund invariant; không sở hữu credential, SDK, provider mapping hoặc public webhook của PayOS.

## Ownership Addendum 2026-07-22 - Bộ Dữ Liệu Demo Toàn Hệ Thống

Nguyễn Ngọc Thành là owner nền tảng cho bộ dữ liệu demo có quan hệ đầy đủ, tách thành hai phase an toàn:

- Phase 1 (đã đặc tả và kiểm thử offline): fixture graph tất định gồm 4 role, 13 tài khoản (10 Customer), 20 địa chỉ, 5 danh mục, 15 sản phẩm tiếng Việt (3 mẫu đa dạng mỗi danh mục) và dữ liệu liên kết cho giỏ hàng, đơn hàng, thanh toán, callback, hóa đơn, kho, đổi trả, hoàn tiền, hỗ trợ, đánh giá, thông báo, cài đặt và audit log.
- Mỗi collection dùng natural key ổn định; graph validator kiểm tra tham chiếu, tổng tiền, trạng thái nghiệp vụ, thời điểm báo cáo, quyền đánh giá và sự tham gia của cả 10 khách hàng trước mọi thao tác ghi.
- Ledger kho demo gồm đúng 12 điều chỉnh, 2 lần nhận bổ sung, 1 xác nhận hư hỏng và 22 dòng xuất kho; tồn kho ở Product/Inventory cùng lượng giữ chỗ được derive từ ledger và các đơn đang hoạt động, không đặt số liệu rời rạc.
- Kịch bản callback chỉ thuộc đơn ONLINE; đánh giá chỉ thuộc đơn Delivered; support, xuất kho, đổi trả và RefundPending bám đúng actor, trạng thái bền vững và timestamp của service hiện hành. Mọi timestamp demo không vượt quá ngày 2026-07-22.
- Ảnh sản phẩm dùng manifest 15 file WebP 1600x1200, đường dẫn UUID-v4 tất định, giới hạn 350KB và SHA-256. Khi chưa tạo/duyệt đủ ảnh, asset preflight phải chặn apply/reset; seed không gọi upload service hoặc gửi email.
- `npm run seed:demo -- --dry-run` chỉ kiểm tra offline, tuyệt đối không kết nối MongoDB. Luồng upsert/reset bị khóa cho đến Phase 2 và chỉ được mở sau khi người phụ trách xác nhận chính xác database demo.
- Reset Phase 2 phải đồng thời thỏa `NODE_ENV != production`, `DEMO_SEED_ALLOW_RESET=true`, tên database thuộc `greenhouse_demo|greenhouse_test|greenhouse_e2e`, câu xác nhận `RESET:<databaseName>`, tiền kiểm graph/assets/indexes và MongoDB hỗ trợ transaction. Không dùng `dropDatabase`; chỉ xóa dữ liệu demo theo thứ tự phụ thuộc và không xóa collection Role dùng chung.
- Phase 2 sẽ bổ sung direct-write adapter idempotent, transaction integration test trên database dùng một lần, tạo/duyệt ảnh và API smoke test cho toàn bộ role. Không dùng service nghiệp vụ trong seed để tránh side effect upload, notification hoặc email.

Thông tin người dùng phải cung cấp ngoài Git trước Phase 2: tên database demo có thể xóa, xác nhận cho phép xóa toàn bộ dữ liệu trong database đó, `MONGODB_URI`, `DEMO_SEED_ALLOW_RESET=true` và mật khẩu demo. Không gửi URI, password hoặc secret qua chat.
## Ownership Addendum 2026-07-22 - Durable Email Delivery Hardening

- The email outbox is drained by a startup worker with bounded polling and a clean stop hook; SMTP configuration fails fast when required Gmail variables or a strong `RESET_OTP_SECRET` are missing.
- Outbox claims carry a random lease token. Sent/failed finalization is conditional on that token so an expired or stolen lease cannot overwrite another worker's result; failed deliveries remain retryable.
- OTP consume and password update run in one transaction boundary. If the password mutation rolls back, the OTP remains available; successful reset still updates `passwordChangedAt` to invalidate older JWTs.
- Public contact submission is throttled independently from field validation. Every delivery failure is observable through the outbox/audit path without failing a committed order or contact persistence operation.

## Ownership Addendum 2026-07-23 - Notification Domain

Addendum này chỉ chuyển ongoing ownership và maintenance của Notification kể từ ngày 2026-07-23; addendum 2026-07-20 vẫn là bằng chứng lịch sử baseline do Nguyễn Ngọc Thành triển khai.

- Nguyễn Quang Huy sở hữu Notification model/service/API, in-app bell/dropdown/list/detail, read/unread/delete, domain-event consumption và retry status.
- Nguyễn Ngọc Thành tiếp tục sở hữu EmailOutbox, Gmail SMTP/email delivery, OTP/password reset, public contact email, PayOS, Audit và final integration.
- `feature/huy-notification-ownership-docs` là branch ownership-docs only. Branch code Notification tương lai là `feature/huy-notification-domain` (TBD, chưa tạo), author `Nguyễn Quang Huy <quanghuyn267@gmail.com>`.

## Review Addendum 2026-07-23 - SL-002 Post-Merge Closure

Nguyễn Hữu Anh Nhật remains the original implementation owner of SL-002
Same-SKU Exchange. Nguyễn Ngọc Thành owns the independent post-merge integration
review and closure on `feature/sl-002-postmerge-closure`:

- Reconcile the merged SL-002 implementation with SL-001 and CR-001 v2.1.
- Close atomicity, physical-unit lineage, migration, COD, incident, typed
  conflict, deadline and actor-UI contract findings using acceptance tests first.
- Preserve actor ownership: Warehouse creates initial outbound obligations;
  Staff alone owns replacement resend after a delivery incident.
- Run full server/client regression, dependency audits, production build,
  expanded G6 actor acceptance, traceability and handoff.
- Review and merge with the exact identity
  `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.
- Keep the previously merged saved-address Checkout correction isolated; no
  Checkout, Address Book, Cart, Payment or PayOS file belongs to this SL-002
  closure diff.

## Implementation Addendum 2026-07-24 - SL-007 Account/Auth/RBAC

Nguyễn Ngọc Thành phụ trách triển khai và tích hợp SL-007 trên branch
`feature/sl-007-account-auth-rbac` bằng danh tính
`Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`:

- Customer registration xác minh email, internal invitation, login throttling,
  cookie session, CSRF, logout/revocation và password reset/change.
- Fixed single-role RBAC, Admin account governance, durable audit-backed
  idempotency và active-assignment handoff không impersonation.
- Self profile/avatar và Customer-only structured address book với giới hạn 10,
  đúng một default và default switch trong transaction.
- Migration/index/verifier, actor regression, traceability, release audit và
  handoff thuộc Definition of Done của SL-007.
- Credential/session race, address-book concurrency và role-transfer/active
  assignment race được đóng bằng version/fence cùng Mongo transaction; migration
  backfill User/UserSession và tạo 16 index lặp an toàn.
- Notification model/service/API/UI và consumption/retry/reporting tiếp tục do
  Nguyễn Quang Huy sở hữu; Thành chỉ sở hữu DomainOutbox/EmailOutbox, Gmail/OTP,
  Audit, PayOS và final integration.

Release evidence được ghi tại `docs/reviews/SL-007_RELEASE_AUDIT.md`,
`docs/reviews/SL-007_G3_TRACEABILITY.md` và `docs/reviews/SL-007_HANDOFF.md`.
