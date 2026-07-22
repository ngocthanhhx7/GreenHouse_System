# Nguyễn Ngọc Thành - Foundation, Auth/RBAC, Audit, Integration Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Nguyễn Ngọc Thành |
| Role in team | Team lead, integration owner, foundation owner |
| Main responsibility | Xây nền tảng auth, role-based access, shared layout/API client, audit foundation và final merge |
| Git branch | `feature/thanh-auth-rbac-foundation` |
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

### Phase 4 - Payment/Notification Support

- [ ] Confirm payment callback does not require normal JWT but has gateway verification path.
- [ ] Add audit action constants for payment status changes.

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

Thành là owner chính của Homepage và các tài nguyên tài khoản dùng chung, bổ sung ngoài Auth/RBAC:

- Hoàn thiện Homepage tiếng Việt, commerce-first và các layout dùng chung không làm hỏng luồng role.
- Xây upload foundation cho product/avatar, gồm MIME/size/role validation và thư mục runtime `server/uploads`.
- Tách AccountLayout; xây Profile chỉnh sửa được, avatar, đổi mật khẩu và Address Book API nền tảng.
- Xây Notification API/UI: unread count, dropdown preview, detail route, read state và rule chỉ xóa notification đã đọc.
- Review contract của Chung/Huy/Nhật/Cường, chạy regression test, commit/merge cuối bằng danh tính `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.

Chi tiết execution: `docs/srs-sds-reconciliation/06_ACCOUNT_MEDIA_NOTIFICATION_ADDRESS_PLAN.md`.
