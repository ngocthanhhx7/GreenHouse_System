# Thiết kế hardening Authentication, Catalog và Cart

## 1. Mục tiêu

Ổn định phần đầu của luồng COD end-to-end:

`Customer đăng nhập → xem Catalog → xem chi tiết Product → thêm/cập nhật/xóa Cart`

Phạm vi kết thúc sau khi Catalog và Cart hoạt động ổn định. Không xử lý checkout,
Order, Reservation, StockExport hoặc Shipping trong thay đổi này.

## 2. Ràng buộc

- Giữ nguyên kiến trúc React/Vite, Express và Mongoose hiện tại.
- Không đổi tên hàng loạt file hoặc thêm thư viện mới.
- Không tin role do frontend gửi; quyền vẫn lấy từ session và dữ liệu User ở backend.
- Không để giá hoặc tồn kho do frontend cung cấp quyết định nghiệp vụ.
- Không làm mất Cart đã lưu trong database khi refresh trang.
- Các thay đổi phải có test hồi quy và không làm hỏng test hiện có.

## 3. Thiết kế được chọn

### 3.1 Authentication và session hết hạn

Giữ cơ chế session cookie `httpOnly` hiện tại.

- `apiClient` nhận diện response `401` do session invalid/expired.
- `apiClient` phát một sự kiện hoặc callback dùng chung, không tự quyết định
  role.
- `AuthContext` đăng ký handler, xóa user/CSRF state trong bộ nhớ và thực hiện
  điều hướng về Login với thông báo rõ ràng.
- Các lỗi đăng nhập sai vẫn hiển thị tại form đăng nhập, không coi là session
  hết hạn.
- Backend tiếp tục xác thực session, tải role từ database và áp dụng middleware
  `Customer` cho Cart.

Mục tiêu là mọi page đều có cách xử lý giống nhau khi session hết hạn, thay vì
chỉ hiện lỗi cục bộ hoặc giữ giao diện như đang đăng nhập.

### 3.2 Catalog

Giữ các service/repository public hiện tại:

- Danh sách chỉ lấy Product `Active` và Category `Active`.
- Chi tiết chỉ trả Product đang được công khai và thông tin tồn kho dẫn xuất từ
  backend.
- Ở lớp persistence, kiểm tra Product ID trước khi chạy truy vấn Mongoose.
  ID sai định dạng được coi là không tìm thấy Product công khai và trả lỗi
  `PRODUCT_NOT_FOUND`/HTTP 404 nhất quán, không để CastError thành HTTP 500.
- Các page hiện có tiếp tục hiển thị loading, empty và error state; không thêm
  cơ chế fallback dữ liệu giả.

### 3.3 Cart

Giữ Cart service, idempotency key, optimistic `expectedVersion` và các
transaction hiện có.

- `customerId` luôn lấy từ `req.user`, không lấy từ body/query/path do client
  tự gửi.
- Add cùng Product trong cùng Cart tiếp tục merge số lượng vào một dòng.
- Quantity phải là số nguyên dương và không vượt số lượng khả dụng do backend
  tính.
- Read/update/delete đều được scope theo Cart của Customer hiện tại.
- Cart được đọc lại từ database sau refresh.
- Tổng tiền hiển thị lấy từ projection backend; thay đổi này không triển khai
  checkout.

Nếu test phát hiện lỗi hành vi trong logic hiện tại, chỉ mở rộng file hiện hữu
ở service/controller tương ứng; không tạo một Cart architecture mới.

## 4. Phân lớp thay đổi dự kiến

### Backend

- Product persistence/service: kiểm tra ID không hợp lệ trước truy vấn.
- Test backend Catalog/Cart/Auth hiện hữu hoặc bổ sung test gần module hiện tại
  để chứng minh status, ownership, quantity và duplicate merge.
- Chỉ sửa middleware/controller nếu contract test cho thấy response hoặc RBAC
  không nhất quán.

### Frontend

- `apiClient` và `AuthContext`: xử lý tập trung session hết hạn.
- Test service/context hiện hữu cho response 401 và trạng thái đăng nhập.
- Product listing/detail và Cart page chỉ chỉnh khi kiểm thử cho thấy lỗi hiển
  thị hoặc lỗi truyền request; giữ các trạng thái loading/error hiện có.

## 5. Luồng lỗi

| Tình huống | Backend | Frontend |
| --- | --- | --- |
| Sai email/mật khẩu | HTTP 401, mã credential invalid | Hiện lỗi tại form login |
| Session hết hạn/revoked | HTTP 401, mã session rõ ràng | Xóa auth state, chuyển Login, hiện thông báo |
| Product ID sai/inactive | HTTP 404 `PRODUCT_NOT_FOUND` | Hiện trang lỗi/không tìm thấy, không trắng trang |
| Quantity <= 0 | HTTP 400 validation | Giữ giỏ, hiện lỗi thao tác |
| Quantity vượt tồn | HTTP 409/business error với max hợp lệ | Hiện lỗi và số lượng tối đa |
| Customer truy cập Cart người khác | Không thể chọn `customerId` khác; response chỉ là Cart của chính mình | Không lộ dữ liệu người khác |
| API Catalog lỗi mạng/server | HTTP error | Hiện error state và cho phép thử lại nếu page đã hỗ trợ |

## 6. Tiêu chí chấp nhận

1. Customer login đúng tạo session và refresh vẫn giữ trạng thái.
2. Login sai không tạo session hợp lệ.
3. Guest/Customer chỉ thấy Product và Category Active.
4. Product ID sai hoặc Product inactive trả lỗi rõ ràng, không HTTP 500 do CastError.
5. Customer thêm Product, thêm lại cùng Product thì chỉ có một dòng với quantity
   đã merge.
6. Quantity 0, âm hoặc vượt tồn bị từ chối.
7. Update và delete chỉ tác động Cart của Customer hiện tại.
8. Refresh giữ Cart trong database.
9. Session hết hạn được xử lý thống nhất và không để UI giả vờ còn đăng nhập.
10. Các test hiện có tiếp tục pass.

## 7. Ngoài phạm vi

- Checkout và tính giá cuối cùng của Order.
- Reservation/giữ tồn kho cho Order.
- Staff confirm, StockExport, Packed, Shipping, Delivered.
- Payment COD, refund, return/exchange.
- Thay đổi UX hoặc thiết kế giao diện không cần thiết cho luồng này.
