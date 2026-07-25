# Khôi phục thanh toán online trong Checkout

## Mục tiêu

Khôi phục lựa chọn thanh toán online ở Checkout bằng PayOS hiện có, đồng
thời giữ nguyên luồng COD đã được kiểm thử. Phạm vi chỉ gồm tạo đơn online,
tạo payment attempt và chuyển Customer sang trang tạo link PayOS.

## Phạm vi

### Có trong phạm vi

- Checkout hiển thị hai phương thức `COD` và `ONLINE`.
- Customer đã đăng nhập có thể tạo đơn với `paymentMethod: ONLINE`.
- Backend giữ giá, tổng tiền, Customer ID và trạng thái theo dữ liệu server.
- Đơn online mới có `orderStatus: Pending` và `paymentStatus: Pending`.
- Backend lưu hạn thanh toán online theo cấu hình hệ thống hiện có.
- Sau khi tạo đơn online, frontend chuyển tới `/orders/:id/payment`.
- Trang Payment dùng endpoint hiện có để tạo hoặc dùng lại link PayOS.
- Lỗi thiếu cấu hình PayOS được hiển thị rõ ràng.
- Customer chỉ tạo link cho đơn thuộc về mình.
- COD tiếp tục tạo đơn `Pending/Unpaid` và không thay đổi hành vi.

### Không trong phạm vi

- Không thêm cổng thanh toán mới.
- Không sửa webhook PayOS nếu kiểm thử hiện tại đã đạt.
- Không thay đổi payment online refund/payout.
- Không thay đổi nghiệp vụ Staff, Warehouse, shipping, return hoặc exchange.
- Không đưa secret PayOS vào source code hoặc seed demo.

## Luồng nghiệp vụ

### COD

`Checkout → POST /api/orders (COD) → Pending/Unpaid → Order detail`

### Online

`Checkout → POST /api/orders (ONLINE) → Pending/Pending → /orders/:id/payment → POST /api/orders/:id/payments → PayOS checkout URL`

Sau khi PayOS gọi webhook hợp lệ, payment service hiện có cập nhật
`PaymentAttempt`, `Payment` và `Order` theo trạng thái provider. Frontend
không tự đánh dấu thanh toán thành công.

## Thay đổi dự kiến

### Frontend

- `CheckoutPage.jsx`
  - Đổi payment method từ hằng số COD thành state mặc định COD.
  - Hiển thị radio COD và ONLINE.
  - Sau khi tạo đơn:
    - `ONLINE` → `/orders/:id/payment`.
    - `COD` → `/orders/:id`.
- `CheckoutPage.test.js`
  - Kiểm tra cả hai lựa chọn.
  - Kiểm tra mặc định COD và request gửi đúng phương thức.
  - Kiểm tra ONLINE chuyển tới trang thanh toán.

### Backend

- `order.controller.js`
  - Cho phép `COD` và `ONLINE`.
  - Từ chối phương thức khác bằng lỗi validation rõ ràng.
- `order.controller.test.js`
  - Kiểm tra ONLINE được truyền nguyên vẹn tới service.
  - Giữ kiểm tra từ chối phương thức không hợp lệ.
- Các service PayOS hiện có chỉ được mở rộng nếu test hoặc lỗi runtime
  chứng minh còn thiếu; không viết lại kiến trúc.

## Quy tắc an toàn

- Không tin `userId`, giá, tổng tiền hoặc role từ frontend.
- Chỉ Customer đã đăng nhập được Checkout và tạo payment link.
- Payment link chỉ được tạo cho đơn thuộc Customer hiện tại.
- PayOS credentials chỉ đọc từ biến môi trường.
- Không log secret, token hoặc dữ liệu thanh toán nhạy cảm.
- Nếu PayOS chưa cấu hình đủ, trả lỗi `PAYOS_NOT_CONFIGURED` và frontend
  hiển thị thông báo có thể xử lý.
- Không tạo payment attempt trùng khi Customer refresh hoặc bấm lại; dùng
  cơ chế idempotency/reuse hiện có của payment service.

## Kiểm thử chấp nhận

- Checkout COD vẫn tạo `Pending/Unpaid`.
- Checkout ONLINE tạo `Pending/Pending`.
- ONLINE chuyển sang PaymentPage sau khi tạo đơn.
- Phương thức bất kỳ ngoài COD/ONLINE bị từ chối.
- Customer không tạo link cho đơn Customer khác.
- Payment service dùng lại payment attempt còn hạn.
- Thiếu PayOS configuration trả lỗi rõ ràng, không tạo dữ liệu thanh toán
  dở dang.
- Full backend tests, frontend tests và production build đều đạt.

## Điều kiện cấu hình chạy thật

Backend cần các biến môi trường PayOS:

- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `PAYOS_RETURN_URL`
- `PAYOS_CANCEL_URL`
- `PAYOS_WEBHOOK_URL`

Nếu chưa có các biến này, giao diện và backend vẫn chạy nhưng không thể
tạo link thanh toán PayOS thật.
