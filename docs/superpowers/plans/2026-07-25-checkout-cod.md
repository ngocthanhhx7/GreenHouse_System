# Checkout COD tạo đơn Pending Implementation Plan

> **For agentic workers:** Execute this plan inline in the isolated `feature/checkout-cod` worktree. Do not add Staff, Warehouse, Shipping, online-payment, return or refund behavior.

**Goal:** Harden the existing Customer checkout so one authenticated Customer request creates exactly one valid COD Order Pending with server-derived price, address and stock snapshots.

**Architecture:** Reuse `POST /api/orders`, `orderService.placeOrder`, the existing MongoDB transaction manager, Cart version check, reservation repository and Order idempotency index. Add only a controller-level COD boundary, invalid Cart data guards, and the smallest matching frontend/test changes.

**Tech Stack:** Node.js, Express, Mongoose, React/Vite, Node test runner, MongoDB replica-set transactions.

## Global Constraints

- Only an authenticated `Customer` may call checkout.
- `customerId` and role come from the authenticated session; ignore request-body identity fields.
- Product status/category status, price, price version and inventory availability come from the backend.
- New COD Order must be `Pending` and `Unpaid`.
- Order, OrderDetail, Payment, OrderReservation, inventory reservation and Cart close must remain atomic.
- Idempotency-Key is required and must replay the original Order without duplicate writes.
- Frontend must not clear Cart before successful checkout response.
- Do not add dependencies or change the existing route architecture.

---

### Task 1: Add failing backend regression tests for COD boundary and invalid Cart data

**Files:**
- Modify: `server/src/controller/order.controller.test.js` (create if absent)
- Modify: `server/src/services/order.service.test.js`
- Modify: `server/src/services/order.service.js` only for an exported test seam if required by the tests

**Interfaces:**
- Controller test calls `orderController.placeOrder(req, res, next)` with `req.user.id`, body and `get('Idempotency-Key')`.
- Service tests call the existing `createOrderService(...).placeOrder(customerId, input)`.

- [ ] **Step 1: Write the failing service test for an invalid Cart quantity**

Add a test that sets `cartRepository.items[0].quantity = 0`, submits a matching positive `expectedItems` entry, and expects:

```js
await assert.rejects(
  () => orderService.placeOrder('customer-1', checkoutInput({
    idempotencyKey: 'invalid-cart-quantity-001',
  })),
  (error) => error.statusCode === 400 && error.errorCode === 'CART_ITEM_INVALID',
);
assert.equal(orderRepository.orders.length, 0);
assert.equal(orderRepository.details.length, 0);
assert.equal(inventoryRepository.reservedQuantity, 0);
```

- [ ] **Step 2: Write the failing service/repository test for an invalid Mongo product ID**

Expose `createModelProductRepository` from `server/src/services/order.service.js` only if needed for a direct unit test. Assert that `findSellableById('not-a-mongo-id')` returns `null` without issuing a Mongoose cast error. This protects the HTTP path from turning a malformed Cart row into a 500.

- [ ] **Step 3: Write the failing controller test for the authenticated Customer and COD-only boundary**

Temporarily replace `orderService.placeOrder` with a spy, invoke the controller with:

```js
{
  user: { id: 'customer-from-session', role: 'Customer' },
  body: {
    paymentMethod: 'COD',
    userId: 'attacker-supplied',
    customerId: 'attacker-supplied',
  },
  get(name) {
    return name === 'Idempotency-Key' ? 'checkout-controller-001' : '';
  },
}
```

Assert the service receives `customer-from-session`, not either body identity. Add a second assertion that `paymentMethod: 'ONLINE'` calls `next` with `errorCode === 'CHECKOUT_COD_ONLY'` and never invokes the service.

- [ ] **Step 4: Run only the new tests and verify they fail for the intended missing guards**

Run:

```powershell
node --test src/services/order.service.test.js
node --test src/controller/order.controller.test.js
```

Expected red failures: invalid quantity is not yet `CART_ITEM_INVALID`, invalid product ID is not yet safely rejected by the model repository, and ONLINE is not yet blocked at the controller.

- [ ] **Step 5: Commit the red tests**

```powershell
git add server/src/services/order.service.test.js server/src/controller/order.controller.test.js
git commit -m "test: define checkout COD and cart integrity guards"
```

### Task 2: Implement backend guards without changing the transaction flow

**Files:**
- Modify: `server/src/services/order.service.js`
- Modify: `server/src/controller/order.controller.js`

**Interfaces:**
- Keep `createOrderService().placeOrder(customerId, input)` unchanged for existing service callers and existing online-payment tests.
- The HTTP controller is the boundary for this slice and accepts only COD.
- `createModelProductRepository().findSellableById(id, session)` returns `null` for a malformed ObjectId.

- [ ] **Step 1: Add the invalid-ID guard to the model Product repository**

At the start of `findSellableById`, return `null` when `mongoose.isValidObjectId(id)` is false. Keep the existing Active Product + populated Active Category query unchanged for valid IDs.

- [ ] **Step 2: Add Cart item integrity validation before Product lookup**

At the start of `buildOrderLines`, validate each persisted Cart item:

```js
const quantity = Number(item.quantity);
if (!Number.isInteger(quantity) || quantity <= 0 || !item.productId) {
  throw new ApiError(
    400,
    'Cart contains an invalid item',
    [{ field: `cartItems.${String(item._id || lines.length)}`, message: 'Product and quantity must be valid' }],
    'CART_ITEM_INVALID',
  );
}
```

Use the validated integer in the line snapshot and subtotal. Do not use any frontend subtotal or total.

- [ ] **Step 3: Add a controller-level COD assertion**

Add a small helper in `order.controller.js` that normalizes a missing method to COD and rejects any explicit method other than exact `COD` with:

```js
new ApiError(
  400,
  'Checkout hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).',
  [{ field: 'paymentMethod', message: 'Chọn phương thức COD' }],
  'CHECKOUT_COD_ONLY',
)
```

Call the existing service with `req.user.id` and the existing body/idempotency header merge. Never pass a body-provided user ID as the customer identity. Keep service-level ONLINE behavior untouched for out-of-scope internal callers.

- [ ] **Step 4: Run the new tests and verify they pass**

Run:

```powershell
node --test src/services/order.service.test.js
node --test src/controller/order.controller.test.js
```

Expected: all existing order service tests plus the new guards pass.

- [ ] **Step 5: Run backend checkout acceptance coverage**

Run:

```powershell
node --test src/acceptance/sl006.acceptance.test.js src/services/order.service.test.js src/models/order.model.test.js src/models/orderReservation.model.test.js
```

Expected: zero failures. Confirm existing online service tests still pass because the HTTP COD boundary does not rewrite the service contract.

- [ ] **Step 6: Commit the backend implementation**

```powershell
git add server/src/services/order.service.js server/src/controller/order.controller.js
git commit -m "fix: harden COD checkout cart and payment guards"
```

### Task 3: Make CheckoutPage explicitly COD-only and add frontend regression tests

**Files:**
- Modify: `client/src/pages/customer/CheckoutPage.jsx`
- Modify: `client/src/pages/customer/CheckoutPage.test.js`

**Interfaces:**
- Keep `orderService.placeOrder(payload, { idempotencyKey })` and the existing `POST /api/orders` contract.
- Payload must include `paymentMethod: 'COD'`, Cart ID/version, address source, expected item quantities and display price/version for server drift detection.

- [ ] **Step 1: Add failing source-contract assertions**

Extend `CheckoutPage.test.js` to assert:

```js
assert.match(source, /paymentMethod,\s*['"]COD['"]/);
assert.doesNotMatch(source, /value=["']ONLINE["']/);
assert.match(source, /Đặt hàng khi nhận hàng|Thanh toán khi nhận hàng/);
```

Keep the existing assertions for idempotency, submit locking, backend error display and clearing Cart only after success.

- [ ] **Step 2: Run the frontend checkout tests and verify the COD-only assertion fails**

Run:

```powershell
node --test src/pages/customer/CheckoutPage.test.js src/services/orderService.test.js
```

Expected red failure because the current page still renders the ONLINE radio option.

- [ ] **Step 3: Replace the two-option payment selector with a COD-only selected panel**

In `CheckoutPage.jsx`:

- keep `paymentMethod` as a constant `'COD'` (or equivalent stable value);
- remove the ONLINE radio and its state transition;
- keep the COD explanation visible;
- continue sending `paymentMethod` in the existing payload;
- do not change the Cart reset/redirect/error handling order.

- [ ] **Step 4: Run the frontend checkout tests and build**

Run:

```powershell
node --test src/pages/customer/CheckoutPage.test.js src/services/orderService.test.js
npm run build
```

Expected: checkout/order tests pass and Vite exits with code 0.

- [ ] **Step 5: Commit the frontend implementation**

```powershell
git add client/src/pages/customer/CheckoutPage.jsx client/src/pages/customer/CheckoutPage.test.js
git commit -m "fix: keep customer checkout on COD"
```

### Task 4: Verify the complete COD creation contract

**Files:**
- No production file changes planned.
- Inspect: `server/src/routes/order.routes.js`, `server/src/controller/order.controller.js`, `server/src/services/order.service.js`, `server/src/models/order.model.js`, `server/src/models/orderDetail.model.js`, `server/src/models/payment.model.js`, `server/src/models/orderReservation.model.js`, `client/src/pages/customer/CheckoutPage.jsx`.

**Interfaces:**
- HTTP endpoint: `POST /api/orders`
- Required header: `Idempotency-Key: checkout-demo-001`
- Required body shape:

```json
{
  "cartId": "<active-cart-id>",
  "cartVersion": 1,
  "savedAddressId": "<customer-owned-address-id>",
  "paymentMethod": "COD",
  "expectedItems": [
    {
      "productId": "<product-id>",
      "quantity": 2,
      "unitPrice": 250000,
      "priceVersion": "2026-07-23T00:00:00.000Z"
    }
  ],
  "customerNote": "Gọi trước khi giao"
}
```

- [ ] **Step 1: Run the full backend test suite**

Run:

```powershell
npm test
```

Expected: exit code 0 with zero failed tests.

- [ ] **Step 2: Run the full frontend test suite**

Run:

```powershell
npm test
```

Expected: exit code 0 with zero failed tests.

- [ ] **Step 3: Run the frontend production build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

- [ ] **Step 4: Verify the live demo database topology before HTTP testing**

Confirm `MONGODB_URI` points to the configured replica set and the backend starts without `DATABASE_TRANSACTIONS_UNSUPPORTED`. Do not run a destructive seed/reset command.

- [ ] **Step 5: Execute manual happy-path HTTP/browser verification**

Use a Customer session and an existing Active Cart/address:

1. Load `/api/cart` and record Cart ID/version and one valid item.
2. Load `/api/profile/addresses` and choose an address owned by that Customer.
3. POST the request above with one Idempotency-Key.
4. Assert HTTP `201`, `orderStatus: "Pending"`, `paymentMethod: "COD"`, `paymentStatus: "Unpaid"`.
5. Assert returned `details[0].priceSnapshot` equals the Product database price, not a client-submitted fake.
6. Repeat the exact request with the same key and assert the same Order ID with no new detail/payment/reservation.
7. Assert Customer can read the created order from `/api/orders/:id`; do not call Staff/Warehouse endpoints.

- [ ] **Step 6: Execute negative-path verification**

Check each produces a 4xx/409 and no new Order:

- empty Cart;
- saved address belonging to another Customer;
- inactive Product;
- quantity greater than available;
- tampered frontend price;
- explicit `paymentMethod: "ONLINE"` through HTTP;
- second request with the same key but changed address/quantity;
- malformed legacy Cart quantity/product ID.

- [ ] **Step 7: Review the final diff and report**

Run:

```powershell
git status --short
git log --oneline -6
git diff HEAD~3..HEAD --stat
```

Report exact files, endpoint/request/response shape, Order/OrderDetail snapshot fields, idempotency behavior, test outputs, manual verification evidence, and the out-of-scope fulfillment/payment-online work.
