# Responsive Customer Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement responsive P13–P18 customer purchase interfaces without changing cart, address-book, order, payment, return/refund, API, RBAC or idempotency behavior.

**Architecture:** Foundation merges first and owns shared shell, token/import setup and global styles. Huy changes only P13–P18 pages and `modules/customer-purchase.css`; existing service wrappers and formatter outputs remain the only data/action source. Stitch changes visual hierarchy only.

**Tech Stack:** React 19, React Router, Bootstrap utilities, Vite, Node built-in test runner, existing REST wrappers.

---

## Scope, branch and file map

- Owner/identity: Nguyễn Quang Huy `<quanghuyn267@gmail.com>`.
- Branch: `feature/huy-responsive-customer`, created from Foundation-merged `main`; never use `codex/`.
- Do not modify `client/src/main.jsx`, `client/src/styles.css`, shared Header/Footer/CustomerLayout, `client/src/App.jsx`, backend files, profile/address service behavior, or another owner's page.
- Foundation must already import `client/src/styles/modules/customer-purchase.css` after shared layers. If absent, ask Thành; do not edit shared CSS import files.
- Replace the Foundation marker in `client/src/styles/modules/customer-purchase.css`; only `.cart-page`, `.checkout-page`, `.order-history-page`, `.order-detail-page`, `.payment-page`, `.payment-result-page` selectors. Foundation owns the import.
- Modify P13 `client/src/pages/customer/CartPage.jsx`; P14 `CheckoutPage.jsx`; P15 `OrderHistoryPage.jsx`; P16 `OrderDetailPage.jsx`; P17 `PaymentPage.jsx`; P18 `PaymentResultPage.jsx`.
- Create tests: `CartPage.test.js`, `OrderHistoryPage.test.js`, `OrderDetailPage.test.js`, `PaymentPage.test.js`, `PaymentResultPage.test.js` in `client/src/pages/customer/`; modify `CheckoutPage.test.js`.
- Consume only `cartService.js`, `orderService.js`, `paymentService.js`, `profileService.js`, `returnRefundService.js`, and existing formatters; do not change endpoint/payload code.
- Do not add real payment provider picker/QR, payment retry endpoint, electronic invoice/reorder, coupon/voucher logic, e-wallet refund, static delivery amounts, bottom navigation, chat, or fake order/payment data.

### Task 1: Write and lock P13 Cart behavior tests

**Files:**
- Create: `client/src/pages/customer/CartPage.test.js`
- Modify: `client/src/pages/customer/CartPage.jsx`

- [ ] **Step 1: Write the failing Cart source-contract test.**

    assert.match(source, /cartService\.getCart\(\)/);
    assert.match(source, /cartService\.updateItem\(item\.id, \{ quantity: Number\(quantity\) \}\)/);
    assert.match(source, /cartService\.removeItem\(item\.id\)/);
    assert.match(source, /Giỏ hàng đang trống/);
    assert.match(source, /to="\/checkout"/);

- [ ] **Step 2: Run the focused test and verify it is red.**

    npm test -- src/pages/customer/CartPage.test.js src/services/cartService.test.js

Expected: FAIL because `CartPage.test.js` does not exist.

- [ ] **Step 3: Add P13 structural classes without changing cart calls.**

Change the root opening tag to `<div className="surface cart-page customer-purchase-page">`. Change the existing page-heading wrapper from `div` to `<header className="page-heading cart-page-heading">` and change only its matching closing tag to `</header>`. Add `role="alert"` to the existing error element. Keep the empty-state branch and the existing `div.cart-layout` contents unchanged.

- [ ] **Step 4: Run green tests and commit.**

    npm test -- src/pages/customer/CartPage.test.js src/services/cartService.test.js
    git add client/src/pages/customer/CartPage.jsx client/src/pages/customer/CartPage.test.js
    git -c user.name="Nguyễn Quang Huy" -c user.email="quanghuyn267@gmail.com" commit -m "test: cover responsive cart contract"

Expected: tests PASS and commit succeeds.

### Task 2: Lock P14 Checkout address and idempotency contract

**Files:**
- Modify: `client/src/pages/customer/CheckoutPage.test.js`
- Modify: `client/src/pages/customer/CheckoutPage.jsx`
- Test: `client/src/services/orderService.test.js`

- [ ] **Step 1: Add the failing checkout presentation assertion while retaining the existing contract assertions.**

    assert.match(source, /className="checkout-page-v2 surface checkout-page customer-purchase-page"/);
    assert.match(source, /checkoutIdempotencyKey/);
    assert.match(source, /profileService\.listAddresses/);
    assert.match(source, /profileService\.createAddress/);
    assert.match(source, /orderService\.placeOrder/);

- [ ] **Step 2: Run focused tests.**

    npm test -- src/pages/customer/CheckoutPage.test.js src/services/orderService.test.js src/services/profileService.test.js

Expected: FAIL only for the new root-class assertion.

- [ ] **Step 3: Add layout classes and preserve the immutable snapshot/idempotency call.**

Change only the existing root opening tag from `<div className="checkout-page-v2">` to `<div className="checkout-page-v2 surface checkout-page customer-purchase-page">`. Keep the existing `header.checkout-heading`, checkout steps, error alert, and `<form className="checkout-grid checkout-form-v2" onSubmit={handleSubmit}>` structure unchanged.

    const order = await orderService.placeOrder(payload, { idempotencyKey: checkoutIdempotencyKey });

- [ ] **Step 4: Run green tests and commit P14.**

    npm test -- src/pages/customer/CheckoutPage.test.js src/services/orderService.test.js src/services/profileService.test.js
    git add client/src/pages/customer/CheckoutPage.jsx client/src/pages/customer/CheckoutPage.test.js
    git -c user.name="Nguyễn Quang Huy" -c user.email="quanghuyn267@gmail.com" commit -m "feat: prepare responsive checkout structure"

Expected: PASS and commit succeeds.

### Task 3: Implement P13/P14 scoped responsive CSS

**Files:**
- Modify: `client/src/styles/modules/customer-purchase.css` (replace the Foundation marker; Foundation owns the import)
- Modify: `client/src/pages/customer/CartPage.jsx`
- Modify: `client/src/pages/customer/CheckoutPage.jsx`

- [ ] **Step 1: Add only customer-purchase scoped CSS.**

    .customer-purchase-page { margin: 0 auto; max-width: var(--gh-container); }
    .cart-page .cart-layout, .checkout-page .checkout-grid { align-items: start; display: grid; gap: 24px; }
    @media (max-width: 768px) { .customer-purchase-page { padding-inline: 16px; } .cart-page .cart-layout, .checkout-page .checkout-grid { grid-template-columns: 1fr; } .cart-page .summary-box { position: static; } }

- [ ] **Step 2: Add data labels for mobile cards while retaining the exact item data/actions.**

    <td data-label="Sản phẩm">{item.productName}</td>
    <td data-label="Số lượng"><input className="form-control quantity-input" type="number" min="1" value={item.quantity} onChange={(event) => updateQuantity(item, event.target.value)} /></td>
    <td data-label="Tạm tính">{formatCurrency(item.subtotal)}</td>

- [ ] **Step 3: Verify and commit P13/P14 UI.**

    npm test -- src/pages/customer/CartPage.test.js src/pages/customer/CheckoutPage.test.js src/services/cartService.test.js src/services/orderService.test.js src/services/profileService.test.js
    npm run build
    git add client/src/styles/modules/customer-purchase.css client/src/pages/customer/CartPage.jsx client/src/pages/customer/CheckoutPage.jsx
    git -c user.name="Nguyễn Quang Huy" -c user.email="quanghuyn267@gmail.com" commit -m "feat: refresh responsive cart checkout UI"

Expected: PASS, build exits `0`, commit succeeds.

### Task 4: Write and implement P15/P16 history/detail state presentation

**Files:**
- Create: `client/src/pages/customer/OrderHistoryPage.test.js`
- Create: `client/src/pages/customer/OrderDetailPage.test.js`
- Modify: `client/src/pages/customer/OrderHistoryPage.jsx`
- Modify: `client/src/pages/customer/OrderDetailPage.jsx`
- Modify: `client/src/styles/modules/customer-purchase.css`

- [ ] **Step 1: Write failing tests for current state-machine behavior.**

    // OrderHistoryPage.test.js
    assert.match(historySource, /orderService\.listMyOrders\(\)/);
    assert.match(historySource, /to=\{`\/orders\/\$\{order\.id\}`\}/);
    assert.match(historySource, /translateOrderStatus/);

    // OrderDetailPage.test.js
    assert.match(detailSource, /orderService\.cancelOrder\(id\)/);
    assert.match(detailSource, /\['Pending', 'WaitingForPayment'\]\.includes\(order\.orderStatus\)/);
    assert.match(detailSource, /order\.orderStatus === 'Delivered'/);
    assert.match(detailSource, /returnRefundService\.createCustomerRequest\(id, \{ reason: returnReason \}\)/);
    assert.match(detailSource, /to=\{`\/orders\/\$\{order\.id\}\/payment`\}/);

- [ ] **Step 2: Run red test baseline.**

    npm test -- src/pages/customer/OrderHistoryPage.test.js src/pages/customer/OrderDetailPage.test.js src/services/orderService.test.js src/services/returnRefundService.test.js

Expected: FAIL because both new test files are absent.

- [ ] **Step 3: Add responsive roots/list classes without invoice, reorder, voucher, delivery or wallet behavior.**

Change only the root opening tag of `OrderHistoryPage.jsx` from `<div className="surface">` to `<div className="surface order-history-page customer-purchase-page">`. Change only the root opening tag of `OrderDetailPage.jsx` from `<div className="surface">` to `<div className="surface order-detail-page customer-purchase-page">`. Preserve the existing `div.order-status-timeline`, `ul.order-item-list`, status predicates, links, and service calls.

    @media (max-width: 768px) { .order-history-page .table thead { clip: rect(0 0 0 0); position: absolute; } .order-history-page .table tr { display: grid; gap: 8px; margin-bottom: 12px; padding: 16px; } .order-detail-page .order-status-timeline { overflow-x: auto; } }

- [ ] **Step 4: Run green tests and commit P15/P16.**

    npm test -- src/pages/customer/OrderHistoryPage.test.js src/pages/customer/OrderDetailPage.test.js src/services/orderService.test.js src/services/returnRefundService.test.js
    git add client/src/pages/customer/OrderHistoryPage.jsx client/src/pages/customer/OrderDetailPage.jsx client/src/pages/customer/OrderHistoryPage.test.js client/src/pages/customer/OrderDetailPage.test.js client/src/styles/modules/customer-purchase.css
    git -c user.name="Nguyễn Quang Huy" -c user.email="quanghuyn267@gmail.com" commit -m "feat: refresh responsive customer order UI"

Expected: PASS and commit succeeds.

### Task 5: Write and implement P17/P18 mock payment presentation

**Files:**
- Create: `client/src/pages/customer/PaymentPage.test.js`
- Create: `client/src/pages/customer/PaymentResultPage.test.js`
- Modify: `client/src/pages/customer/PaymentPage.jsx`
- Modify: `client/src/pages/customer/PaymentResultPage.jsx`
- Modify: `client/src/styles/modules/customer-purchase.css`

- [ ] **Step 1: Write failing tests that lock the existing mock-only payment contract.**

    // PaymentPage.test.js
    assert.match(paymentSource, /paymentService\.createOnlinePayment\(id\)/);
    assert.match(paymentSource, /submitStatus\('Paid'\)/);
    assert.match(paymentSource, /submitStatus\('Failed'\)/);
    assert.doesNotMatch(paymentSource, /VietQR|ZaloPay|MoMo|Visa/);

    // PaymentResultPage.test.js
    assert.match(resultSource, /params\.get\('status'\) \|\| 'Unknown'/);
    assert.match(resultSource, /status === 'Paid'/);
    assert.match(resultSource, /to=\{`\/orders\/\$\{id\}`\}/);

- [ ] **Step 2: Run the red baseline.**

    npm test -- src/pages/customer/PaymentPage.test.js src/pages/customer/PaymentResultPage.test.js src/services/paymentService.test.js

Expected: FAIL because the new files are absent.

- [ ] **Step 3: Add visual roots and retain the exact existing callbacks.**

    <div className="surface payment-page customer-purchase-page">
      <h1>Thanh toán online</h1>
      {payment && <p>Tổng thanh toán: <strong>{formatCurrency(payment.amount)}</strong></p>}
      <button className="btn btn-success" type="button" onClick={() => submitStatus('Paid')}>Mô phỏng thanh toán thành công</button>
      <button className="btn btn-outline-danger" type="button" onClick={() => submitStatus('Failed')}>Mô phỏng thanh toán thất bại</button>
    </div>

    .payment-page, .payment-result-page { max-width: 760px; padding: 48px; }
    .payment-result-page .alert { display: grid; gap: 8px; }
    @media (max-width: 768px) { .payment-page, .payment-result-page { margin-inline: 16px; padding: 24px 20px; } }

- [ ] **Step 4: Run green tests/build and commit P17/P18.**

    npm test -- src/pages/customer/PaymentPage.test.js src/pages/customer/PaymentResultPage.test.js src/services/paymentService.test.js
    npm run build
    git add client/src/pages/customer/PaymentPage.jsx client/src/pages/customer/PaymentResultPage.jsx client/src/pages/customer/PaymentPage.test.js client/src/pages/customer/PaymentResultPage.test.js client/src/styles/modules/customer-purchase.css
    git -c user.name="Nguyễn Quang Huy" -c user.email="quanghuyn267@gmail.com" commit -m "feat: refresh responsive payment result UI"

Expected: PASS, build exits `0`, commit succeeds.

### Task 6: Full verification and handoff

- [ ] **Step 1: Run final verification.**

    npm test
    npm run build
    git diff main...HEAD --check
    git status --short

Expected: all tests PASS, build exits `0`, no whitespace output, and no unrelated/untracked files are staged.

- [ ] **Step 2: QA `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/orders/:id/payment`, and `/payments/result/:id?status=Paid` at 390/768/1024/1440.** Also check `status=Failed`, empty cart, checkout error, pending online order, cancellable unpaid order, and Delivered return form. Totals, addresses, status and payment values must come from API responses.

- [ ] **Step 3: Hand off.**

    git log --format=fuller main..HEAD
    git diff --stat main...HEAD

Expected: each commit is `Nguyễn Quang Huy <quanghuyn267@gmail.com>`. Nguyễn Ngọc Thành reviews, merges `--no-ff`, runs regression, pushes `main`, and deletes `feature/huy-responsive-customer`.
