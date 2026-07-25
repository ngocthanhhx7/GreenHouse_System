# Kế hoạch triển khai Authentication, Catalog và Cart

> **Phạm vi:** Chỉ ổn định đăng nhập Customer, Catalog public, Product detail và
> Cart. Không triển khai Checkout/Order/Reservation/StockExport/Shipping.

## Mốc kiểm chứng ban đầu

- Backend: `npm test` — 1084/1084 test pass.
- Frontend: `npm test` — 306/306 test pass.
- Worktree: `D:\GreenHouse_System-main\.worktrees\auth-catalog-cart`
- Branch: `feature/auth-catalog-cart`

## Task 1: Product ID public không hợp lệ

**Files:**

- Sửa: `server/src/services/productPersistence.js`
- Test: `server/src/services/productPersistence.test.js`
- Kiểm tra hồi quy: `server/src/services/product.service.test.js`

### Bước 1: Viết test đỏ

Thêm test chứng minh model repository:

- không gọi Mongoose query khi ID không phải ObjectId hợp lệ;
- trả `null` để Product service dùng contract 404 `PRODUCT_NOT_FOUND`;
- vẫn cho phép ObjectId hợp lệ đi qua truy vấn.

Chạy:

```powershell
node --test src/services/productPersistence.test.js
```

Kỳ vọng: test ID không hợp lệ fail vì repository hiện vẫn gọi
`Product.findOne({_id: id})`.

### Bước 2: Sửa tối thiểu

Trong `findPublicById`, dùng `mongoose.isValidObjectId(id)`. Nếu sai định dạng,
trả `null` trước khi tạo query. Không thay đổi list, admin mutation hoặc các ID
test giả của service in-memory.

### Bước 3: Verify

```powershell
node --test src/services/productPersistence.test.js src/services/product.service.test.js src/controller/product.controller.test.js
```

Kỳ vọng: Product ID sai và inactive đều theo contract 404 hiện có; test Catalog
public vẫn pass.

## Task 2: Bổ sung test nghiệp vụ Cart backend

**Files:**

- Test: `server/src/services/cart.service.test.js`
- Có thể sửa nếu test đỏ chứng minh lỗi:
  `server/src/services/cart.service.js`

### Bước 1: Viết các test còn thiếu

- quantity `0`, âm và số thập phân bị từ chối;
- update item hợp lệ thay đổi đúng quantity và version;
- update vượt tồn bị từ chối, dữ liệu cũ không đổi;
- remove item hợp lệ chỉ xóa đúng item;
- Customer 2 đọc Cart của mình không thấy item của Customer 1;
- Customer 1 không update/remove được item của Customer 2;
- add lại cùng Product vẫn chỉ có một dòng.

### Bước 2: Chạy test đỏ/xanh

```powershell
node --test src/services/cart.service.test.js
```

Nếu test đỏ do test repository chưa mô phỏng version/idempotency đúng, sửa
fixture test trước. Chỉ sửa production service khi lỗi hành vi được tái hiện từ
contract thực.

### Bước 3: Kiểm tra RBAC/controller hiện có

Chạy:

```powershell
node --test src/middlewares/authorize.middleware.test.js src/services/session.service.test.js src/services/auth.service.test.js
```

Đối chiếu trực tiếp:

- route Cart luôn có `authenticate` và `authorizeRoles('Customer')`;
- controller chỉ dùng `req.user.id`, không nhận `customerId` từ body.

## Task 3: Phát hiện session hết hạn tập trung ở frontend

**Files:**

- Sửa: `client/src/services/apiClient.js`
- Test: `client/src/services/apiClient.test.js`

### Bước 1: Viết test đỏ

Thêm test cho:

- response HTTP 401 với `SESSION_EXPIRED` phát đúng một thông báo session;
- giữ nguyên đầy đủ `message`, `errorCode`, `errors`, `data`, `requestId` và
  thêm HTTP status vào Error;
- lỗi không thuộc `SESSION_*` không phát thông báo session;
- unsubscribe ngăn handler cũ tiếp tục chạy.

### Bước 2: Sửa tối thiểu

- Bổ sung API đăng ký/unsubscribe handler trong module `apiClient`.
- Sau khi parse lỗi, chỉ phát handler khi HTTP 401 và `errorCode` bắt đầu bằng
  `SESSION_`.
- Không dùng localStorage/bearer token và không thay đổi CSRF contract.
- Không tự redirect trong service.

### Bước 3: Verify

```powershell
node --test src/services/apiClient.test.js src/services/authService.test.js
```

## Task 4: AuthContext xử lý session hết hạn đang hoạt động

**Files:**

- Sửa: `client/src/contexts/AuthContext.jsx`
- Test: `client/src/contexts/AuthContext.test.js`
- Kiểm tra contract sẵn có: `client/src/pages/auth/AuthPages.test.js`

### Bước 1: Viết test đỏ

Do bộ test frontend hiện dùng Node test không có DOM renderer, test source
contract tối thiểu phải chứng minh:

- `AuthContext` đăng ký và cleanup session-expiration handler;
- handler xóa user và CSRF state;
- chỉ chuyển Login khi trước đó thực sự có user đăng nhập;
- truyền `from` và thông báo phiên hết hạn cho LoginPage.

Phần thuần của việc phân loại session error được kiểm thử hành vi ở Task 3.

### Bước 2: Sửa tối thiểu

- Dùng `useLocation`/`useNavigate` vì `AuthProvider` đang nằm trong
  `BrowserRouter`.
- Khi handler nhận session error và user hiện tại tồn tại:
  - clear CSRF;
  - `setUser(null)`;
  - navigate `/login` với `replace`, `state.from` và thông báo tiếng Việt dễ
    hiểu.
- Nếu chưa từng có user (guest gọi `/auth/me` khi khởi động), không ép Guest từ
  trang public sang Login.
- Cleanup subscription khi provider unmount.

### Bước 3: Verify

```powershell
node --test src/services/apiClient.test.js src/contexts/AuthContext.test.js src/pages/auth/AuthPages.test.js
```

## Task 5: Catalog và Cart frontend contract

**Files:**

- Test: `client/src/services/productService.test.js`
- Test: `client/src/services/cartService.test.js`
- Test: `client/src/pages/public/ProductDetailPage.test.js`
- Test: `client/src/contexts/CartContext.test.js`
- Có thể sửa nếu test chứng minh lỗi:
  - `client/src/pages/public/ProductListingPage.jsx`
  - `client/src/pages/public/ProductDetailPage.jsx`
  - `client/src/pages/customer/CartPage.jsx`
  - `client/src/contexts/CartContext.jsx`

### Bước 1: Bổ sung contract test

- Product detail truyền ID vào public endpoint và giữ typed 404 error;
- Catalog service không tự nhận giá/tồn từ input phía client;
- Cart service gọi đúng GET/POST/PATCH/DELETE, gửi cookie và không gửi
  `customerId`;
- CartContext đổi identity thì reset dữ liệu cũ, sau đó đọc Cart mới từ backend;
- source UI giữ loading/error/empty state để API lỗi không gây trắng trang.

### Bước 2: Kiểm tra thao tác quantity UI

Xác nhận việc nhập trống/âm không tạo request không hợp lệ liên tục. Nếu hành vi
thực tế gây request ngay mỗi phím và làm UI khó sử dụng, dùng draft quantity
cục bộ và chỉ gửi khi blur/Enter; vẫn để backend là nguồn kiểm tra cuối cùng.
Không chỉnh nếu kiểm thử browser cho thấy hành vi hiện tại đạt yêu cầu.

### Bước 3: Verify frontend phạm vi

```powershell
node --test src/services/productService.test.js src/services/cartService.test.js src/services/apiClient.test.js src/contexts/AuthContext.test.js src/contexts/CartContext.test.js src/pages/public/ProductDetailPage.test.js
```

## Task 6: Kiểm thử tích hợp và hồi quy

### Backend

```powershell
npm test
```

### Frontend

```powershell
npm test
npm run build
```

### Kiểm thử HTTP/browser bằng Customer demo

1. Login đúng và sai.
2. Mở danh sách Product public.
3. Mở Product hợp lệ và Product ID sai.
4. Thêm một Product.
5. Thêm lại Product đó.
6. Update quantity.
7. Nhập quantity âm/0/vượt tồn.
8. Xóa Product.
9. Refresh và xác nhận Cart vẫn được tải từ database.
10. Đăng nhập Customer thứ hai và xác nhận không thấy Cart của Customer thứ
    nhất.
11. Làm session hết hạn/revoke và xác nhận UI chuyển Login với thông báo.

Nếu môi trường MongoDB local không chạy hoặc không hỗ trợ session/transaction,
ghi rõ test nào chỉ đạt ở unit/contract và không tuyên bố live end-to-end.

## Task 7: Chốt phạm vi và báo cáo

- Kiểm tra `git diff --check`.
- Kiểm tra `git status --short`.
- Xác nhận không có file Checkout/Order/Reservation/StockExport/Shipping bị sửa.
- Báo cáo file, nguyên nhân lỗi, API, test pass/fail và rủi ro còn lại.
- Không tự chuyển sang giai đoạn checkout.
