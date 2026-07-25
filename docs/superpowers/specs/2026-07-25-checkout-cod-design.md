# Checkout COD tạo đơn Pending — Design Spec

## Mục tiêu

Hoàn thiện và khóa luồng checkout COD hiện có để Customer đăng nhập có thể:

`Cart Active → chọn địa chỉ thuộc tài khoản → gửi COD checkout → Order Pending + Payment Unpaid`

Mỗi Order phải có OrderDetail chứa snapshot sản phẩm/giá tại thời điểm mua, snapshot địa chỉ nhận hàng, tổng tiền do backend tính, và dữ liệu tồn kho được giữ trong cùng transaction.

Phạm vi kết thúc ngay sau khi tạo Order Pending. Không sửa Staff confirm, StockExportRequest, đóng gói, shipping, giao hàng hoặc thanh toán online.

## Bối cảnh code hiện tại

- Route hiện có: `POST /api/orders`, được bảo vệ bởi `authenticate` và `authorizeRoles('Customer')`.
- `orderService.placeOrder` đã có:
  - đọc Cart theo `req.user.id`, Cart ID và Cart version;
  - lấy Product Active và Category Active từ database;
  - lấy giá từ Product, tạo OrderDetail snapshot;
  - kiểm tra sở hữu saved address;
  - giữ tồn kho bằng update có điều kiện;
  - tạo Order, OrderDetail, OrderReservation, Payment và COD PaymentAttempt;
  - đóng Cart chính xác theo version;
  - transaction MongoDB, unique index theo Customer + Idempotency-Key và request hash.
- `CheckoutPage` đã gửi Idempotency-Key, khóa nút trong lúc request chạy, chỉ reset Cart sau response thành công và chuyển tới `/orders/:id`.

## Thiết kế đã chốt

### 1. Giữ API và ranh giới hiện có

Giữ `POST /api/orders` để không đổi kiến trúc hoặc tạo route trùng. Controller tiếp tục lấy `customerId` từ `req.user.id`; không đọc `userId`, `customerId` hay role từ request body.

Trong slice checkout này, giao diện chỉ hiển thị COD. Service tổng quát hiện có thể phục vụ ONLINE cho các test/chức năng cũ nhưng không được thêm hoặc mở rộng hành vi ONLINE trong thay đổi này. Payload checkout của UI luôn gửi `paymentMethod: 'COD'`.

### 2. Xác thực backend

Thứ tự xử lý:

1. Middleware xác thực session và role Customer.
2. Chuẩn hóa Idempotency-Key, Cart ID/version, đúng một nguồn địa chỉ.
3. Với saved address, truy vấn `{ _id: savedAddressId, userId: customerId }`; không tìm thấy trả lỗi 404.
4. Đọc Cart Active của Customer, kiểm tra đúng ID/version và Cart không rỗng.
5. Với từng Cart item:
   - product ID phải có dạng hợp lệ khi dùng model MongoDB;
   - số lượng phải là số nguyên dương;
   - Product và Category phải Active;
   - giá, tên, SKU và price version lấy từ Product hiện tại;
   - số lượng phải được giữ thành công bằng điều kiện available quantity.
6. Backend tính từng subtotal và tổng tiền; không dùng unit price, total hoặc role do client quyết định.

Cart item không hợp lệ phải dừng trước khi có Order/OrderDetail/Payment mới. Các mutation nhiều collection tiếp tục chạy trong transaction; transaction lỗi thì rollback toàn bộ Order, chi tiết, reservation, payment và trạng thái Cart.

### 3. Dữ liệu được tạo

Order:

- `orderStatus: 'Pending'`
- `paymentMethod: 'COD'`
- `paymentStatus: 'Unpaid'`
- `totalAmount` và `subtotal` do backend tính
- `codExpectedAmount` bằng tổng backend tính
- `customerId` từ session
- `receiverName`, `receiverPhone`, `shippingAddress`, `customerNote` là snapshot địa chỉ đã chuẩn hóa
- `idempotencyKey` và `checkoutRequestHash`

Mỗi OrderDetail:

- `orderId`
- `productId`
- `productNameSnapshot`
- `priceSnapshot`
- `quantity`
- `subtotal`
- các snapshot metadata hiện có (`SKU`, unit, image, price version) được giữ nguyên.

Payment COD và OrderReservation tiếp tục được ghi trong cùng transaction để trạng thái tồn kho và đơn không lệch nhau.

### 4. Chống tạo đơn trùng

Giữ cơ chế hiện có:

- UI sinh một key cho một lần checkout và gửi ở header `Idempotency-Key`.
- Backend lưu key theo Customer và hash các facts checkout.
- Replay cùng key và cùng facts trả lại Order cũ, không tạo lại OrderDetail/Payment/Reservation.
- Replay cùng key nhưng facts khác trả `409 IDEMPOTENCY_KEY_REUSED`.
- Unique index MongoDB xử lý race giữa hai request; khi duplicate key xảy ra, backend đọc lại Order đã hoàn tất.

### 5. Frontend

`CheckoutPage`:

- chỉ giữ lựa chọn COD trong phạm vi slice;
- disable nút khi request đang chạy;
- giữ Cart nếu request lỗi;
- hiển thị message/errorCode/field errors từ backend;
- chỉ `resetCart()` sau khi Order được trả về;
- chuyển `/orders/:id` sau thành công.

Tùy chọn lưu địa chỉ vào sổ địa chỉ hiện có không thay đổi nghiệp vụ Order; lỗi checkout không được xóa Cart hoặc tạo Order dở dang.

## Xử lý lỗi

Các lỗi chính cần giữ/kiểm thử:

- thiếu session hoặc role không phải Customer: middleware trả 401/403;
- Cart rỗng hoặc Cart/version thay đổi: 400/409;
- saved address không thuộc Customer: `404 CHECKOUT_ADDRESS_NOT_FOUND`;
- Product/Category không còn bán: 400/409;
- số lượng không hợp lệ: lỗi validation 4xx;
- không đủ tồn: `409 CHECKOUT_STOCK_INSUFFICIENT`;
- giá hiển thị khác giá database: `409 PRICE_CHANGED`;
- idempotency key sai hoặc dùng lại với facts khác: 400/409;
- transaction không được hỗ trợ: middleware lỗi hiện có trả `503 DATABASE_TRANSACTIONS_UNSUPPORTED`.

Không trả stack trace, password, session token hoặc dữ liệu của Customer khác.

## Kiểm thử chấp nhận

Backend service test phải có:

1. COD happy path tạo đúng Order Pending/Unpaid, OrderDetail snapshot, address snapshot, Payment và Reservation.
2. Cart rỗng bị từ chối.
3. saved address của Customer khác bị từ chối.
4. Product Inactive bị từ chối.
5. Không đủ tồn bị từ chối và không giữ kho.
6. Giá frontend gửi sai không thay đổi giá/order total backend.
7. Checkout cùng key hai lần chỉ có một Order, một OrderDetail và một Payment.
8. Retry cùng request trả lại Order gốc.
9. Dòng Cart có product ID không hợp lệ hoặc quantity không phải số nguyên dương bị từ chối trước khi ghi dữ liệu.
10. Lỗi sau khi đã tạo một phần dữ liệu vẫn rollback toàn bộ transaction.

Frontend test phải xác nhận COD payload, khóa nút, giữ Cart khi lỗi và chỉ reset/redirect khi thành công.

## Ngoài phạm vi

- Staff xác nhận Order.
- Tạo hoặc hoàn tất StockExportRequest.
- Packed/Shipped/Delivered.
- COD collection/Paid sau giao hàng.
- Payment online, PayOS, refund, return/exchange và shipping carrier.
