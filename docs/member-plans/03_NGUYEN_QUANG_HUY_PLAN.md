# Nguyễn Quang Huy - Cart, Checkout, Order, Payment Plan

## 1. Owner Information

| Field | Detail |
|---|---|
| Owner | Nguyễn Quang Huy |
| Role in team | Customer purchase flow owner |
| Main responsibility | Cart Management, Checkout, Order Placement, Payment/COD, Customer Order History, Cancel Order |
| Git branch | `feature/huy-cart-order-payment` |
| Priority | Must Have |

## 2. Business Objective

Đảm bảo Customer có thể mua hàng từ lúc thêm sản phẩm vào giỏ đến khi tạo đơn và thanh toán. Đây là flow quan trọng nhất để chứng minh hệ thống là e-commerce thật, không chỉ là catalog.

## 3. Module Ownership

- Cart Management.
- Checkout & Order Placement.
- COD order flow.
- Online payment mock/callback flow.
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
| Payment Page | `client/src/pages/customer/PaymentPage.jsx` | Start online payment/mock |
| Payment Result Page | `client/src/pages/customer/PaymentResultPage.jsx` | Show payment result |
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
| Route | `server/src/routes/payment.routes.js` | Payment request/callback endpoints |
| Controller | `server/src/controller/cart.controller.js` | Cart request/response |
| Controller | `server/src/controller/order.controller.js` | Order request/response |
| Controller | `server/src/controller/payment.controller.js` | Payment request/response |
| Service | `server/src/services/cart.service.js` | Cart business rules |
| Service | `server/src/services/order.service.js` | Checkout/order/cancel rules |
| Service | `server/src/services/payment.service.js` | COD/online payment rules |

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
| POST | `/api/payments/callback` | Gateway/mock | transactionId, orderId, status, amount | Callback accepted | Duplicate/invalid callback |

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
| Notification email hook | Lê Vũ Cường |

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
- [ ] Implement online payment mock request.
- [ ] Implement payment callback endpoint.
- [ ] Build Payment and Payment Result pages.
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
| PR 3 | `feature/huy-payment-flow` | Payment model/COD/online mock/callback/result page |

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
6. Create another order with online payment mock.
7. Simulate payment success/failure.
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
- [ ] Payment model/COD/online mock complete.
- [ ] Order history/detail complete.
- [ ] Cancel valid order complete.
- [ ] Manual demo tested.

## Ownership Addendum 2026-07-20

Huy bổ sung **Checkout Address Book integration**:

- Hiển thị địa chỉ đã lưu và địa chỉ mặc định trong Checkout.
- Cho phép chọn nhanh, nhập địa chỉ mới dùng một lần hoặc lưu vào Address Book.
- Validate thông tin người nhận, số điện thoại, tỉnh/thành, quận/huyện, phường/xã và địa chỉ chi tiết.
- Gửi address payload chuẩn để backend tạo snapshot trong Order; không đọc lại địa chỉ hiện tại sau khi đặt đơn.
