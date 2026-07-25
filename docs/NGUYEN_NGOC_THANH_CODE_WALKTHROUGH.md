# Nguyễn Ngọc Thành - Giải thích chi tiết code, validation và luồng hoạt động

> Ngày đối chiếu: 2026-07-22
> Repository: `GreenHouse_System`
> Phạm vi tài liệu: toàn bộ phần do Nguyễn Ngọc Thành sở hữu theo `docs/member-plans/` và `docs/srs-sds-reconciliation/`, đối chiếu với code hiện tại trên `main`.
> Danh tính Git chính thức: `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.

## Mục lục

1. [Nguồn tài liệu và phạm vi ownership](#1-nguồn-tài-liệu-và-phạm-vi-ownership)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [Backend foundation, security, validation và response](#3-backend-foundation-security-validation-và-response)
4. [Auth, JWT và RBAC backend](#4-auth-jwt-và-rbac-backend)
5. [Auth, route guard và router frontend](#5-auth-route-guard-và-router-frontend)
6. [Layout và Homepage frontend](#6-layout-và-homepage-frontend)
7. [Profile, đổi mật khẩu, avatar và Address Book](#7-profile-đổi-mật-khẩu-avatar-và-address-book)
8. [Notification backend và frontend](#8-notification-backend-và-frontend)
9. [Email outbox, OTP reset password và Contact](#9-email-outbox-otp-reset-password-và-contact)
10. [Audit log backend và frontend](#10-audit-log-backend-và-frontend)
11. [PayOS backend và frontend](#11-payos-backend-và-frontend)
12. [Demo data và default accounts](#12-demo-data-và-default-accounts)
13. [Validation matrix](#13-validation-matrix)
14. [Các sai lệch giữa tài liệu và code](#14-các-sai-lệch-giữa-tài-liệu-và-code)
15. [Test và mức độ hoàn thành](#15-test-và-mức-độ-hoàn-thành)

---

## 1. Nguồn tài liệu và phạm vi ownership

### 1.1 Danh tính và vai trò

Nguồn chính:

- [`docs/srs-sds-reconciliation/01_NGUYEN_NGOC_THANH_PLAN.md`](srs-sds-reconciliation/01_NGUYEN_NGOC_THANH_PLAN.md), dòng 5-8.
- [`docs/member-plans/01_NGUYEN_NGOC_THANH_PLAN.md`](member-plans/01_NGUYEN_NGOC_THANH_PLAN.md), dòng 7-10.
- [`docs/srs-sds-reconciliation/00_RECONCILIATION_OVERVIEW.md`](srs-sds-reconciliation/00_RECONCILIATION_OVERVIEW.md), dòng 3, 36 và 77-86.

Thông tin chính thức:

| Trường | Giá trị |
|---|---|
| Họ tên | Nguyễn Ngọc Thành |
| Mã sinh viên | `HE186491` |
| Email commit | `thanhnnhe186491@fpt.edu.vn` |
| Vai trò | Team lead, foundation owner, integration owner, reviewer và merge owner |
| Branch foundation | `feature/thanh-auth-rbac-foundation` |
| Branch PayOS | `feature/thanh-payos-payment` |

### 1.2 Phạm vi Thành sở hữu

Theo các addendum mới nhất, Thành sở hữu:

- Auth, JWT và role-based access control.
- Shared API response/error/request-ID contract.
- Request validation primitive và middleware chung.
- Audit log foundation và Admin audit UI.
- Shared frontend API client, AuthContext và route guard.
- Homepage tiếng Việt và shared storefront/account layout.
- Profile editing, đổi mật khẩu và avatar.
- Upload foundation cho avatar và ảnh sản phẩm.
- Address Book API/UI nền tảng.
- Notification API/UI, unread count, bell, dropdown, detail, read/delete rule.
- Email outbox/worker, password reset OTP, contact email và order confirmation email foundation.
- PayOS SDK/configuration, hosted checkout, redirect/result, public webhook, signature verification và webhook registration.
- Demo fixture/default account foundation.
- Integration review, `merge --no-ff` và regression gate.

### 1.3 Ranh giới ownership

| Thành sở hữu | Thành viên khác sở hữu |
|---|---|
| Upload storage, MIME/size/content validation | Phạm Thành Chung tích hợp upload vào Product Management |
| Address Book model/API/UI | Nguyễn Quang Huy tích hợp address selector và snapshot vào Order |
| Notification system chung | Huy/Nhật/Cường phát event nghiệp vụ |
| PayOS credential, SDK, link, webhook, signature | Huy sở hữu Order/Payment state, COD, idempotency và refund invariant |
| Email outbox/worker | Huy phát `ORDER_CREATED` sau checkout commit |
| Validation primitive/error envelope | Mỗi module owner giữ validation quyền, trạng thái và invariant nghiệp vụ |

Các dòng ownership mới trong `00_RECONCILIATION_OVERVIEW.md` và `06_ACCOUNT_MEDIA_NOTIFICATION_ADDRESS_PLAN.md` được ưu tiên hơn các bảng cũ. Vì vậy:

- Notification không còn thuộc Lê Vũ Cường ở tầng foundation.
- Homepage không còn thuộc Phạm Thành Chung.
- PayOS provider/webhook không thuộc Nguyễn Quang Huy.

---

## 2. Kiến trúc tổng thể

### 2.1 Luồng một HTTP request

```text
Browser/PayOS
  → Express app
  → Request ID
  → CORS
  → JSON parser/body limit
  → Rate limiter
  → Router
  → Authenticate JWT nếu endpoint private
  → Authorize role nếu endpoint theo vai trò
  → Request schema validation
  → Controller
  → Service/business validation
  → Repository/Mongoose
  → MongoDB hoặc external provider
  → Response envelope
```

### 2.2 Luồng frontend

```text
React Page/Component
  → service phía client
  → apiClient/fetch
  → backend API
  → response envelope
  → cập nhật local state/AuthContext
  → render loading/error/success/empty state
```

### 2.3 Ba lớp validation

1. Frontend validation: hỗ trợ UX, ngăn input hiển nhiên không hợp lệ.
2. Request-boundary validation: kiểm shape/format trước controller.
3. Service validation: kiểm ownership, role, state transition và invariant nghiệp vụ.

Backend luôn là nguồn xác thực cuối cùng.

---

## 3. Backend foundation, security, validation và response

### 3.1 `server/src/app.js`

File: [`server/src/app.js`](../server/src/app.js)

| Dòng | Giải thích |
|---|---|
| 1-27 | Import Express, CORS, các router và middleware chung. |
| 29 | `createApp({ rateLimit = true } = {})` cho phép test tắt rate limiter. |
| 30-31 | Khởi tạo Express app. |
| 32 | Gắn `requestId` trước các middleware khác để mọi response/lỗi có thể truy vết. |
| 33 | Áp dụng CORS theo allowlist. |
| 34 | Giới hạn JSON body `100kb`. |
| 35-38 | Auth tối đa 30 request/15 phút; Contact tối đa 5 request/15 phút. |
| 39-46 | Public `/uploads`; tắt index redirect, thêm `nosniff`, cache một ngày. |
| 48-50 | Health endpoint. |
| 51-70 | Mount toàn bộ router. Auth router dùng prefix `/api/auth`; các router khác dùng `/api`. |
| 72 | Route không tồn tại đi vào `notFound`. |
| 73 | Mọi lỗi cuối cùng đi qua `errorHandler`. |

Thứ tự middleware rất quan trọng. Nếu `errorHandler` đặt trước router thì nó không bắt được lỗi phát sinh từ router. Nếu `requestId` đặt sau validator thì lỗi validation không có request ID.

### 3.2 `server/src/middlewares/requestId.middleware.js`

File: [`server/src/middlewares/requestId.middleware.js`](../server/src/middlewares/requestId.middleware.js)

| Dòng | Giải thích |
|---|---|
| 3 | Request ID tối đa 128 ký tự. |
| 4 | Regex chỉ cho chữ, số, dấu chấm, gạch dưới, hai chấm và gạch ngang. |
| 6-9 | Đọc `x-request-id` từ request header. |
| 11-13 | Kiểm chuỗi incoming có an toàn hay không. |
| 15-20 | Dùng incoming ID nếu hợp lệ; nếu không thì tạo UUID, gắn vào `req.requestId` và response header. |

### 3.3 `server/src/middlewares/security.middleware.js`

File: [`server/src/middlewares/security.middleware.js`](../server/src/middlewares/security.middleware.js)

| Dòng | Giải thích |
|---|---|
| 3-5 | Đọc `CORS_ORIGINS`, tách bằng dấu phẩy và trim. Mặc định là `http://localhost:5173`. |
| 7-15 | Cho request không có Origin như server-to-server/curl; Origin browser phải nằm trong allowlist. |
| 18-35 | Factory tạo rate limiter và trả response theo error envelope chung. |

Rate limiter mặc định dùng memory store của process. Nếu deploy nhiều instance cần store chung như Redis để giới hạn nhất quán.

### 3.4 `server/src/utils/apiResponse.js`

File: [`server/src/utils/apiResponse.js`](../server/src/utils/apiResponse.js)

| Dòng | Giải thích |
|---|---|
| 1-9 | Map HTTP status sang stable error code. |
| 11-13 | Lấy request ID từ `req` hoặc `res.req`. |
| 15-17 | Ưu tiên errorCode riêng; nếu không có thì dùng map chung. |
| 19-28 | Tạo success envelope. |
| 31-41 | Tạo error envelope. |
| 44-49 | Export helper. |

Success envelope:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "errors": [],
  "requestId": "optional"
}
```

Error envelope:

```json
{
  "success": false,
  "message": "Dữ liệu yêu cầu không hợp lệ",
  "data": null,
  "errors": [{ "field": "email", "message": "Email không hợp lệ" }],
  "errorCode": "VALIDATION_ERROR",
  "requestId": "optional"
}
```

### 3.5 `server/src/utils/apiError.js`

File: [`server/src/utils/apiError.js`](../server/src/utils/apiError.js)

- Dòng 1-9: class mở rộng `Error` và giữ `statusCode`, `errors`, `errorCode`.
- Service dùng `throw new ApiError(...)`; controller chỉ cần `next(error)`.
- Error middleware chịu trách nhiệm biến exception thành HTTP response.

### 3.6 `server/src/middlewares/error.middleware.js`

File: [`server/src/middlewares/error.middleware.js`](../server/src/middlewares/error.middleware.js)

| Dòng | Giải thích |
|---|---|
| 4-6 | Route không tồn tại trả 404. |
| 8-9 | Nếu response đã gửi header thì chuyển lỗi cho Express. |
| 10-12 | JSON malformed → 400 `VALIDATION_ERROR`. |
| 13-15 | Body quá lớn → 413 `PAYLOAD_TOO_LARGE`. |
| 16-18 | `ApiError` giữ nguyên status/message/errors/errorCode. |
| 19 | Lỗi chưa biết → generic 500, không lộ stack/internal message. |

### 3.7 `server/src/validation/requestValidation.js`

File: [`server/src/validation/requestValidation.js`](../server/src/validation/requestValidation.js)

| Dòng | Giải thích |
|---|---|
| 1 | Regex email cơ bản. |
| 2 | Regex số điện thoại Việt Nam: `+84` hoặc `0`, đầu số 3/5/7/8/9 và 8 số sau. |
| 4-6 | `makeRule` tạo object gồm check/message/normalize. |
| 9-11 | `required`. |
| 12-14 | `email`; email được trim/lowercase. |
| 15-17 | `minLength`. |
| 18-20 | `maxLength`. |
| 21-23 | `phone`; bỏ dấu chấm, gạch ngang và khoảng trắng. |
| 24-26 | `pattern`. |
| 27-29 | `equalsField`, dùng cho confirm password. |
| 32-49 | Chạy schema, trim string, normalize, dừng ở lỗi đầu của từng field và trả `{value, errors}`. |

### 3.8 `server/src/middlewares/validateRequest.middleware.js`

File: [`server/src/middlewares/validateRequest.middleware.js`](../server/src/middlewares/validateRequest.middleware.js)

| Dòng | Giải thích |
|---|---|
| 4 | Nhận schema và trả Express middleware. |
| 6 | Validate `req.body`. |
| 7-9 | Có field error → 400 `VALIDATION_ERROR`. |
| 10 | Thay body gốc bằng body đã normalize. |
| 11 | Chuyển sang controller. |

Hạn chế hiện tại: middleware chung chỉ xử lý body, chưa xử lý query/path param. Query/path được từng service validate riêng.

---

## 4. Auth, JWT và RBAC backend

### 4.1 `server/src/models/role.model.js`

File: [`server/src/models/role.model.js`](../server/src/models/role.model.js)

- Dòng 3-23: Role schema.
- Dòng 5-11: `roleName` required, unique và chỉ nhận `Customer`, `Staff`, `WarehouseManager`, `Admin`.
- Dòng 12-16: description.
- Dòng 17-20: permissions array.

`permissions` hiện chưa được middleware sử dụng. Authorization thực tế dựa vào `roleName` hard-coded ở route.

### 4.2 `server/src/models/user.model.js`

File: [`server/src/models/user.model.js`](../server/src/models/user.model.js)

| Dòng | Trường |
|---|---|
| 5-9 | `fullName`, required và trim. |
| 10-16 | `email`, required, unique, lowercase, trim. |
| 17-20 | `passwordHash`, không lưu plain password. |
| 21-30 | `phone` và `phoneNumber`. |
| 31-35 | Basic address dạng string. |
| 36-40 | `roleId` tham chiếu Role. |
| 41-45 | `Active` hoặc `Disabled`. |
| 46-50 | Avatar URL. |
| 51-54 | Last login time. |
| 55-58 | Password version timestamp. |
| 60 | Timestamps Mongo. |
| 63 | Index theo role và status. |

### 4.3 `server/src/config/seedRoles.js`

File: [`server/src/config/seedRoles.js`](../server/src/config/seedRoles.js)

- Khai báo bốn role chuẩn.
- Seed bằng upsert `$setOnInsert`, nên chạy nhiều lần không tạo role trùng.
- Được gọi khi server khởi động trước khi nhận request.

### 4.4 `server/src/routes/auth.routes.js`

File: [`server/src/routes/auth.routes.js`](../server/src/routes/auth.routes.js)

#### Register schema, dòng 9-15

- `fullName`: required, tối đa 120.
- `email`: required, email format.
- `phone`: required, số Việt Nam.
- `address`: required, tối đa 500.
- `password`: required, tối thiểu 8.

#### Login schema, dòng 16-19

- Email required + format.
- Password required.

#### Forgot/reset schema, dòng 20-28

- Forgot password: email required + format.
- Reset password: email, OTP đúng 6 số, password tối thiểu 8, confirmation khớp.

#### Route, dòng 30-35

| Method | Path | Guard |
|---|---|---|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/forgot-password` | Public |
| POST | `/api/auth/reset-password` | Public |
| GET | `/api/auth/me` | JWT |
| POST | `/api/auth/logout` | JWT |

### 4.5 `server/src/controller/auth.controller.js`

File: [`server/src/controller/auth.controller.js`](../server/src/controller/auth.controller.js)

| Dòng | Giải thích |
|---|---|
| 7-21 | Tạo password reset service với transaction manager Mongoose. |
| 23-30 | Register controller gọi `registerCustomer`. |
| 32-39 | Login controller gọi `login`. |
| 41-43 | `/me` trả user từ JWT middleware. |
| 45-47 | Logout chỉ trả acknowledgement. |
| 49-56 | Forgot password. |
| 58-65 | Reset password. |

Controller mỏng; validation và nghiệp vụ nằm trong route/service.

### 4.6 `server/src/services/auth.service.js`

File: [`server/src/services/auth.service.js`](../server/src/services/auth.service.js)

#### Helper, dòng 8-40

- Dòng 10-12: normalize email bằng trim/lowercase.
- Dòng 14-30: public user DTO; không trả `passwordHash`.
- Dòng 32-40: validation service lần hai, bảo vệ khi service được gọi ngoài Express route.

#### Repository, dòng 42-71

- Tìm User theo email và populate Role.
- Tạo User rồi đọc lại với Role.
- Update `lastLoginAt`.
- Tìm Role theo tên.
- Ghi AuditLog.

#### Register, dòng 84-123

```text
Validate
→ normalize email
→ kiểm tra duplicate
→ tìm role Customer
→ bcrypt hash
→ tạo User Active
→ audit AUTH_REGISTER
→ trả public DTO
```

- Duplicate email → 400.
- Thiếu role Customer → 500 do lỗi cấu hình.
- User mới luôn là Customer; client không được tự chọn role.

#### Login, dòng 125-161

```text
Normalize email
→ tìm User
→ kiểm status
→ bcrypt compare
→ update lastLoginAt
→ sign JWT
→ audit AUTH_LOGIN_SUCCESS
→ trả token/user
```

- Email không tồn tại và password sai đều trả cùng 401 để hạn chế account enumeration.
- Disabled trả 403.

### 4.7 `server/src/utils/password.js`

File: [`server/src/utils/password.js`](../server/src/utils/password.js)

- Dùng `bcryptjs`.
- Hash với 10 rounds.
- `comparePassword` so plaintext input với hash trong database.

### 4.8 `server/src/utils/jwt.js`

File: [`server/src/utils/jwt.js`](../server/src/utils/jwt.js)

JWT chứa:

- `sub`: User ID.
- Role.
- Email.
- `pwd`: timestamp của `passwordChangedAt`.
- Expiry mặc định 7 ngày.

`pwd` là password version. Khi mật khẩu thay đổi và timestamp DB thay đổi, JWT cũ bị xem là stale.

### 4.9 `server/src/middlewares/auth.middleware.js`

File: [`server/src/middlewares/auth.middleware.js`](../server/src/middlewares/auth.middleware.js)

| Dòng | Giải thích |
|---|---|
| 5-8 | Dependency injection giúp unit test verify token/User lookup. |
| 11-13 | Yêu cầu Bearer token; thiếu → `AUTH_TOKEN_MISSING`. |
| 15 | Verify signature/expiry. |
| 16-17 | Đọc User mới nhất; không tồn tại/Disabled → `AUTH_ACCOUNT_INVALID`. |
| 19-22 | So JWT `pwd` và `passwordChangedAt`; khác → `AUTH_TOKEN_STALE`. |
| 24-33 | Gắn user sanitize vào request. Role lấy từ DB hiện tại. |
| 35-37 | Token sai/hết hạn → `AUTH_TOKEN_INVALID`. |

### 4.10 `server/src/middlewares/authorize.middleware.js`

File: [`server/src/middlewares/authorize.middleware.js`](../server/src/middlewares/authorize.middleware.js)

- Nhận danh sách role được phép.
- Đọc `req.user.role`.
- Role không nằm trong allowlist → 403.
- Role hợp lệ → `next()`.

Backend guard là authority. Frontend guard chỉ là UX và không thể ngăn người dùng tự gọi API.

### 4.11 Logout thực tế

Backend `/logout` không có token blacklist hay refresh-token revocation. Logout thực tế là client xóa token. Token đã phát vẫn hợp lệ đến khi:

- hết hạn;
- User bị Disabled;
- hoặc `passwordChangedAt` thay đổi.

---

## 5. Auth, route guard và router frontend

### 5.1 `client/src/services/apiClient.js`

File: [`client/src/services/apiClient.js`](../client/src/services/apiClient.js)

| Dòng | Giải thích |
|---|---|
| 1-3 | API base URL từ Vite env; fallback localhost:5000; token key. |
| 5-7 | Lấy localStorage. |
| 9-15 | Đọc token, nhận diện FormData và thêm Bearer header. |
| 17-20 | Gọi fetch. |
| 21-25 | Parse envelope; lỗi thì throw message; thành công trả `payload.data`. |
| 28-31 | Chuyển relative upload URL sang backend origin. |

Hạn chế: `apiRequest` bỏ `errorCode` và field `errors`, nên UI chung không thể render field error chi tiết.

### 5.2 `client/src/services/authService.js`

File: [`client/src/services/authService.js`](../client/src/services/authService.js)

| Dòng | Giải thích |
|---|---|
| 3-8 | Dashboard mapping theo role. |
| 14-20 | Parse response. |
| 22-26 | Factory cho phép inject storage/fetch trong test. |
| 28-35 | Register. |
| 38-49 | Login và lưu token. |
| 52-54 | `/auth/me`. |
| 56-58 | Logout local. |
| 60-62 | Get token. |
| 64-66 | Dashboard path. |

### 5.3 `client/src/contexts/AuthContext.jsx`

File: [`client/src/contexts/AuthContext.jsx`](../client/src/contexts/AuthContext.jsx)

| Dòng | Giải thích |
|---|---|
| 5 | Tạo context. |
| 7-13 | Normalize role object thành role string. |
| 16-18 | User/token/loading state. |
| 20-48 | Có token khi khởi động thì gọi `/me`; lỗi sẽ xóa phiên. |
| 50-55 | Login cập nhật token và user. |
| 57 | Register passthrough. |
| 59-63 | Logout. |
| 65-67 | Merge Profile update vào current user. |
| 69-74 | Refresh user từ backend. |
| 76-90 | Memo context value. |
| 95-100 | Hook guard, cấm dùng ngoài Provider. |

Biến `active` trong effect ngăn promise cũ set state sau khi component unmount.

### 5.4 `client/src/hooks/useAuth.js`

File: [`client/src/hooks/useAuth.js`](../client/src/hooks/useAuth.js)

- Wrapper ngắn quanh `useAuthContext`.
- Component không cần import context trực tiếp.

### 5.5 `client/src/components/auth/ProtectedRoute.jsx`

File: [`client/src/components/auth/ProtectedRoute.jsx`](../client/src/components/auth/ProtectedRoute.jsx)

- Dòng 9-11: trong lúc `/me` đang kiểm tra, không redirect sớm.
- Dòng 13-15: chưa xác thực → `/unauthorized`, lưu pathname cũ trong router state.
- Dòng 17: xác thực thành công → render children.

### 5.6 `client/src/components/auth/RoleRoute.jsx`

File: [`client/src/components/auth/RoleRoute.jsx`](../client/src/components/auth/RoleRoute.jsx)

- Không có user hoặc role không thuộc `allowedRoles` → `/forbidden`.
- Đúng role → render children.

### 5.7 `client/src/pages/auth/LoginPage.jsx`

File: [`client/src/pages/auth/LoginPage.jsx`](../client/src/pages/auth/LoginPage.jsx)

| Dòng | Giải thích |
|---|---|
| 7-11 | Router, auth action và form state. |
| 13-26 | Submit, chống double submit, login, redirect theo role, error/finally. |
| 45-47 | Accessible error live region. |
| 50-73 | Email/password input với HTML validation. |
| 76-78 | Disable button khi đang gửi. |

### 5.8 `client/src/pages/auth/RegisterPage.jsx`

File: [`client/src/pages/auth/RegisterPage.jsx`](../client/src/pages/auth/RegisterPage.jsx)

| Dòng | Giải thích |
|---|---|
| 9-17 | State fullName/email/phone/password/address. |
| 19-32 | Submit register rồi chuyển Login. |
| 34-36 | Generic updateField. |
| 60-79 | Form controls và basic HTML validation. |

Frontend Register chưa đặt `minLength=8` cho password; backend vẫn kiểm bắt buộc.

### 5.9 `client/src/App.jsx`

File: [`client/src/App.jsx`](../client/src/App.jsx)

| Dòng | Nhóm route |
|---|---|
| 54-65 | Public: home, products, about, contact, login/register và error pages. |
| 67-78 | Protected AccountLayout: profile và notifications. |
| 80-149 | Customer: cart, checkout, order, PayOS payment/result, return, support. |
| 154-225 | Staff. |
| 226-289 | WarehouseManager. |
| 290-337 | Admin. |
| 340 | Unknown route → login. |

Luồng login frontend:

```text
LoginPage
→ AuthContext.login
→ authService.login
→ backend /auth/login
→ localStorage token
→ AuthContext user
→ dashboard theo role
→ ProtectedRoute
→ RoleRoute
```

---

## 6. Layout và Homepage frontend

### 6.1 `PublicLayout.jsx`

File: [`client/src/components/layout/PublicLayout.jsx`](../client/src/components/layout/PublicLayout.jsx)

- Header.
- Outlet cho public page.
- Footer.

### 6.2 `CustomerLayout.jsx`

File: [`client/src/components/layout/CustomerLayout.jsx`](../client/src/components/layout/CustomerLayout.jsx)

- Header có cart.
- Customer content outlet.
- Footer.

### 6.3 `AccountLayout.jsx`

File: [`client/src/components/layout/AccountLayout.jsx`](../client/src/components/layout/AccountLayout.jsx)

- Dòng 8-11: account navigation.
- Dòng 13-35: Customer dùng storefront Header/Footer; role nội bộ dùng InternalTopbar.
- Profile/Notification là account-level page, không bị trộn vào nghiệp vụ warehouse/staff/admin.

### 6.4 `AppLayout.jsx`

File: [`client/src/components/layout/AppLayout.jsx`](../client/src/components/layout/AppLayout.jsx)

- Dòng 9-14: sidebar/mobile state và refs.
- Dòng 16-25: theo dõi breakpoint 900px.
- Dòng 27-56: khi sidebar mobile mở, khóa scroll, bắt Escape và giữ focus trong drawer.
- Dòng 58-90: render internal shell, sidebar, overlay, topbar và outlet.

### 6.5 `Header.jsx`

File: [`client/src/components/layout/Header.jsx`](../client/src/components/layout/Header.jsx)

- Dòng 9-14: public links.
- Dòng 18-26: tạo initials.
- Dòng 28-71: menu theo role.
- Dòng 74 trở đi: search, mobile menu, profile menu, logout và cart.
- Dòng 240: NotificationBell.
- Có click-outside, Escape và focus management cho dropdown/mobile navigation.

### 6.6 `Sidebar.jsx`

File: [`client/src/components/layout/Sidebar.jsx`](../client/src/components/layout/Sidebar.jsx)

- Dòng 7-35: link set cho từng role.
- Dòng 38-65: chọn link theo `user.role`, render NavLink và hỗ trợ mobile close.

### 6.7 `Footer.jsx`

File: [`client/src/components/layout/Footer.jsx`](../client/src/components/layout/Footer.jsx)

- Dòng 3-14: discovery/support links.
- Dòng 16 trở đi: brand, contact, navigation và copyright.

### 6.8 `HomePage.jsx`

File: [`client/src/pages/public/HomePage.jsx`](../client/src/pages/public/HomePage.jsx)

| Dòng | Giải thích |
|---|---|
| 3-5 | GSAP, React GSAP và ScrollTrigger. |
| 12 | Register plugin. |
| 14-140 | Category, trust item, benefit, order steps và review content. |
| 142-161 | Product tile và image fallback. |
| 163-188 | Fetch 8 sản phẩm public, loading và safe cleanup. |
| 190-221 | GSAP animation; reduced-motion thì bỏ animation. |
| 223-229 | Search chuyển sang listing; chỉ lấy 6 featured product. |
| 231 trở đi | Render hero, categories, benefits, products, process, reviews và CTA. |

### 6.9 CSS liên quan

| File/dòng | Phạm vi |
|---|---|
| `client/src/styles/tokens.css:17` | Design token màu, spacing, typography. |
| `client/src/styles/base.css:38-41` | Focus-visible cho account/address form. |
| `client/src/styles/base.css:47` | Reduced motion. |
| `client/src/styles/shared-shell.css:3` | Header. |
| `client/src/styles/shared-shell.css:208` | Footer. |
| `client/src/styles/shared-shell.css:430` | Internal sidebar. |
| `client/src/styles/shared-shell.css:481` | Account shell/navigation. |
| `client/src/styles/modules/public-account.css:2` | Login/Register. |
| `client/src/styles.css:2596` | Home premium sections. |
| `client/src/styles.css:3812` | Profile. |
| `client/src/styles.css:4031` | Notification. |
| `client/src/styles.css:789` | Payment panel. |

---

## 7. Profile, đổi mật khẩu, avatar và Address Book

### 7.1 `server/src/routes/profile.routes.js`

File: [`server/src/routes/profile.routes.js`](../server/src/routes/profile.routes.js)

| Dòng | Endpoint |
|---|---|
| 8 | GET `/api/profile` |
| 9 | PATCH `/api/profile` |
| 10 | PATCH `/api/profile/password` |
| 11 | GET `/api/profile/addresses` |
| 12 | POST `/api/profile/addresses` |
| 13 | PATCH `/api/profile/addresses/:id` |
| 14 | PATCH `/api/profile/addresses/:id/default` |
| 15 | DELETE `/api/profile/addresses/:id` |

Tất cả đều authenticate. Controller dùng `req.user.id`, không nhận user ID tùy ý từ body.

### 7.2 `server/src/controller/profile.controller.js`

File: [`server/src/controller/profile.controller.js`](../server/src/controller/profile.controller.js)

- Dòng 5-12: get profile.
- Dòng 13-20: update profile.
- Dòng 21-28: change password.
- Dòng 29-64: Address Book CRUD/default.
- Controller chỉ delegate và dùng response envelope.

### 7.3 `server/src/services/profile.service.js`

File: [`server/src/services/profile.service.js`](../server/src/services/profile.service.js)

#### Public DTO, dòng 13-35

- Role được normalize thành `{id, roleName}`.
- Không trả password hash.
- Trả fullName, email, phone, address, avatar, status, login/timestamp.

#### Profile validation, dòng 37-67

- Chỉ sửa `fullName`, `phoneNumber`, `address`.
- Protected field như email/role/status/avatar không được sửa qua generic PATCH.
- Full name: 2-120.
- Phone: số Việt Nam.
- Address: required và tối đa 500.

#### Password validation, dòng 69-83

- Current password required.
- New password tối thiểu 8, có chữ và số.
- Confirm khớp.
- Không được giống current password.

#### Service flow

- Dòng 119-120: get profile.
- Dòng 123-135: validate/update/audit profile.
- Dòng 137-152: verify current password, hash new password, update và audit.
- Dòng 155-169: avatar URL phải đúng `/uploads/avatars/<UUID>.<ext>`.
- Dòng 171-181: clear avatar và audit.

#### Lỗi password version hiện tại

Repository `updatePassword`, dòng 93-95, chỉ `$set: {passwordHash}`. Nó không set `passwordChangedAt`.

Hậu quả:

```text
Đổi password trong Profile
→ passwordHash thay đổi
→ passwordChangedAt không đổi
→ JWT cũ vẫn có cùng pwd claim
→ các phiên cũ chưa bị revoke
```

Reset-password OTP không có lỗi này vì cập nhật cả hai field.

### 7.4 `server/src/routes/upload.routes.js`

File: [`server/src/routes/upload.routes.js`](../server/src/routes/upload.routes.js)

- Dòng 10-16: Admin/Staff upload tối đa 5 product images.
- Dòng 17-22: Admin/Staff xóa product image.
- Dòng 23: authenticated user upload avatar của mình.
- Dòng 24: authenticated user xóa avatar của mình.

### 7.5 `server/src/middlewares/upload.middleware.js`

File: [`server/src/middlewares/upload.middleware.js`](../server/src/middlewares/upload.middleware.js)

- Dòng 6: MIME allowlist JPEG/JPG/PNG/WebP.
- Dòng 8-21: memory storage, 5 MB/file, tối đa 5 file và 10 fields.
- Dòng 23-34: chuyển Multer error thành ApiError 400/413.
- Dòng 36: avatar field tên `avatar`.
- Dòng 37: product field tên `images`.

### 7.6 `server/src/services/upload.service.js`

File: [`server/src/services/upload.service.js`](../server/src/services/upload.service.js)

| Dòng | Giải thích |
|---|---|
| 7-9 | Upload root, collection allowlist và 5 MB. |
| 11-23 | Detect JPEG/PNG/WebP bằng magic byte. |
| 25-27 | Làm sạch original filename. |
| 29-37 | Resolve collection directory an toàn. |
| 40-67 | Validate buffer/size/type, tạo UUID filename, exclusive write và trả URL. |
| 70-78 | Multi-upload rollback file đã lưu nếu một file lỗi. |
| 81-94 | Chỉ xóa managed UUID path; kiểm resolved path không thoát uploads root. |

### 7.7 `server/src/controller/upload.controller.js`

File: [`server/src/controller/upload.controller.js`](../server/src/controller/upload.controller.js)

- Product upload dùng upload foundation rồi ProductMedia service của Chung.
- Avatar upload:
  1. lưu file;
  2. update User avatar;
  3. xóa avatar cũ;
  4. nếu update User lỗi thì xóa file mới để không tạo orphan.
- Delete avatar clear profile trước rồi xóa managed file cũ.

### 7.8 `server/src/models/userAddress.model.js`

File: [`server/src/models/userAddress.model.js`](../server/src/models/userAddress.model.js)

Schema gồm userId, label, receiverName, phoneNumber, province, district, ward, addressLine, isDefault và timestamps.

- Dòng 59: list index theo user/time.
- Dòng 60-67: partial unique index cho tối đa một default address mỗi User.

### 7.9 `server/src/services/userAddress.service.js`

File: [`server/src/services/userAddress.service.js`](../server/src/services/userAddress.service.js)

#### Validation, dòng 29-55

- Create yêu cầu đủ bảy trường địa chỉ.
- Partial update chỉ validate field được gửi.
- Phone đúng regex Việt Nam.
- Label tối đa 50.
- Receiver name tối đa 120.
- Address line tối đa 300.
- Field không thuộc whitelist bị từ chối.

#### Ownership, dòng 57-83

Mọi find/update/delete đều dùng cả `userId` và address ID. Biết ID của người khác vẫn không thể cập nhật.

#### Default rule, dòng 86-136

- `requireAddress`: invalid/non-owned → 404.
- Address đầu tiên tự default.
- Tạo/update `isDefault=true` sẽ unset default cũ.
- Set default có endpoint riêng.
- Xóa default sẽ promote address còn lại đầu tiên.

Các thao tác unset/set chưa được bọc transaction; unique index ngăn hai default nhưng gián đoạn có thể để tạm thời không có default.

### 7.10 `client/src/services/profileService.js`

File: [`client/src/services/profileService.js`](../client/src/services/profileService.js)

- Dòng 20-22: profile get/update/password.
- Dòng 23-27: Address Book CRUD/default.
- Dòng 28-32: avatar FormData.
- Dòng 33: delete avatar.
- Custom parseResponse giữ `errorCode` và `errors` khi dùng injected fetcher; đường `apiRequest` chung vẫn bỏ chúng.

### 7.11 `client/src/pages/profile/ProfilePage.jsx`

File: [`client/src/pages/profile/ProfilePage.jsx`](../client/src/pages/profile/ProfilePage.jsx)

#### State, dòng 21-34

- Profile, addresses.
- Ba form riêng: profile/password/address.
- Editing address ID.
- Avatar preview.
- Loading/busy/message/error.

#### Load, dòng 36-60

- Profile và addresses chạy song song.
- Chỉ Customer gọi Address Book.
- Populate form từ backend response.

#### Avatar preview cleanup, dòng 62-69

- Nếu URL bắt đầu bằng `blob:` thì revoke khi đổi/unmount.
- Current avatar ưu tiên local preview rồi mới server URL.

#### Update profile, dòng 81-94

- Gọi service.
- Update page state.
- Update AuthContext để Header cập nhật ngay.

#### Avatar, dòng 96-134

- Frontend kiểm MIME và 5 MB.
- Tạo preview trước khi upload.
- Thành công cập nhật Profile/AuthContext.
- Lỗi thì bỏ preview.

#### Password, dòng 136-148

- Gửi current/new/confirm.
- Thành công clear form.

#### Address, dòng 150-212

- Edit: copy item vào form.
- Create/update rồi reload list.
- Set default dùng optimistic UI và rollback nếu backend lỗi.
- Delete có browser confirmation rồi reload.

#### HTML validation, dòng 251-305

- Profile name 2-120.
- Phone pattern Việt Nam.
- Address tối đa 500.
- Password input tối thiểu 8.
- Address label/receiver/addressLine max length.
- Region/phone required.

---

## 8. Notification backend và frontend

### 8.1 `server/src/models/notification.model.js`

File: [`server/src/models/notification.model.js`](../server/src/models/notification.model.js)

Các nhóm field:

- Recipient: `userId`.
- Idempotency: `eventId`.
- Nội dung: type, subject, content.
- Channel/delivery: channel, deliveryStatus.
- Target: targetCollection, targetId.
- Read/delete: isRead, readAt, deletedAt.

Index:

- Dòng 80: user/time.
- Dòng 81: user/deleted/time.
- Dòng 82: delivery status.
- Dòng 83-86: partial unique `{userId,eventId}`.

### 8.2 `server/src/routes/notification.routes.js`

File: [`server/src/routes/notification.routes.js`](../server/src/routes/notification.routes.js)

| Method | Path |
|---|---|
| GET | `/api/notifications` |
| GET | `/api/notifications/:id` |
| PATCH | `/api/notifications/:id/read` |
| DELETE | `/api/notifications/:id` |

Tất cả cần JWT.

### 8.3 `server/src/controller/notification.controller.js`

File: [`server/src/controller/notification.controller.js`](../server/src/controller/notification.controller.js)

- Mọi method truyền `req.user.id` vào service.
- User không thể truyền userId tùy ý để đọc notification người khác.

### 8.4 `server/src/services/notification.service.js`

File: [`server/src/services/notification.service.js`](../server/src/services/notification.service.js)

#### DTO/cursor, dòng 17-57

- Chuyển Mongo document thành response DTO.
- Cursor base64 chứa createdAt và ID.
- Cursor malformed → 400.

#### List validation, dòng 59-73

- `status`: `all` hoặc `unread`.
- `limit`: integer 1-50.
- Default 20.

#### Repository, dòng 75-139

- `createIdempotent` dùng eventId unique.
- List luôn scope `userId` và `deletedAt:null`.
- Unread filter thêm `isRead:false`.
- Cursor dùng createdAt/ID để tránh trùng hoặc bỏ item.
- Detail/mark/delete đều owner-scoped.
- Delete query yêu cầu `isRead:true`.

#### Service, dòng 142-236

- `notifyPaymentStatus`: tạo notification theo trạng thái payment.
- `createInAppNotification`: eventId chống trùng.
- `listMyNotifications`: items, unreadCount, nextCursor.
- `getNotification`: invalid/non-owned → 404.
- `markAsRead`: idempotent.
- `deleteNotification`: unread → 409 `NOTIFICATION_UNREAD_CANNOT_DELETE`; read → soft delete.

Điểm cần chú ý: `notifyPaymentStatus` tạo Notification channel Email nhưng không trực tiếp enqueue EmailOutbox.

### 8.5 `client/src/services/notificationService.js`

File: [`client/src/services/notificationService.js`](../client/src/services/notificationService.js)

- Dòng 17-24: build query status/limit/cursor.
- Dòng 25-27: detail.
- Dòng 28-31: mark read.
- Dòng 33-35: delete.

### 8.6 `client/src/components/notifications/NotificationBell.jsx`

File: [`client/src/components/notifications/NotificationBell.jsx`](../client/src/components/notifications/NotificationBell.jsx)

| Dòng | Giải thích |
|---|---|
| 6-9 | Format thời gian vi-VN. |
| 12-19 | Dropdown/items/unread/loading/error và refs. |
| 21-24 | Close và trả focus về trigger. |
| 26-38 | Load 5 preview item. |
| 40-42 | Initial load. |
| 44-61 | Click outside và Escape cleanup. |
| 63-67 | Toggle; mở thì refresh data. |
| 69-80 | Mark unread rồi navigate detail. |
| 82-131 | Badge, dialog, loading/error/empty/items/view-all. |

Badge hiển thị `99+` nếu unreadCount lớn hơn 99.

### 8.7 `client/src/pages/notifications/NotificationPage.jsx`

File: [`client/src/pages/notifications/NotificationPage.jsx`](../client/src/pages/notifications/NotificationPage.jsx)

- Dòng 12-18: filter/items/unread/cursor/loading/error state.
- Dòng 20-34: list 20 item; append khi load more.
- Dòng 36-38: đổi tab thì reload.
- Dòng 40-47: delete rồi filter state.
- Dòng 60-63: tabs all/unread.
- Dòng 65-67: error/loading/empty.
- Dòng 69-85: list.
- Dòng 79-81: chỉ item read mới có nút xóa.
- Dòng 87-91: cursor load more.

### 8.8 `client/src/pages/notifications/NotificationDetailPage.jsx`

File: [`client/src/pages/notifications/NotificationDetailPage.jsx`](../client/src/pages/notifications/NotificationDetailPage.jsx)

- Load detail theo route ID.
- Item chưa đọc được mark read.
- Hiển thị subject/content/timestamp.
- Tạo deep-link an toàn theo target.
- Target nghiệp vụ đã mất vẫn giữ fallback content của Notification.

---

## 9. Email outbox, OTP reset password và Contact

### 9.1 `server/src/models/passwordResetToken.model.js`

File: [`server/src/models/passwordResetToken.model.js`](../server/src/models/passwordResetToken.model.js)

- `userId`.
- `otpHash`, select false.
- `expiresAt` và TTL index.
- `attemptCount`, tối đa 5.
- `usedAt`.

OTP plaintext không nằm trong token collection.

### 9.2 `server/src/services/passwordReset.service.js`

File: [`server/src/services/passwordReset.service.js`](../server/src/services/passwordReset.service.js)

#### Secret và crypto, dòng 7-39

- Generic anti-enumeration response.
- Production yêu cầu reset secret tối thiểu 32 ký tự.
- OTP hash: HMAC-SHA256 của normalized email + OTP.
- Outbox OTP: AES-256-GCM, random IV và auth tag.

#### Token repository, dòng 41-84

- Invalidate token cũ.
- Create token.
- Tìm token chưa dùng mới nhất.
- Atomic increment failed attempt.
- Consume chỉ khi chưa dùng, chưa hết hạn và chưa quá attempt.

#### Reset input validation, dòng 92-102

- Email format.
- OTP đúng 6 số.
- Password tối thiểu 8.
- Có chữ hoa, chữ thường và số.
- Confirmation khớp.

#### Request reset, dòng 120-147

```text
Normalize email
→ tìm User
→ missing/Disabled vẫn trả message chung
→ kiểm cooldown 60 giây
→ invalidate OTP cũ
→ sinh OTP 6 số
→ lưu HMAC hash, TTL 10 phút
→ enqueue encrypted OTP email
```

#### Reset password, dòng 150-180

- User/token không hợp lệ → `OTP_INVALID_OR_USED`.
- Hết hạn → `OTP_EXPIRED`.
- Quá 5 lần → `OTP_ATTEMPT_LIMIT`.
- OTP sai → atomic increment và `OTP_INCORRECT`.
- OTP đúng → transaction consume token + update passwordHash/passwordChangedAt.

### 9.3 `server/src/models/emailOutbox.model.js`

File: [`server/src/models/emailOutbox.model.js`](../server/src/models/emailOutbox.model.js)

Các field chính:

- idempotencyKey unique.
- eventType, recipient, payload.
- Pending/Processing/Sent/Failed.
- attemptCount, availableAt.
- leaseUntil, claimId.
- sentAt, providerMessageId, lastError.

Index `{status, availableAt}` hỗ trợ worker claim item đến hạn.

### 9.4 `server/src/services/email.service.js`

File: [`server/src/services/email.service.js`](../server/src/services/email.service.js)

#### Config, dòng 4-13

- Nếu provider không phải SMTP thì không yêu cầu credential.
- SMTP yêu cầu host/user/pass/from.
- Reset secret tối thiểu 32 ký tự.

#### Render, dòng 15-37

- Password reset OTP.
- Contact submission.
- Order created confirmation.

#### Provider, dòng 39-68

- `fake`: test provider.
- `disabled`: không gửi ra ngoài.
- `smtp`: lazy-load Nodemailer và gửi email.
- SMTP port mặc định 465, secure mặc định true.

#### Repository, dòng 70-90

- Find/create idempotent event.
- Claim Pending/Failed đến hạn hoặc Processing đã hết lease.
- Claim tạo UUID claimId.
- Mark sent/failed chỉ khi claimId còn đúng.

#### Outbox service, dòng 93-124

- Enqueue trả item cũ nếu idempotency key tồn tại.
- Duplicate race code 11000 được xử lý bằng đọc lại item.
- Deliver claim một item với lease 60 giây.
- Provider disabled → Failed, retry sau một phút.
- SMTP lỗi → exponential backoff, tối đa một giờ.
- Worker cũ mất lease → `LostLease`, không ghi đè worker mới.

### 9.5 `server/src/workers/email.worker.js`

File: [`server/src/workers/email.worker.js`](../server/src/workers/email.worker.js)

- Interval mặc định 5 giây.
- `draining` chống cùng worker chạy hai drain song song.
- `start` idempotent.
- `stop` clear interval.
- `isRunning` dùng cho lifecycle/test.

### 9.6 `server/src/server.js`

File: [`server/src/server.js`](../server/src/server.js)

| Dòng | Giải thích |
|---|---|
| 1 | Load env. |
| 11-13 | Connect DB và seed roles. |
| 15-17 | Tạo app, email outbox service và start worker. |
| 18-20 | Listen port. |
| 23-25 | Startup failure log và exit. |

Server chưa gắn `SIGINT/SIGTERM` để gọi `emailWorker.stop()`, dù worker đã có stop API.

### 9.7 `server/src/routes/contact.routes.js`

File: [`server/src/routes/contact.routes.js`](../server/src/routes/contact.routes.js)

- Name required, tối đa 120.
- Email required + format.
- Phone optional nhưng phải đúng định dạng nếu có.
- Subject required, tối đa 160.
- Message 10-5000.
- Public POST `/api/contact`.
- App-level rate limit 5 request/15 phút.

### 9.8 `server/src/services/contact.service.js`

File: [`server/src/services/contact.service.js`](../server/src/services/contact.service.js)

```text
Validate request
→ tạo ContactRequest New
→ enqueue CONTACT_SUBMISSION
→ trả ID/status
```

Contact write và outbox enqueue không nằm trong transaction. Nếu enqueue lỗi, ContactRequest đã tồn tại nhưng API có thể trả lỗi.

### 9.9 Order confirmation email integration

File: [`server/src/services/order.service.js`](../server/src/services/order.service.js), dòng 329-356.

- Sau checkout commit, lấy email Customer.
- Enqueue `ORDER_CREATED:<orderId>`.
- Idempotency key ngăn gửi hai lần khi checkout replay.
- Lookup/enqueue lỗi được ghi audit vận hành và không đổi response của Order đã commit.

Đây là integration của Huy sử dụng email foundation của Thành.

### 9.10 Environment

File: [`server/.env.example`](../server/.env.example)

| Dòng | Biến |
|---|---|
| 3 | `JWT_SECRET` |
| 4 | `RESET_OTP_SECRET` |
| 5 | `CORS_ORIGINS` |
| 6 | `APP_PUBLIC_URL` |
| 9-15 | PayOS credentials/URLs/TTL |
| 18-25 | SMTP/Mail/Contact Inbox |

Không commit secret thật.

---

## 10. Audit log backend và frontend

### 10.1 `server/src/models/auditLog.model.js`

File: [`server/src/models/auditLog.model.js`](../server/src/models/auditLog.model.js)

Các field:

- userId/actor.
- action.
- targetEntity/targetId.
- description.
- before/after.
- ip/userAgent.
- immutable timestamp.

Index theo user/time và action/time.

Tài liệu mong có field `reason`; model hiện dùng `description`, không có `reason` riêng.

### 10.2 `server/src/utils/auditLogger.js`

File: [`server/src/utils/auditLogger.js`](../server/src/utils/auditLogger.js)

- Helper append-only gọi `AuditLog.create`.
- Không cung cấp update/delete audit API.

### 10.3 `server/src/routes/auditLog.routes.js`

File: [`server/src/routes/auditLog.routes.js`](../server/src/routes/auditLog.routes.js)

- GET `/api/admin/audit-logs`.
- Authenticate.
- Admin only.

### 10.4 `server/src/services/auditLog.service.js`

File: [`server/src/services/auditLog.service.js`](../server/src/services/auditLog.service.js)

- Validate date filter.
- Validate userId Mongo ObjectId.
- Filter action/user/from/to.
- Sort newest first.
- Limit tối đa 100.

### 10.5 `client/src/services/adminService.js`

File: [`client/src/services/adminService.js`](../client/src/services/adminService.js)

- Build query từ filter không rỗng.
- Gọi `/admin/audit-logs` qua authenticated apiClient.

### 10.6 `client/src/pages/admin/AuditLogPage.jsx`

File: [`client/src/pages/admin/AuditLogPage.jsx`](../client/src/pages/admin/AuditLogPage.jsx)

- Filter action, user ID, from, to.
- Initial load và refresh.
- Hiển thị actor/action/target/description/time.
- Route chỉ Admin, backend cũng kiểm Admin.

---

## 11. PayOS backend và frontend

### 11.1 Ownership

Thành sở hữu:

- `@payos/node`.
- Credential/env.
- Provider order code và hosted link.
- Return/cancel URL.
- Public webhook.
- Signature verification.
- Webhook registration script.
- Payment redirect/result integration frontend.

Huy sở hữu:

- Order/Payment/PaymentAttempt state.
- Customer ownership và amount validation.
- Callback event history/idempotency state machine.
- Late payment/refund invariant.
- COD.

### 11.2 `server/src/config/payos.js`

File: [`server/src/config/payos.js`](../server/src/config/payos.js)

#### Config, dòng 5-20

- Client ID.
- API key.
- Checksum key.
- Return URL.
- Cancel URL.
- Webhook URL.
- TTL mặc định 15 phút.

#### Missing config, dòng 23-41

- Credential luôn bắt buộc khi tạo client.
- Redirect URL chỉ bắt buộc khi tạo link.
- Webhook URL chỉ bắt buộc khi confirm webhook.
- Lỗi → 503 `PAYOS_NOT_CONFIGURED`.
- Không log hoặc trả secret value.

#### Redirect URL, dòng 43-55

- Thay `{orderId}`.
- Không có placeholder thì thêm query `orderId`.
- URL invalid → `PAYOS_INVALID_REDIRECT_URL`.

#### Gateway, dòng 57-108

- Lazy-create PayOS client.
- `createPaymentLink`: orderCode, integer VND amount, description, return/cancel, expiry.
- `verifyWebhook`: SDK checksum verification.
- `cancelPaymentLink`: retire link cũ tại gateway.
- `confirmWebhook`: đăng ký public webhook URL.

### 11.3 `server/src/scripts/confirmPayOSWebhook.js`

File: [`server/src/scripts/confirmPayOSWebhook.js`](../server/src/scripts/confirmPayOSWebhook.js)

```text
npm run payos:confirm-webhook
→ create gateway
→ assert credential + webhook URL
→ payos.webhooks.confirm(url)
→ log URL đã xác nhận
```

### 11.4 `server/src/routes/payment.routes.js`

File: [`server/src/routes/payment.routes.js`](../server/src/routes/payment.routes.js)

- Dòng 8: POST `/api/orders/:id/payments`, JWT + Customer.
- Dòng 9: POST `/api/payments/payos/webhook`, public.

Webhook không dùng JWT vì PayOS không có user JWT. Signature PayOS là cơ chế xác thực.

### 11.5 `server/src/controller/payment.controller.js`

File: [`server/src/controller/payment.controller.js`](../server/src/controller/payment.controller.js)

- Create: truyền `req.user.id` và `req.params.id` vào service.
- Webhook: truyền raw parsed body vào service.
- Trả response envelope chung.

### 11.6 `server/src/models/paymentAttempt.model.js`

File: [`server/src/models/paymentAttempt.model.js`](../server/src/models/paymentAttempt.model.js)

Các field PayOS:

- orderId, attemptCode.
- paymentMethod/provider.
- providerOrderCode.
- paymentLinkId, checkoutUrl, qrCode.
- amount/currency.
- paymentStatus.
- expiresAt, transactionId, paidAt.
- rawResponse/gatewayMessage.

Index:

- Order + createdAt.
- Provider order code unique.
- Partial unique: mỗi Order chỉ có một Pending PAYOS attempt.

### 11.7 `server/src/models/paymentCallbackEvent.model.js`

File: [`server/src/models/paymentCallbackEvent.model.js`](../server/src/models/paymentCallbackEvent.model.js)

- orderId/paymentAttemptId/provider/providerMessageId.
- Received/Processing/Processed.
- processingStartedAt.
- rawPayload.
- processingResult.
- Unique `{paymentProvider, providerMessageId}`.

Đây là nền tảng idempotency cho webhook retry.

### 11.8 `server/src/services/payment.service.js`

File: [`server/src/services/payment.service.js`](../server/src/services/payment.service.js)

#### Response/helper, dòng 13-55

- `toPaymentResponse`: chuẩn hóa Order + Attempt cho client.
- `generateAttemptCode`: mã nội bộ UUID/time.
- `generateProviderOrderCode`: integer PayOS order code.
- `isReusablePayOSAttempt`: Pending, có checkoutUrl và còn trên 30 giây.
- Parse transaction time.

#### Repository, dòng 57-93

- Order/Payment/Attempt lookup/update.
- Callback event find/create/claim/finalize.
- RefundPending upsert.

#### Callback replay, dòng 104-120

- Callback đã Processed thì đọc `processingResult` và trả lại.
- Không chạy transition lần hai.

#### Verified callback core, dòng 122-170

- Provider message identity bắt buộc.
- Replay trước khi xử lý.
- Order phải tồn tại.
- Amount phải bằng Order total.
- Attempt phải tồn tại và thuộc Order.
- Tạo callback event append-only.
- Duplicate key thì tìm event cũ.
- Claim Processing bằng lease 60 giây.
- Event đang được worker khác xử lý → 409.

#### Duplicate paid, dòng 172-200

Nếu Order đã Paid mà nhận thêm successful payment khác:

- Attempt mới → RefundPending.
- Upsert RefundPending handoff.
- Không cập nhật Order thành Paid lần nữa.
- Audit + notification.

#### Ignore downgrade, dòng 201-204

Order/Attempt đã Paid mà nhận Failed/Cancelled đến sau thì giữ Paid.

#### Late paid, dòng 206-243

Paid callback đến sau khi:

- PayOS link hết hạn;
- hoặc Order Cancelled/Expired.

Kết quả:

- Attempt → RefundPending.
- Order không được reopen.
- Tạo RefundPending handoff.
- Audit + notification.

#### Normal callback, dòng 245-281

- Update attempt status/transaction/raw payload/paidAt.
- Đồng bộ legacy Payment nếu tồn tại.
- Update Order paymentStatus.
- Paid khi `WaitingForPayment` → Order status `Pending`.
- Persist callback result.
- Audit + notification.

#### Create hosted link, dòng 285-357

Validation:

- Order tồn tại.
- Customer sở hữu Order.
- Payment method ONLINE.
- Chưa Paid.
- Order đang WaitingForPayment.
- Amount là positive safe integer VND.
- PayOS config đủ.

Flow:

1. Tìm latest attempt.
2. Còn hạn trên 30 giây → reuse.
3. Link Pending cũ gần hết/hết hạn → gọi cancel, sau đó local Expired/Cancelled.
4. Tạo Pending attempt mới.
5. Unique conflict → reuse concurrent link hoặc 409 creation in progress.
6. Gọi PayOS.
7. Lưu link ID, checkout URL, QR, expiry và raw response.
8. Gateway lỗi → attempt Failed và client nhận 502.

#### PayOS webhook, dòng 366-396

1. Verify payload bằng SDK trước lookup hoặc side effect.
2. Signature sai → `PAYOS_INVALID_WEBHOOK_SIGNATURE`.
3. Signature đúng nhưng orderCode không tồn tại → 2xx ignored, không side effect.
4. Tìm Attempt theo provider order code.
5. Tạo providerMessageId từ paymentLinkId và reference/code.
6. `code === '00'` → Paid; khác → Failed.
7. Gọi verified callback core.

### 11.9 QR timeout và trạng thái sau khi quét

TTL mặc định 15 phút, cấu hình bằng `PAYOS_PAYMENT_LINK_TTL_MINUTES`. Expiry thật do PayOS trả về được lưu trong `PaymentAttempt.expiresAt`.

#### Thanh toán thành công khi còn hạn

```text
Ngân hàng xử lý
→ PayOS webhook
→ verify signature
→ PaymentAttempt Paid
→ Payment Paid nếu có
→ Order.paymentStatus Paid
→ WaitingForPayment thành Pending
→ callback Processed
→ audit + notification
```

#### QR/link hết hạn

- PayOS có thể từ chối giao dịch.
- Khi Customer mở payment lại, backend retire attempt cũ và tạo QR/link mới.

#### Tiền đến sau expiry/cancel

- Không reopen Order.
- Đưa payment vào RefundPending.
- Chuyển cho refund workflow xử lý.

### 11.10 `client/src/services/paymentService.js`

File: [`client/src/services/paymentService.js`](../client/src/services/paymentService.js)

- Tạo Authorization header từ localStorage.
- POST `/orders/:id/payments`.
- Parse response; lỗi throw message.

### 11.11 `client/src/pages/customer/PaymentPage.jsx`

File: [`client/src/pages/customer/PaymentPage.jsx`](../client/src/pages/customer/PaymentPage.jsx)

- Dòng 12-14: mount → create/reuse hosted link.
- Loading/error state.
- Hiển thị order code, amount, PayOS và status.
- Anchor checkout URL đưa browser sang PayOS.

### 11.12 `client/src/pages/customer/PaymentResultPage.jsx`

File: [`client/src/pages/customer/PaymentResultPage.jsx`](../client/src/pages/customer/PaymentResultPage.jsx)

- Normalize query status PAID/CANCELLED/FAILED/Pending.
- Hiển thị trạng thái redirect để phản hồi nhanh.
- Không tự update Order.
- Nội dung UI nói rõ webhook mới là trạng thái chính thức.

### 11.13 Local webhook

PayOS không gọi được `localhost`. Luồng local:

```text
cloudflared HTTPS URL
→ localhost:5000
→ PAYOS_WEBHOOK_URL=https://<tunnel>/api/payments/payos/webhook
→ npm run payos:confirm-webhook
```

Nếu Quick Tunnel đổi domain sau khi restart, phải cập nhật env và confirm webhook lại.

---

## 12. Demo data và default accounts

### 12.1 `server/src/scripts/createAccounts.js`

File: [`server/src/scripts/createAccounts.js`](../server/src/scripts/createAccounts.js)

- Khai báo bốn account theo role.
- Seed role trước.
- Hash mật khẩu một lần.
- Upsert theo email.
- Gán roleId và Active status.
- In credential demo ra terminal.
- Connect/disconnect Mongo trong CLI.

File hiện chưa có npm script riêng trong `server/package.json`.

### 12.2 `server/src/demo-data/demoFixtures.js`

File: [`server/src/demo-data/demoFixtures.js`](../server/src/demo-data/demoFixtures.js)

- Deterministic graph.
- 4 role.
- 13 user, gồm Nguyễn Ngọc Thành là Admin demo.
- 20 address.
- 15 product.
- Order/payment/callback/inventory/refund/support/review/audit relationships.

### 12.3 `server/src/demo-data/demoGraphValidator.js`

File: [`server/src/demo-data/demoGraphValidator.js`](../server/src/demo-data/demoGraphValidator.js)

Kiểm:

- Expected counts.
- Unique key/email/SKU.
- Reference tồn tại.
- Order/payment amount/state.
- Actor đúng role.
- Inventory ledger.
- Timestamp transition.
- Customer có đúng một default address.
- Customer tham gia demo scenario.

### 12.4 `server/src/demo-data/demoSeedSafety.js`

File: [`server/src/demo-data/demoSeedSafety.js`](../server/src/demo-data/demoSeedSafety.js)

Reset chỉ cho phép khi:

- Không phải production.
- Có allow flag.
- Database nằm trong allowlist.
- Confirmation đúng `RESET:<database>`.
- Database hỗ trợ transaction.

Không dùng `dropDatabase`.

### 12.5 `server/src/demo-data/demoSeedCli.js`

File: [`server/src/demo-data/demoSeedCli.js`](../server/src/demo-data/demoSeedCli.js)

- `--dry-run`: validate graph/assets hoàn toàn offline, không connect Mongo.
- `--reset`: chạy guard/preflight nhưng cố ý throw vì chưa có Phase 2 write adapter.
- Plain upsert cũng cố ý throw Phase 2.

Trạng thái chính xác:

- Fixture/validator/dry-run: hoàn thành.
- Mongo transaction-backed upsert/reset: chưa triển khai.

---

## 13. Validation matrix

| Module | Frontend | Request boundary | Service/database |
|---|---|---|---|
| Register | required/type=email | name/email/phone/address/password | duplicate email, Customer role, bcrypt |
| Login | required/type=email | email/password required | credential, Disabled status |
| JWT | route guard | Bearer format | signature, expiry, User status, password version |
| Profile | min/max/pattern | Không có schema middleware riêng | editable whitelist, name/phone/address |
| Password | minLength | Không có schema middleware riêng | current password, complexity, confirmation |
| Avatar | MIME/5 MB | Multer MIME/size | magic byte, collection, UUID path |
| Address | required/max/pattern | Không có schema middleware riêng | owner, whitelist, default uniqueness |
| Notification | tab/button rule | Query service validation | owner, cursor, unread delete guard |
| OTP | form/route | email/6 digit/min/match | HMAC, TTL, cooldown, attempts, single-use |
| Contact | form HTML | name/email/phone/subject/message | persist + idempotent outbox |
| Audit | filter input | Service query validation | Admin only, date/ObjectId, max 100 |
| PayOS link | Customer route | JWT + role | owner, ONLINE, amount, status, concurrency |
| PayOS webhook | Không áp dụng | Public route | signature, provider identity, idempotency, state invariant |

---

## 14. Các sai lệch giữa tài liệu và code

### 14.1 Profile password chưa revoke JWT

- Tài liệu: mọi đổi mật khẩu cập nhật `passwordChangedAt`.
- Code Profile: chỉ update `passwordHash`.
- Code OTP reset: update đúng cả hai.

### 14.2 Validator chung chưa bao phủ query/path

- Tài liệu yêu cầu body/query/path.
- `validateRequest` hiện chỉ đọc `req.body`.

### 14.3 Frontend bỏ field errors

- Backend trả `errorCode` và `errors`.
- `apiClient` chung chỉ throw `message`.
- UI chưa hiển thị lỗi dưới từng field đầy đủ.

### 14.4 Audit contract khác tên field

- Tài liệu: actor/action/target/oldValue/newValue/reason.
- Code: userId/action/targetEntity/targetId/before/after/description.

### 14.5 Address representation

- `User.address` hiện là string.
- Structured shipping address nằm ở `UserAddress`.
- Một dòng tài liệu mô tả `User.address` object là không khớp code.

### 14.6 Notification Email channel chưa nối EmailOutbox

- Payment notification có thể tạo row channel Email.
- Không có enqueue EmailOutbox trực tiếp trong helper này.

### 14.7 Contact persistence boundary

- ContactRequest được tạo trước enqueue.
- Enqueue lỗi có thể làm API báo lỗi dù ContactRequest đã lưu.

### 14.8 Worker shutdown

- Worker có stop API.
- Server chưa gọi stop khi SIGINT/SIGTERM.

### 14.9 Demo seed

- Docs cũ có wording như seed đã chạy được để populate.
- Package entrypoint hiện chỉ dry-run; write/reset Phase 2 chưa có.

### 14.10 Ownership stale

- Cường plan cũ ghi Notification thuộc Cường; addendum mới chuyển foundation cho Thành.
- Chung plan cũ ghi Homepage thuộc Chung; addendum mới chuyển cho Thành.
- Payment provider/webhook thuộc Thành; domain state/refund thuộc Huy.

---

## 15. Test và mức độ hoàn thành

Kết quả kiểm chứng tại thời điểm 2026-07-22:

- Server: `293/293` test pass.
- Client: `113/113` test pass.
- Client production build: pass.
- Có Vite warning về chunk lớn hơn 500 KB, không làm build fail.

### 15.1 Foundation/validation tests

- `server/src/app.contract.test.js`
- `server/src/middlewares/error.middleware.test.js`
- `server/src/middlewares/requestId.middleware.test.js`
- `server/src/validation/requestValidation.test.js`
- `server/src/middlewares/validateRequest.middleware.test.js`
- `server/src/security/securityConfig.test.js`

### 15.2 Auth/RBAC tests

- `server/src/services/auth.service.test.js`
- `server/src/routes/auth.validation.test.js`
- `server/src/middlewares/auth.passwordVersion.test.js`
- `server/src/middlewares/authorize.middleware.test.js`
- `client/src/services/authService.test.js`
- `client/src/contexts/AuthContext.test.js`
- `client/src/pages/auth/AuthPages.test.js`

### 15.3 Profile/address/upload tests

- `server/src/services/profile.service.test.js`
- `server/src/services/userAddress.service.test.js`
- `server/src/services/upload.service.test.js`
- `server/src/routes/upload.routes.test.js`
- `client/src/services/profileService.test.js`
- `client/src/components/layout/AccountLayout.test.js`

### 15.4 Notification tests

- `server/src/services/notification.service.test.js`
- `client/src/services/notificationService.test.js`
- `client/src/components/notifications/NotificationBell.test.js`

### 15.5 Email/OTP/contact tests

- `server/src/services/passwordReset.service.test.js`
- `server/src/services/email.config.test.js`
- `server/src/services/email.service.test.js`
- `server/src/workers/email.worker.test.js`
- `server/src/services/contact.service.test.js`
- `server/src/routes/contact.validation.test.js`

### 15.6 Audit tests

- `server/src/services/auditLog.service.test.js`
- `client/src/services/adminService.test.js`

### 15.7 PayOS tests

- `server/src/config/payos.test.js`
- `server/src/routes/payment.routes.test.js`
- `server/src/services/payment.service.test.js`
- `client/src/services/paymentService.test.js`

Các nhóm test PayOS đã kiểm:

- Thiếu configuration.
- Route create có Customer JWT.
- Webhook public nhưng signature bắt buộc.
- Tạo/reuse/retire link.
- Concurrent link creation.
- Successful callback.
- Duplicate callback replay.
- Processing lease reclaim.
- Late/duplicate paid → RefundPending.
- Invalid amount/signature.

### 15.8 Homepage/layout tests

- `client/src/pages/public/HomePage.test.js`
- `client/src/components/layout/Header.test.js`
- `client/src/components/layout/Footer.test.js`
- `client/src/components/layout/Layout.test.js`
- `client/src/components/layout/AccountLayout.test.js`
- `client/src/styles.test.js`

---

## Kết luận

Nguyễn Ngọc Thành đang giữ lớp foundation và integration có phạm vi rộng nhất hệ thống: Auth/RBAC, validation/error contract, account/profile/address/upload, notification, email, audit, Homepage/shared layout và PayOS provider integration.

Các luồng chính đã có code và test tương đối đầy đủ. Những phần cần ưu tiên hardening tiếp theo là:

1. Cập nhật `passwordChangedAt` khi đổi mật khẩu từ Profile.
2. Mở rộng request validator cho query/path param.
3. Giữ và render `errorCode`/field errors ở frontend.
4. Nối Notification Email channel với EmailOutbox bằng event contract rõ ràng.
5. Làm contact persistence/outbox boundary nhất quán với tài liệu.
6. Nối graceful shutdown cho email worker.
7. Hoàn thiện Phase 2 transaction-backed demo seed nếu cần populate MongoDB thật.
