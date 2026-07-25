# Restore Online Payment Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore PayOS online payment selection and checkout while preserving the verified COD flow.

**Architecture:** Reuse the existing `OrderService` online-payment branch, `PaymentService`, PayOS gateway, payment route, and `PaymentPage`. Change only the checkout boundary that currently forces COD, then route newly created online orders to the existing payment page. Backend validation will allow exactly `COD` or `ONLINE`; all prices, identity, ownership, deadlines, and PayOS credentials remain server-controlled.

**Tech Stack:** React/Vite, Node.js/Express, Mongoose/MongoDB transactions, Node test runner, existing PayOS adapter.

## Global Constraints

- Do not add a new payment provider or change PayOS webhook semantics.
- Keep COD behavior unchanged: `Pending/Unpaid`.
- Online orders must be `Pending/Pending` with a server-derived payment deadline.
- Never trust frontend `userId`, role, price, or total.
- Only the owning authenticated Customer may create a payment link.
- PayOS secrets remain environment variables only.
- Do not modify Staff, Warehouse, shipping, return, exchange, or refund business rules.

---

### Task 1: Reopen the backend checkout boundary for COD and ONLINE

**Files:**
- Modify: `server/src/controller/order.controller.js:1-24`
- Test: `server/src/controller/order.controller.test.js`

**Interfaces:**
- Consumes the existing `orderService.placeOrder(customerId, input)` contract.
- Produces a normalized input with `paymentMethod` equal to `COD` or `ONLINE`.

- [ ] **Step 1: Write the failing controller tests**

Add a test beside the existing COD identity test:

```js
it('allows ONLINE while preserving the authenticated Customer identity', async () => {
  const originalPlaceOrder = orderService.placeOrder;
  let captured;
  orderService.placeOrder = async (customerId, input) => {
    captured = { customerId, input };
    return { id: 'online-order-1', orderStatus: 'Pending', paymentStatus: 'Pending' };
  };

  try {
    const response = createResponse();
    await orderController.placeOrder(
      requestOf({ paymentMethod: 'ONLINE', customerId: 'attacker-supplied', role: 'Admin' }),
      response,
      (error) => { throw error; },
    );
    assert.equal(captured.customerId, 'customer-from-session');
    assert.equal(captured.input.paymentMethod, 'ONLINE');
    assert.equal(captured.input.customerId, undefined);
    assert.equal(captured.input.role, undefined);
    assert.equal(response.statusCode, 201);
  } finally {
    orderService.placeOrder = originalPlaceOrder;
  }
});
```

Change the existing invalid-method test input from only `ONLINE` to `BANK_TRANSFER`
and keep its expectation that the service is not called with a 400 validation error.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test src/controller/order.controller.test.js
```

Expected: the new ONLINE test fails because the current controller returns
`CHECKOUT_COD_ONLY`, while the invalid `BANK_TRANSFER` test remains meaningful.

- [ ] **Step 3: Implement the smallest backend change**

Replace the COD-only condition in `normalizeCodCheckoutInput` with an exact
allowlist:

```js
const paymentMethod = String(body.paymentMethod || 'COD').trim().toUpperCase();
if (!['COD', 'ONLINE'].includes(paymentMethod)) {
  throw new ApiError(
    400,
    'Phương thức thanh toán không được hỗ trợ.',
    [{ field: 'paymentMethod', message: 'Chọn COD hoặc thanh toán trực tuyến' }],
    'CHECKOUT_PAYMENT_METHOD_INVALID',
  );
}
```

Return the normalized `paymentMethod` variable. Do not change `customerId`,
idempotency, address, expected item, or service calls.

- [ ] **Step 4: Run focused backend tests**

Run:

```powershell
node --test src/controller/order.controller.test.js
```

Expected: all controller tests pass, including ONLINE acceptance and invalid
method rejection.

- [ ] **Step 5: Commit**

```powershell
git add server/src/controller/order.controller.js server/src/controller/order.controller.test.js
git commit -m "feat: allow online checkout orders"
```

### Task 2: Restore the online option and route online orders to PayOS

**Files:**
- Modify: `client/src/pages/customer/CheckoutPage.jsx:50-230`
- Test: `client/src/pages/customer/CheckoutPage.test.js`

**Interfaces:**
- Consumes `orderService.placeOrder` and the existing `PaymentPage` route
  `/orders/:id/payment`.
- Produces COD navigation to `/orders/:id` and ONLINE navigation to
  `/orders/:id/payment`.

- [ ] **Step 1: Write failing Checkout contract tests**

Replace the COD-only contract test with assertions for both methods:

```js
it('renders COD and ONLINE options with COD selected by default', () => {
  assert.match(source, /useState\(['"]COD['"]\)/);
  assert.match(source, /value=["']COD["']/);
  assert.match(source, /value=["']ONLINE["']/);
  assert.match(source, /Thanh toán khi nhận hàng/);
  assert.match(source, /Thanh toán trực tuyến/);
});

it('routes an ONLINE order to the existing payment page', () => {
  assert.match(source, /paymentMethod === ['"]ONLINE['"]/);
  assert.match(source, /navigate\(`\/orders\/\$\{order\.id\}\/payment`\)/);
});
```

Update the existing successful-order assertion so it accepts the two route
branches while still requiring `resetCart()` before navigation.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run:

```powershell
node --test src/pages/customer/CheckoutPage.test.js
```

Expected: the new test fails because the component currently has a fixed COD
constant and only one radio option.

- [ ] **Step 3: Implement the minimal UI and navigation change**

Use state with COD as the default:

```jsx
const [paymentMethod, setPaymentMethod] = useState('COD');
```

Render two radio labels. The ONLINE option must explain that the Customer is
redirected to PayOS after the order is created. Keep the existing submit
payload, idempotency key, and backend-derived totals unchanged.

After `orderService.placeOrder` succeeds:

```jsx
resetCart();
navigate(
  paymentMethod === 'ONLINE'
    ? `/orders/${order.id}/payment`
    : `/orders/${order.id}`,
  { replace: true },
);
```

Keep the button disabled during submission and preserve existing error
mapping.

- [ ] **Step 4: Run focused frontend tests and build**

Run:

```powershell
node --test src/pages/customer/CheckoutPage.test.js
npm run build
```

Expected: focused tests pass and Vite build exits 0. A chunk-size warning is
acceptable if no new warning is introduced by this change.

- [ ] **Step 5: Commit**

```powershell
git add client/src/pages/customer/CheckoutPage.jsx client/src/pages/customer/CheckoutPage.test.js
git commit -m "feat: restore online checkout option"
```

### Task 3: Verify PayOS handoff, ownership, and regression safety

**Files:**
- Inspect only unless a focused regression exposes a defect:
  `client/src/pages/customer/PaymentPage.jsx`
  `client/src/services/paymentService.js`
  `server/src/services/payment.service.js`
  `server/src/routes/payment.routes.js`
  `server/src/config/payos.js`

**Interfaces:**
- Uses existing `POST /api/orders/:id/payments`.
- Uses existing `PAYOS_NOT_CONFIGURED` response when secrets or redirect
  URLs are absent.

- [ ] **Step 1: Run payment and order focused tests**

Run:

```powershell
node --test src/services/order.service.test.js src/services/payment.service.test.js src/routes/payment.routes.test.js
```

Expected: existing online order deadline, payment-attempt reuse, ownership,
and route-RBAC tests pass.

- [ ] **Step 2: Verify missing configuration fails safely**

Run the existing PayOS configuration tests:

```powershell
node --test src/config/payos.test.js
```

Expected: no secret is printed and missing configuration maps to
`PAYOS_NOT_CONFIGURED`.

- [ ] **Step 3: Run full regression**

Run:

```powershell
Push-Location server
npm test
Pop-Location
Push-Location client
npm test
npm run build
Pop-Location
```

Expected: backend and frontend test suites pass with zero failures and the
production build exits 0.

- [ ] **Step 4: Manual browser smoke test**

With valid PayOS environment variables configured:

1. Login as `customer@greenhome.test`.
2. Add an active product to the cart.
3. Open Checkout and confirm both COD and Online appear.
4. Select Online and submit.
5. Confirm the order is created as `Pending/Pending`.
6. Confirm the browser opens `/orders/<id>/payment`.
7. Confirm the PayOS link is shown or a clear `PAYOS_NOT_CONFIGURED` error is shown.
8. Repeat with COD and confirm it remains `Pending/Unpaid` and opens order detail.

- [ ] **Step 5: Commit any focused verification-only corrections**

Only if a test identifies a scoped defect, add its regression test first,
apply the smallest correction, rerun the affected tests, and commit with a
message describing that defect. Do not change webhook or refund behavior.
