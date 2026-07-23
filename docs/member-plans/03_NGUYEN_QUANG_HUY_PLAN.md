# Nguyễn Quang Huy - Cart, Checkout, Order, Payment Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Nguyễn Quang Huy |
| Role in team | Customer purchase flow owner |
| Main responsibility | Cart Management, Checkout, Order Placement, Payment domain state/COD, Customer Order History, Cancel Order; không sở hữu PayOS integration |
| Git branch | `feature/huy-cart-order-payment` |
| Priority | Must Have |

## 2. Business Objective

Đảm bảo Customer có thể mua hàng từ lúc thêm sản phẩm vào giỏ đến khi tạo đơn và thanh toán. Đây là flow quan trọng nhất để chứng minh hệ thống là e-commerce thật, không chỉ là catalog.

## 3. Module Ownership

- Cart Management.
- Checkout & Order Placement.
- COD order flow.
- Online order/payment state và callback invariant; PayOS provider adapter/webhook do Nguyễn Ngọc Thành sở hữu.
- Customer order history.
- Customer order detail/status.
- Cancel Pending unpaid order.

## 4. Important Flows Owned

| Flow | Trigger | Expected result |
|---|---|---|
| Customer add cart | Customer clicks Add to Cart | Product added/merged in cart |
| Customer COD checkout | Customer selects COD | Order created with COD/Pending payment |
| Customer online payment | Customer selects online payment | Payment request created, callback updates status |
| Customer cancel order | Customer cancels Pending unpaid order | Order status becomes Cancelled |
| Customer view history | Customer opens Order History | Own orders only displayed |

## 5. Frontend Scope

### Pages

| Page | Path suggestion | Purpose |
|---|---|---|
| Cart Page | `client/src/pages/customer/CartPage.jsx` | Manage cart items |
| Checkout Page | `client/src/pages/customer/CheckoutPage.jsx` | Confirm shipping/payment |
| Payment Page | `client/src/pages/customer/PaymentPage.jsx` | Contract với PayOS integration của Thành |
| Payment Result Page | `client/src/pages/customer/PaymentResultPage.jsx` | Hiển thị state từ provider; integration thuộc Thành |
| Order History Page | `client/src/pages/customer/OrderHistoryPage.jsx` | Customer purchase history |
| Order Detail Page | `client/src/pages/customer/OrderDetailPage.jsx` | Order status, items, cancel action |

### Components

| Component | Purpose |
|---|---|
| CartItemRow | Quantity update/remove |
| CartSummary | Subtotal/total display |
| CheckoutAddressForm | Shipping address |
| PaymentMethodSelector | COD vs Online |
| OrderStatusBadge | Display order status |
| OrderTimeline | Pending/Confirmed/Packed/Shipped/Delivered |

### Services

| File | Purpose |
|---|---|
| `client/src/services/cartService.js` | Cart APIs |
| `client/src/services/orderService.js` | Order APIs |
| `client/src/services/paymentService.js` | Payment APIs |

## 6. Backend Scope

### Models

| Model | Fields |
|---|---|
| ShoppingCart | customerId, status, createdAt, updatedAt |
| CartItem | cartId, productId, quantity, unitPriceSnapshot, createdAt, updatedAt |
| Order | orderCode, customerId, totalAmount, paymentMethod, paymentStatus, orderStatus, shippingAddress, createdAt, updatedAt |
| OrderDetail | orderId, productId, productNameSnapshot, priceSnapshot, quantity, subtotal |
| Payment | orderId, transactionId, paymentMethod, amount, paymentStatus, paidAt, rawResponse |

### Routes/Controllers/Services

| Layer | File suggestion | Responsibility |
|---|---|---|
| Route | `server/src/routes/cart.routes.js` | Cart item endpoints |
| Route | `server/src/routes/order.routes.js` | Customer order endpoints |
| Route | `server/src/routes/payment.routes.js` | Huy phối hợp Payment domain route; PayOS webhook route thuộc Thành |
| Controller | `server/src/controller/cart.controller.js` | Cart request/response |
| Controller | `server/src/controller/order.controller.js` | Order request/response |
| Controller | `server/src/controller/payment.controller.js` | Shared boundary; PayOS request/webhook mapping thuộc Thành |
| Service | `server/src/services/cart.service.js` | Cart business rules |
| Service | `server/src/services/order.service.js` | Checkout/order/cancel rules |
| Service | `server/src/services/payment.service.js` | Huy sở hữu domain state/COD/invariant; Thành sở hữu PayOS adapter/link/webhook integration |

## 7. API Scope

| Method | Endpoint | Permission | Request | Response | Error cases |
|---|---|---|---|---|---|
| GET | `/api/cart` | Customer | token | Active cart | Unauthorized |
| POST | `/api/cart/items` | Customer | productId, quantity | Updated cart | Product inactive, stock insufficient |
| PATCH | `/api/cart/items/:id` | Customer | quantity | Updated cart | Quantity invalid/exceeds stock |
| DELETE | `/api/cart/items/:id` | Customer | item id | Updated cart | Item not found |
| POST | `/api/orders` | Customer | shippingAddress, paymentMethod | Created order | Empty cart, stock insufficient |
| GET | `/api/orders/my` | Customer | filters | Own orders | Unauthorized |
| GET | `/api/orders/:id` | Customer | order id | Own order detail | Forbidden/not found |
| PATCH | `/api/orders/:id/cancel` | Customer | reason optional | Cancelled order | Paid/confirmed order cannot cancel |
| POST | `/api/orders/:id/payments` | Customer | paymentMethod | Payment result/request | Invalid amount/order |
| POST | `/api/payments/payos/webhook` | PayOS | Signed webhook payload | Callback accepted | Signature/duplicate/amount invalid; endpoint và provider mapping thuộc Thành |

## 8. Database/Model Scope

| Collection | Required indexes | Business constraints |
|---|---|---|
| ShoppingCart | customerId + status | One active cart per customer |
| CartItem | cartId + productId unique | Quantity > 0 |
| Order | orderCode unique, customerId, orderStatus | Customer sees own orders only |
| OrderDetail | orderId, productId | Snapshot product name/price at purchase time |
| Payment | orderId, transactionId | Amount must match order total |

## 9. UI Screens/Components

| Screen | Main data | Main actions |
|---|---|---|
| Cart | Cart items, quantity, total | Update quantity, remove, checkout |
| Checkout | Items, address, payment method | Place order |
| Payment Result | Payment status | Retry/view order |
| Order History | Orders by date/status | View detail |
| Order Detail | Items, payment, status timeline | Cancel if Pending unpaid |

## 10. Validation And Error Cases

| Case | Expected handling |
|---|---|
| Cart empty at checkout | Block checkout |
| Quantity > available stock | Block add/update/order |
| Product inactive | Block add/order |
| Missing shipping address | Show validation error |
| Duplicate checkout submit | Do not create duplicate order |
| Online payment amount mismatch | Reject callback |
| Cancel paid order | Reject with business message |
| Customer opens other user's order | Return `403` |

## 11. Integration Dependencies

| Dependency | Owner |
|---|---|
| Customer auth/role guard | Nguyễn Ngọc Thành |
| Product active/price/category APIs | Phạm Thành Chung |
| Inventory available stock | Lê Vũ Cường |
| Staff processing requires created orders | Nguyễn Hữu Anh Nhật |
| Notification domain event contract | Nguyễn Quang Huy |
| Email delivery hook | Nguyễn Ngọc Thành |

## 12. Phase-by-Phase Task List

### Phase 3 - Main Delivery

- [ ] Create ShoppingCart and CartItem models.
- [ ] Implement cart add/update/remove/get APIs.
- [ ] Build Cart page.
- [ ] Create Order and OrderDetail models.
- [ ] Implement checkout/order creation service.
- [ ] Build Checkout page.
- [ ] Build Order History and Order Detail pages.
- [ ] Implement cancel Pending unpaid order.

### Phase 4 - Payment Delivery

- [ ] Create Payment model.
- [ ] Implement COD payment record.
- [ ] Bàn giao Payment domain contract để Thành tích hợp PayOS.
- [ ] Giữ state/idempotency/late-callback invariant; không giữ PayOS credential hoặc webhook adapter.
- [ ] Phối hợp Payment và Payment Result pages theo response contract của Thành.
- [ ] Connect payment status to Order Detail.

### Phase 5 - Staff Support

- [ ] Ensure Staff can query order data needed for queue.
- [ ] Expose order status/payment status consistently.

### Phase 7 - Refund Support

- [ ] Provide order eligibility data for Delivered order refund.
- [ ] Ensure cancelled order cannot request refund.

## 13. Git Branch/PR Suggestion

| PR | Branch | Content |
|---|---|---|
| PR 1 | `feature/huy-cart-checkout` | Cart models/APIs/UI and checkout page |
| PR 2 | `feature/huy-order-history-cancel` | Order models/APIs/history/detail/cancel |
| PR 3 | `feature/huy-payment-flow` | Payment domain model/state/COD; PayOS integration tách sang branch của Thành |

## 14. Testing Checklist

- [ ] Customer can add active product to cart.
- [ ] Same product added twice merges quantity.
- [ ] Quantity exceeding stock is rejected.
- [ ] Empty cart cannot checkout.
- [ ] COD checkout creates order and payment record.
- [ ] Online payment success sets payment Paid.
- [ ] Online payment failed keeps order unpaid.
- [ ] Duplicate callback does not double-update payment.
- [ ] Customer sees only own orders.
- [ ] Pending unpaid order can be cancelled.
- [ ] Paid/confirmed order cannot be cancelled.

## 15. Demo Script For Mentor

1. Login as Customer.
2. Open Product Detail and add product to cart.
3. Update quantity in Cart.
4. Checkout with COD.
5. Open Order History and show created order.
6. Tạo một online order và yêu cầu hosted payment link PayOS.
7. Quét QR/thanh toán trong môi trường test phù hợp hoặc gửi webhook test có signature; kiểm tra trạng thái chính thức qua webhook.
8. Cancel a Pending unpaid order.
9. Try cancelling a paid/confirmed order and show rejection.

## 16. Risk And Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Duplicate checkout creates multiple orders | Wrong revenue/order data | Disable submit button and use idempotency/check cart status |
| Price changes after cart add | Wrong order total | Recalculate from Product during checkout and snapshot into OrderDetail |
| Payment callback duplicated | Wrong payment status | Check existing transaction/status before update |
| Order ownership missing | Customer sees other orders | Always filter by `customerId` |

## 17. Final Checklist

- [ ] Cart flow complete.
- [ ] Checkout flow complete.
- [ ] Order model/detail complete.
- [ ] Payment model/state/COD complete; PayOS integration được Thành bàn giao riêng.
- [ ] Order history/detail complete.
- [ ] Cancel valid order complete.
- [ ] Manual demo tested.

## Ownership Addendum 2026-07-20

Huy bổ sung **Checkout Address Book integration**:

- Hiển thị địa chỉ đã lưu và địa chỉ mặc định trong Checkout.
- Cho phép chọn nhanh, nhập địa chỉ mới dùng một lần hoặc lưu vào Address Book.
- Validate thông tin người nhận, số điện thoại, tỉnh/thành, quận/huyện, phường/xã và địa chỉ chi tiết.
- Gửi address payload chuẩn để backend tạo snapshot trong Order; không đọc lại địa chỉ hiện tại sau khi đặt đơn.

## Ownership Addendum 2026-07-22 - PayOS

Phần tích hợp cổng thanh toán online PayOS đã chuyển sang Nguyễn Ngọc Thành và addendum này ưu tiên hơn các dòng cũ còn nhắc “online mock/callback”:

- Thành sở hữu `@payos/node`, credential/env, tạo payment link, return/cancel URL, public webhook, signature verification, provider response mapping và frontend redirect/result integration.
- Huy chỉ sở hữu Order/Payment domain state, COD, idempotency, amount/ownership validation, late paid callback và refund hand-off sau khi nhận dữ liệu provider đã được Thành xác minh.
- Branch PayOS là `feature/thanh-payos-payment`; không commit PayOS bằng identity của Huy.

## Ownership Addendum 2026-07-23 - Notification Domain (Ưu tiên)

Addendum này ưu tiên mọi dòng legacy trái ngược về ownership Notification.

- Nguyễn Quang Huy sở hữu Notification domain foundation: Notification model/service/API, in-app UI (bell/dropdown/list/detail), read/unread/delete, tiêu thụ domain event và retry status.
- Mọi module khác, gồm Staff/Return/Refund/Support của Nhật và Warehouse/Reports/Settings của Cường, chỉ phát domain event idempotent theo Notification contract của Huy; không tự tạo Notification model, bell hay read/unread/delete rule.
- Nguyễn Ngọc Thành vẫn sở hữu riêng EmailOutbox, Gmail SMTP/email delivery, OTP/password reset, public contact email, PayOS integration/provider/webhook, Audit và final integration. Email delivery/retry không được chuyển sang Huy.
- Ownership documentation branch only: `feature/huy-notification-ownership-docs`. Branch code Notification tương lai: `feature/huy-notification-domain` (TBD, chưa tạo). Author: `Nguyễn Quang Huy <quanghuyn267@gmail.com>`.

## Ownership Addendum 2026-07-22 - Order Created Email Event

Huy sở hữu phát sự kiện email `ORDER_CREATED` sau khi transaction checkout commit thành công:

- Event được ghi vào email outbox với khóa idempotent `ORDER_CREATED:<orderId>` và gửi đến email của Customer.
- Payload chỉ gồm snapshot tối thiểu (`orderId`, `orderCode`, `totalAmount`, `paymentMethod`); lỗi enqueue/delivery không rollback đơn hàng.
- Không phát event khi checkout replay theo cùng idempotency key.
## Ownership Addendum 2026-07-22 - Order Email Failure Boundary

- After checkout commits, customer lookup and `ORDER_CREATED` enqueue are isolated from the order response. A lookup/provider enqueue failure is recorded for operational follow-up and never rolls back or converts a successfully committed order into a 500 response.

## Checkout Address/Transaction Closure 2026-07-23

- Checkout gửi `savedAddressId` cho địa chỉ đã lưu; backend bắt buộc truy vấn theo
  cả `addressId` và `customerId`, sau đó mới tạo snapshot bất biến trong Order.
- Địa chỉ dùng một lần dùng payload `deliveryAddress` có cấu trúc; backend validate
  riêng tên, số điện thoại, tỉnh/thành, quận/huyện, phường/xã và địa chỉ chi tiết.
- Không tin snapshot phẳng do client gửi khi `savedAddressId` được chọn.
- MongoDB local/production phải là replica set hoặc mongos vì checkout ghi Order,
  OrderDetail, Payment, PaymentAttempt, Inventory reservation và Cart trong một
  transaction. Server fail-fast nếu topology không hỗ trợ transaction; không dùng
  fallback ghi từng phần.
- MongoDB code 20 được trả thành `503 DATABASE_TRANSACTIONS_UNSUPPORTED` với thông
  báo cấu hình rõ ràng thay vì `500 Internal server error`.
- The event remains idempotent with key `ORDER_CREATED:<orderId>`; retries are handled by the durable email worker owned by Thành.

## Ownership Addendum 2026-07-23 - Shared Cart Indicator

Huy bổ sung trạng thái giỏ hàng dùng chung cho luồng Customer:

- Header chỉ hiện chấm đỏ có nhãn trợ năng khi Customer có ít nhất một sản phẩm trong giỏ; Staff, Warehouse và Admin không nhận trạng thái hoặc chỉ báo giỏ hàng.
- `CartProvider` nạp lại giỏ theo Customer đăng nhập, xóa trạng thái khi logout/chuyển role và đồng bộ sau add, cập nhật số lượng, xóa item hoặc tạo đơn thành công.
- Mỗi lần đổi tài khoản hoặc reset sau checkout sẽ tăng generation và thay hàng đợi; các cart operation trong cùng generation chạy tuần tự theo thứ tự người dùng khởi tạo, còn operation cũ đang chờ sẽ bị bỏ qua trước khi gọi API.
- Header là shared-shell do Thành khởi tạo, nhưng thay đổi này thuộc Cart flow của Huy; không làm thay đổi menu hoặc quyền của role nội bộ.
