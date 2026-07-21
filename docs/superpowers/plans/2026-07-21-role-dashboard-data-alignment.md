# Role Dashboard Data Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` and `test-driven-development` to implement this plan task-by-task. Use `verification-before-completion` before every commit and `requesting-code-review` before integration.

**Goal:** Các màn mặc định theo role hiển thị đúng dữ liệu nghiệp vụ, không biến lỗi API thành số `0`, và mỗi phần được commit dưới đúng danh tính người phụ trách.

**Architecture:** Giữ route và RBAC hiện tại. Chuẩn hóa dữ liệu dashboard tại helper thuần, có unit test, rồi để page chỉ chịu trách nhiệm tải dữ liệu và render. Staff dùng `total` từ API cho queue count; Warehouse đọc đúng envelope `{ items, total }`; Admin công bố rõ KPI theo kỳ và KPI snapshot. Customer tiếp tục dùng `/orders` làm workspace mặc định theo tài liệu, không tạo dashboard nội bộ mới.

**Tech Stack:** React 19, React Router, Node test runner, Express, Mongoose, Vite.

---

## 1. Kết quả audit đã xác nhận

| Role | Hiện trạng | Mức độ | Owner |
|---|---|---:|---|
| Customer | `/orders` hiển thị đúng 4 đơn seed, đúng tổng tiền và trạng thái. Đây là workspace mặc định theo `authService`; không phải dashboard nội bộ. | Không sửa nghiệp vụ | Nguyễn Quang Huy xác nhận regression |
| Staff | KPI dùng độ dài `items`, gửi `limit=1` nhưng backend không phân trang; “Hỗ trợ đang mở” chỉ query `New`, bỏ `Open` và `InProgress`. | P1 | Nguyễn Hữu Anh Nhật |
| Warehouse | Dashboard hiển thị `0 / 0 / 0`, trong khi Inventory có 8 mặt hàng và seed có 1 phiếu xuất `Pending`. Page đang xử lý object API như array và nuốt mọi lỗi thành `[]`. | P0 | Lê Vũ Cường |
| Admin | Số liệu all-time đang tải được, nhưng khi dùng `from/to` chỉ doanh thu/refund theo kỳ; order/status/support/review vẫn all-time. UI không có bộ lọc kỳ nên contract báo cáo không rõ. | P1 | Lê Vũ Cường |
| Shared shell | Menu Customer tạo hai entry có cùng key `/orders`, gây React console error. Logout từ protected page rơi vào `/unauthorized`. | P2 | Nguyễn Ngọc Thành |

Scope triển khai đầu tiên chỉ gồm các lỗi dashboard ở bảng trên. Các gap lớn hơn như inventory transaction history, damage-report UI, audit-log pagination và việc settings chưa được tiêu thụ sẽ mở task riêng sau khi dashboard ổn định.

## 2. Quy tắc Git và ownership

- Không dùng branch `codex/`.
- Trước mỗi branch: `git switch main` rồi `git pull --ff-only origin main`.
- Chỉ stage đúng file của task; không dùng `git add -A` hoặc `git add .`.
- Không stage ba nhóm local có sẵn:
  - `client/public/assets/icon/contact/`
  - `client/public/assets/icon/home/`
  - `server/src/scripts/createAccounts.js`
- `git pull --ff-only` không tạo commit nên không đổi author. Mọi commit và merge commit phải truyền đúng `user.name`/`user.email` bằng `git -c`.

## Task 1: Sửa KPI Warehouse và không che lỗi API

**Owner:** Lê Vũ Cường `<levucuong0319@gmail.com>`
**Branch:** `feature/cuong-warehouse-dashboard`

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/cuong-warehouse-dashboard
```

**Files:**

- Create: `client/src/pages/warehouse/warehouseDashboardStats.js`
- Create: `client/src/pages/warehouse/warehouseDashboardStats.test.js`
- Modify: `client/src/pages/warehouse/WarehouseDashboardPage.jsx`
- Modify: `client/src/services/inventoryService.test.js`

### Step 1: Viết test thất bại cho API envelope

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { toWarehouseDashboardStats } from './warehouseDashboardStats.js';

test('maps inventory API envelopes to dashboard counts', () => {
  assert.deepEqual(
    toWarehouseDashboardStats({
      inventory: { items: Array(8).fill({}), total: 8 },
      lowStock: { items: [], total: 0 },
      stockExports: { items: [{ status: 'Pending' }, { status: 'Exported' }], total: 2 },
    }),
    { totalItems: 8, lowStock: 0, pendingExports: 1 }
  );
});
```

Run: `npm test -- warehouseDashboardStats.test.js` trong `client/`.
Expected: FAIL vì helper chưa tồn tại.

### Step 2: Implement mapping nhỏ nhất

- Dùng `inventory.total` và `lowStock.total` khi là số hợp lệ.
- Dùng `stockExports.items.filter(status === 'Pending').length` cho queue.
- Không dùng `Array.isArray(response)` trên envelope.

Run lại test; expected PASS.

### Step 3: Sửa page load/error state

- Bỏ ba `.catch(() => [])` trong `Promise.all`.
- Khởi tạo stats là `null`; khi request fail, hiển thị cảnh báo và ký hiệu `—`, không hiển thị số `0` giả.
- Gọi helper sau khi cả ba request thành công.

### Step 4: Bổ sung service contract test

Kiểm tra đủ URL cho `listInventory`, `listLowStock`, `listStockExports` và giữ nguyên response envelope.

### Step 5: Verify và commit

```powershell
cd client
npm test
npm run build
cd ..
git add client/src/pages/warehouse/warehouseDashboardStats.js client/src/pages/warehouse/warehouseDashboardStats.test.js client/src/pages/warehouse/WarehouseDashboardPage.jsx client/src/services/inventoryService.test.js
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "fix: show correct warehouse dashboard metrics"
git push -u origin feature/cuong-warehouse-dashboard
```

Browser acceptance: Warehouse dashboard phải hiện `8` mặt hàng, `0` low-stock và `1` phiếu xuất chờ xử lý với demo seed hiện tại.

## Task 2: Sửa summary Staff theo đúng trạng thái nghiệp vụ

**Owner:** Nguyễn Hữu Anh Nhật `<nguyenhuuanhnhat2k3@gmail.com>`
**Branch:** `feature/nhat-staff-dashboard`

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/nhat-staff-dashboard
```

**Files:**

- Create: `client/src/pages/staff/staffDashboardStats.js`
- Create: `client/src/pages/staff/staffDashboardStats.test.js`
- Modify: `client/src/pages/staff/StaffDashboardPage.jsx`
- Modify: `client/src/services/staffOrderService.test.js`
- Modify: `client/src/services/returnRefundService.test.js`
- Modify: `client/src/services/supportService.test.js`

### Step 1: Viết test thất bại cho count contract

```js
test('uses totals and counts New, Open and InProgress as open support', () => {
  assert.deepEqual(
    toStaffDashboardStats({
      orders: { items: [{}], total: 12 },
      returns: { items: [{}], total: 3 },
      newSupport: { items: [{}], total: 2 },
      openSupport: { items: [{}], total: 1 },
      inProgressSupport: { items: [{}], total: 4 },
    }),
    { pendingOrders: 12, pendingReturns: 3, openSupport: 7 }
  );
});
```

Run: `npm test -- staffDashboardStats.test.js`; expected FAIL.

### Step 2: Implement helper và sửa page

- Dùng `response.total`, không dùng `items.length` làm tổng queue.
- Load 5 request: order `Pending`, return `Pending`, support `New`, support `Open`, support `InProgress`.
- Bỏ query `limit=1` cho đến khi backend có pagination thật; không tạo cảm giác count-only giả.
- Nếu một request lỗi, hiển thị lỗi và không thay số bằng `0`.

### Step 3: Bổ sung tests cho query

Assert client service serialize chính xác `status=Pending`, `status=New`, `status=Open`, `status=InProgress` và không làm mất query params.

### Step 4: Verify và commit

```powershell
cd client
npm test
npm run build
cd ..
git add client/src/pages/staff/staffDashboardStats.js client/src/pages/staff/staffDashboardStats.test.js client/src/pages/staff/StaffDashboardPage.jsx client/src/services/staffOrderService.test.js client/src/services/returnRefundService.test.js client/src/services/supportService.test.js
git -c user.name="Nguyễn Hữu Anh Nhật" -c user.email="nguyenhuuanhnhat2k3@gmail.com" commit -m "fix: correct staff dashboard queue summaries"
git push -u origin feature/nhat-staff-dashboard
```

Browser acceptance: KPI order/return phải bằng tổng queue; “Hỗ trợ đang mở” bằng tổng `New + Open + InProgress`.

## Task 3: Làm rõ và đồng bộ kỳ báo cáo Admin

**Owner:** Lê Vũ Cường `<levucuong0319@gmail.com>`
**Branch:** `feature/cuong-admin-dashboard`

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/cuong-admin-dashboard
```

**Files:**

- Modify: `server/src/services/report.service.js`
- Modify: `server/src/services/report.service.test.js`
- Modify: `client/src/services/adminService.js`
- Modify: `client/src/services/adminService.test.js`
- Modify: `client/src/pages/admin/AdminDashboardPage.jsx`
- Create: `client/src/pages/admin/adminDashboardQuery.js`
- Create: `client/src/pages/admin/adminDashboardQuery.test.js`

### Step 1: Chốt semantics bằng server test thất bại

- Kỳ báo cáo dùng ngày nghiệp vụ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+07); chỉ nhận `YYYY-MM-DD`, từ 00:00:00.000 đến 23:59:59.999 giờ Việt Nam và từ chối ngày không tồn tại.
- `orders.total`, `orders.byStatus`, `support`, `reviews` là metrics theo kỳ khi có `from/to`.
- Revenue dùng ngày hoàn tất nghiệp vụ (`deliveredAt`/`completedAt`).
- Product total và low-stock là snapshot hiện tại, giữ all-time nhưng đổi label UI thành “Sản phẩm hiện có” và “Sắp hết hiện tại”.
- Response phải có `period` để UI hiển thị kỳ đang xem.

Tạo fixtures cả trong và ngoài kỳ rồi assert chỉ record đúng kỳ được tính.
Run: `npm test -- report.service.test.js` trong `server/`; expected FAIL trước implementation.

### Step 2: Sửa report service

Lọc order/support/review bằng timestamp phù hợp trước khi group/count. Giữ product/inventory snapshot và ghi rõ trong response hoặc tên field.

### Step 3: Thêm query builder và UI filter

```js
export function buildAdminOverviewQuery({ from, to }) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return query.toString();
}
```

- `adminService.getOverviewReport({ from, to })` gọi `/admin/reports/overview?...`.
- Admin dashboard có hai input date, nút Áp dụng/Xóa lọc, loading/error riêng.
- Không reuse report cũ khi request kỳ mới thất bại; vẫn giữ form/filter shell trên màn hình và chỉ loading vùng report.
- Chặn `from > to` phía client và dùng `aria-busy`/`role="alert"` cho trạng thái tải/lỗi.

### Step 4: Verify và commit

```powershell
cd server
npm test -- src/services/report.service.test.js
npm test
cd ../client
npm test
npm run build
cd ..
git add server/src/services/report.service.js server/src/services/report.service.test.js client/src/services/adminService.js client/src/services/adminService.test.js client/src/pages/admin/AdminDashboardPage.jsx client/src/pages/admin/adminDashboardQuery.js client/src/pages/admin/adminDashboardQuery.test.js
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "fix: align admin dashboard reporting period"
git push -u origin feature/cuong-admin-dashboard
```

## Task 4: Sửa shared role shell và logout

**Owner:** Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`
**Branch:** `feature/thanh-dashboard-shell`

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/thanh-dashboard-shell
```

**Files:**

- Modify: `client/src/components/layout/Header.jsx`
- Modify: `client/src/components/layout/Header.test.js`
- Modify: `client/src/components/layout/InternalTopbar.jsx`
- Modify: `client/src/components/layout/Layout.test.js`

### Step 1: Viết regression tests

- Customer menu không có hai link cùng `to=/orders`.
- Logout từ Header/InternalTopbar gọi `logout()` rồi navigate `/login` với replace.
- Internal topbar tuân thủ ownership addendum: không render cart; quyết định Profile/Notification được test đúng với baseline đã chốt.

### Step 2: Implement

- Bỏ entry “Lịch sử mua hàng” trùng với “Khu vực Khách hàng”, hoặc de-duplicate theo destination trước render.
- Dùng `useNavigate` trong hai shell để điều hướng rõ ràng sau logout, tránh ProtectedRoute đẩy sang `/unauthorized`.

### Step 3: Verify và commit

```powershell
cd client
npm test
npm run build
cd ..
git add client/src/components/layout/Header.jsx client/src/components/layout/Header.test.js client/src/components/layout/InternalTopbar.jsx client/src/components/layout/Layout.test.js
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "fix: stabilize role dashboard shell navigation"
git push -u origin feature/thanh-dashboard-shell
```

## Task 5: Customer regression verification

**Owner:** Nguyễn Quang Huy `<quanghuyn267@gmail.com>`
**Branch:** Không tạo branch nếu audit vẫn pass; không tạo commit rỗng.

- Login Customer phải redirect `/orders`.
- Order history phải giữ đúng mã đơn, tổng tiền, payment status, order status và link detail.
- Chạy `client/src/services/authService.test.js`, `client/src/services/orderService.test.js` và browser smoke.
- Nếu phát hiện regression thật, tạo `feature/huy-customer-workspace` và commit bằng đúng identity của Huy; không gộp lỗi giả vào branch của Thành/Cường/Nhật.

## Task 6: Review, merge và cleanup

**Reviewer/integrator:** Nguyễn Ngọc Thành `<thanhnnhe186491@fpt.edu.vn>`

Merge order để giảm conflict:

1. `feature/nhat-staff-dashboard`
2. `feature/cuong-warehouse-dashboard`
3. `feature/cuong-admin-dashboard`
4. `feature/thanh-dashboard-shell`

Review từng branch:

```powershell
git fetch origin
git diff --check main...origin/feature/nhat-staff-dashboard
git diff --check main...origin/feature/cuong-warehouse-dashboard
git diff --check main...origin/feature/cuong-admin-dashboard
git diff --check main...origin/feature/thanh-dashboard-shell
git diff --stat main...origin/feature/nhat-staff-dashboard
git diff --stat main...origin/feature/cuong-warehouse-dashboard
git diff --stat main...origin/feature/cuong-admin-dashboard
git diff --stat main...origin/feature/thanh-dashboard-shell
```

Chạy đầy đủ trước merge cuối:

```powershell
cd server; npm test
cd ../client; npm test; npm run build
cd ..
```

Merge dưới danh tính Thành:

```powershell
git switch main
git pull --ff-only origin main
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" merge --no-ff feature/nhat-staff-dashboard -m "merge: integrate staff dashboard fixes"
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" merge --no-ff feature/cuong-warehouse-dashboard -m "merge: integrate warehouse dashboard fixes"
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" merge --no-ff feature/cuong-admin-dashboard -m "merge: integrate admin dashboard fixes"
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" merge --no-ff feature/thanh-dashboard-shell -m "merge: integrate dashboard shell fixes"
```

Sau khi browser QA lại cả bốn role và `git status --short` chỉ còn ba nhóm untracked cũ:

```powershell
git push origin main
git branch -d feature/nhat-staff-dashboard feature/cuong-warehouse-dashboard feature/cuong-admin-dashboard feature/thanh-dashboard-shell
git push origin --delete feature/nhat-staff-dashboard feature/cuong-warehouse-dashboard feature/cuong-admin-dashboard feature/thanh-dashboard-shell
```

Không xóa hoặc commit ba nhóm untracked của người dùng trong bất kỳ bước nào.
