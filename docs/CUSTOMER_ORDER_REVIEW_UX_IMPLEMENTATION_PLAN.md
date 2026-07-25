# Customer Order and Review UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a GreenHome-styled Customer order center, a separate per-product review center for delivered purchases, public-only reviews on Product Detail, and avatar navigation to both flows.

**Architecture:** Keep the existing Order and Review backend contracts authoritative. Add small client projection helpers that hydrate owned OrderDetail snapshots and derive filter/review queues, then render focused Order and Review pages with isolated CSS modules. Split commits by Nguyễn Quang Huy (Order), Lê Vũ Cường (Review), and Nguyễn Ngọc Thành (Header/integration).

**Tech Stack:** React 18, React Router, native `node:test`, Vite, existing REST services, CSS design tokens.

---

## File Structure

### Nguyễn Quang Huy — Order center

- Create `client/src/pages/customer/orderHistoryView.js`: pure status-tab, action and presentation projection.
- Create `client/src/pages/customer/orderHistoryView.test.js`: behavior tests for tab mapping, filtering and action eligibility.
- Create `client/src/pages/customer/OrderHistoryPage.test.js`: source contract for loading/error/empty/card rendering.
- Create `client/src/styles/modules/customer-orders.css`: responsive GreenHome order-card styles.
- Modify `client/src/pages/customer/OrderHistoryPage.jsx`: hydrate order details and render tabs/cards/actions.
- Modify `client/src/services/orderService.js`: add bounded owned-order detail hydration.
- Modify `client/src/services/orderService.test.js`: verify list/detail hydration contract.
- Modify `docs/member-plans/03_NGUYEN_QUANG_HUY_PLAN.md`: record acceptance and verification evidence.

### Lê Vũ Cường — Review center

- Create `client/src/pages/customer/reviewWorkspace.js`: pure projection of delivered OrderDetails against existing Review identities.
- Create `client/src/pages/customer/reviewWorkspace.test.js`: tests for per-line eligibility, deduplication and fallback display.
- Create `client/src/pages/customer/ReviewManagementPage.test.js`: source contract for tabs, mutations and field errors.
- Create `client/src/styles/modules/customer-reviews.css`: responsive review cards and accessible stars.
- Modify `client/src/pages/customer/ReviewManagementPage.jsx`: render pending/completed tabs and own all Review mutations.
- Modify `client/src/components/review/ProductReviewPanel.jsx`: public list only.
- Modify `client/src/pages/public/ProductDetailPage.test.js`: prove no Customer Review form is mounted.
- Modify `client/src/acceptance/sl008UiContract.test.js`: move Customer mutation expectations from Product Detail to `/reviews`.
- Modify `docs/member-plans/05_LE_VU_CUONG_PLAN.md`: record acceptance and verification evidence.
- Modify `docs/reviews/SL-008_G3_TRACEABILITY.md`, `docs/reviews/SL-008_HANDOFF.md`, and `docs/reviews/SL-008_RELEASE_AUDIT.md`: record the UX relocation and actual evidence.

### Nguyễn Ngọc Thành — Header and integration

- Modify `client/src/components/layout/Header.jsx`: add Customer-only order and review links.
- Modify `client/src/components/layout/Header.test.js`: require both desktop/mobile link sources and deny them to other roles.
- Modify `docs/member-plans/01_NGUYEN_NGOC_THANH_PLAN.md`: record integration ownership/evidence.
- Modify `docs/FINAL_DEMO_READINESS_PLAN.md`: update Customer demo path.

## Task 1: Nguyễn Quang Huy Order Projection

**Files:**
- Create: `client/src/pages/customer/orderHistoryView.test.js`
- Create: `client/src/pages/customer/orderHistoryView.js`

- [ ] **Step 1: Write the failing order-tab and action tests**

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ORDER_TABS,
  filterOrdersByTab,
  getOrderActions,
  orderTabFor,
} from './orderHistoryView.js';

describe('customer order history projection', () => {
  it('maps backend states into the seven approved tabs', () => {
    assert.deepEqual(ORDER_TABS.map((tab) => tab.id), [
      'all', 'payment', 'pending', 'processing', 'shipping', 'completed', 'cancelled',
    ]);
    assert.equal(orderTabFor({ orderStatus: 'Pending', paymentStatus: 'Pending' }), 'payment');
    assert.equal(orderTabFor({ orderStatus: 'Pending', paymentStatus: 'Unpaid', paymentMethod: 'COD' }), 'pending');
    assert.equal(orderTabFor({ orderStatus: 'Confirmed' }), 'processing');
    assert.equal(orderTabFor({ orderStatus: 'Packed' }), 'processing');
    assert.equal(orderTabFor({ orderStatus: 'Shipped' }), 'shipping');
    assert.equal(orderTabFor({ orderStatus: 'Delivered' }), 'completed');
    assert.equal(orderTabFor({ orderStatus: 'Cancelled' }), 'cancelled');
  });

  it('filters without inventing backend states', () => {
    const orders = [
      { id: 'a', orderStatus: 'Shipped' },
      { id: 'b', orderStatus: 'Delivered' },
    ];
    assert.deepEqual(filterOrdersByTab(orders, 'shipping').map((order) => order.id), ['a']);
    assert.deepEqual(filterOrdersByTab(orders, 'all').map((order) => order.id), ['a', 'b']);
  });

  it('shows only actions allowed by current order facts', () => {
    const payment = getOrderActions({
      id: 'a',
      orderStatus: 'Pending',
      paymentStatus: 'Pending',
      paymentMethod: 'ONLINE',
      paymentDeadlineAt: '2099-01-01T00:00:00.000Z',
    }, new Date('2026-07-25T00:00:00.000Z'));
    assert.equal(payment.canPay, true);
    assert.equal(payment.canCancel, true);
    assert.equal(payment.canReview, false);
    assert.equal(getOrderActions({ id: 'b', orderStatus: 'Delivered' }).canReview, true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/pages/customer/orderHistoryView.test.js
```

Expected: FAIL because `orderHistoryView.js` does not exist.

- [ ] **Step 3: Implement the minimal pure projection**

```js
export const ORDER_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'payment', label: 'Chờ thanh toán' },
  { id: 'pending', label: 'Chờ xác nhận' },
  { id: 'processing', label: 'Đang xử lý' },
  { id: 'shipping', label: 'Đang giao' },
  { id: 'completed', label: 'Hoàn thành' },
  { id: 'cancelled', label: 'Đã hủy' },
];

export function orderTabFor(order = {}) {
  if (order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned') return 'cancelled';
  if (order.orderStatus === 'Delivered') return 'completed';
  if (order.orderStatus === 'Shipped') return 'shipping';
  if (['Confirmed', 'Packed'].includes(order.orderStatus)) return 'processing';
  if (
    order.orderStatus === 'Pending'
    && order.paymentMethod === 'ONLINE'
    && ['Pending', 'Failed', 'Unpaid'].includes(order.paymentStatus)
  ) return 'payment';
  return 'pending';
}

export function filterOrdersByTab(orders = [], tab = 'all') {
  return tab === 'all' ? orders : orders.filter((order) => orderTabFor(order) === tab);
}

export function getOrderActions(order = {}, now = new Date()) {
  const beforeDeadline = !order.paymentDeadlineAt || now < new Date(order.paymentDeadlineAt);
  return {
    canPay: order.orderStatus === 'Pending'
      && order.paymentMethod === 'ONLINE'
      && order.paymentStatus !== 'Paid'
      && beforeDeadline,
    canCancel: order.orderStatus === 'Pending'
      && ['Unpaid', 'Pending', 'Failed'].includes(order.paymentStatus),
    canReview: order.orderStatus === 'Delivered',
  };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node --test src/pages/customer/orderHistoryView.test.js
```

Expected: 3 tests pass, 0 fail.

## Task 2: Nguyễn Quang Huy Order Detail Hydration and Page

**Files:**
- Modify: `client/src/services/orderService.js`
- Modify: `client/src/services/orderService.test.js`
- Create: `client/src/pages/customer/OrderHistoryPage.test.js`
- Modify: `client/src/pages/customer/OrderHistoryPage.jsx`
- Create: `client/src/styles/modules/customer-orders.css`

- [ ] **Step 1: Add failing service and page contracts**

Add a service test that injects `apiRequester`, returns two summary orders, and
asserts `listMyOrdersWithDetails()` calls `/orders/my`, `/orders/order-1`, and
`/orders/order-2` exactly once. Add a page source test requiring:

```js
assert.match(source, /ORDER_TABS/);
assert.match(source, /filterOrdersByTab/);
assert.match(source, /order-card/);
assert.match(source, /Đơn hàng của tôi/);
assert.match(source, /Đang tải đơn hàng/);
assert.match(source, /Không thể tải đơn hàng của bạn/);
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
node --test src/services/orderService.test.js src/pages/customer/OrderHistoryPage.test.js
```

Expected: FAIL for the missing hydration method and card UI.

- [ ] **Step 3: Implement bounded hydration**

Extend the service factory signature to accept `apiRequester = apiRequest` and
add:

```js
async listMyOrdersWithDetails() {
  const payload = await apiRequester('/orders/my');
  const orders = Array.isArray(payload) ? payload : payload?.items || payload?.orders || [];
  return Promise.all(orders.map(async (order) => {
    if (Array.isArray(order.details) && order.details.length) return order;
    try {
      return await apiRequester(`/orders/${encodeURIComponent(String(order.id || order._id))}`);
    } catch (error) {
      return { ...order, details: [], detailLoadError: error.message };
    }
  }));
}
```

The per-order fallback preserves other valid orders but exposes no foreign data
because both endpoints remain Customer-owned server boundaries.

- [ ] **Step 4: Implement the card page**

Use `listMyOrdersWithDetails()`, `ORDER_TABS`, `filterOrdersByTab()` and
`getOrderActions()`. Render:

- one tab button per approved status group with count;
- order header with `orderCode`, `createdAt`, translated state;
- each `detail` with `productImageSnapshot`, `productNameSnapshot`,
  `skuSnapshot`, `quantity`, and `priceSnapshot`;
- links to `/orders/:id`, `/orders/:id/payment`, `/reviews?orderId=:id`, and
  `/products` only when their predicates allow;
- loading, error and per-tab empty states.

Import `../../styles/modules/customer-orders.css` from the page. The CSS uses
existing variables `--green-*`, `--line`, `--paper`, and `--muted`, switches
product rows to one column below 720px, and keeps focus-visible outlines.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```powershell
node --test src/pages/customer/orderHistoryView.test.js src/pages/customer/OrderHistoryPage.test.js src/services/orderService.test.js
```

Expected: all targeted tests pass.

- [ ] **Step 6: Commit only Huy-owned files**

Run explicit `git add -- <Huy file list>` and:

```powershell
git -c user.name="Nguyễn Quang Huy" -c user.email="quanghuyn267@gmail.com" commit -m "feat(order): add customer order center"
```

## Task 3: Lê Vũ Cường Review Workspace Projection

**Files:**
- Create: `client/src/pages/customer/reviewWorkspace.test.js`
- Create: `client/src/pages/customer/reviewWorkspace.js`

- [ ] **Step 1: Write the failing projection tests**

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReviewWorkspace } from './reviewWorkspace.js';

describe('customer review workspace', () => {
  it('creates one pending item per delivered order line', () => {
    const result = buildReviewWorkspace([
      {
        id: 'order-1',
        orderCode: 'GH-1',
        orderStatus: 'Delivered',
        details: [
          { id: 'line-1', productId: 'p1', productNameSnapshot: 'Dao' },
          { id: 'line-2', productId: 'p2', productNameSnapshot: 'Chảo' },
        ],
      },
    ], []);
    assert.deepEqual(result.pending.map((item) => item.orderDetailId), ['line-1', 'line-2']);
  });

  it('removes an existing Customer+Product identity from pending', () => {
    const result = buildReviewWorkspace([
      {
        id: 'order-1',
        orderStatus: 'Delivered',
        details: [{ id: 'line-1', productId: 'p1', productNameSnapshot: 'Dao' }],
      },
    ], [{ id: 'review-1', productId: 'p1', rating: 5 }]);
    assert.equal(result.pending.length, 0);
    assert.equal(result.completed[0].productName, 'Dao');
  });

  it('ignores non-delivered orders', () => {
    const result = buildReviewWorkspace([
      { id: 'order-1', orderStatus: 'Shipped', details: [{ id: 'line-1', productId: 'p1' }] },
    ], []);
    assert.equal(result.pending.length, 0);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test src/pages/customer/reviewWorkspace.test.js
```

Expected: FAIL because `reviewWorkspace.js` does not exist.

- [ ] **Step 3: Implement the minimal workspace builder**

Implement stable `valueId()` and normalize every delivered detail to:

```js
{
  orderId,
  orderCode,
  deliveredAt,
  orderDetailId,
  productId,
  productName,
  productImage,
  sku,
}
```

Use `Map(productId → latest delivered detail)` for completed Review display.
Return `{ pending, completed }`, with `pending` excluding every product ID found
in own Reviews and `completed` merging each Review with its display evidence.

- [ ] **Step 4: Run and verify GREEN**

Run:

```powershell
node --test src/pages/customer/reviewWorkspace.test.js
```

Expected: 3 tests pass, 0 fail.

## Task 4: Lê Vũ Cường Separate Review Page and Public Product Reviews

**Files:**
- Create: `client/src/pages/customer/ReviewManagementPage.test.js`
- Modify: `client/src/pages/customer/ReviewManagementPage.jsx`
- Create: `client/src/styles/modules/customer-reviews.css`
- Modify: `client/src/components/review/ProductReviewPanel.jsx`
- Modify: `client/src/pages/public/ProductDetailPage.test.js`
- Modify: `client/src/acceptance/sl008UiContract.test.js`

- [ ] **Step 1: Write failing UI contracts**

Require `/reviews` page source to contain:

```js
assert.match(source, /Chờ đánh giá/);
assert.match(source, /Đã đánh giá/);
assert.match(source, /listMyOrdersWithDetails/);
assert.match(source, /createReview/);
assert.match(source, /updateReview/);
assert.match(source, /setPublication/);
assert.match(source, /orderDetailId/);
assert.match(source, /expectedVersion/);
assert.doesNotMatch(source, /Customer publication|Staff moderation|Phiên bản/);
```

Require `ProductReviewPanel.jsx` to render `PublicReviewList` and contain none of
`createReview`, `updateReview`, `setPublication`, `<form`, or `listEligibility`.
Update the existing SL-008 UI contract so mutation and pending-deduplication
expectations target `ReviewManagementPage.jsx`, while Product Detail only proves
public Review rendering.

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```powershell
node --test src/pages/customer/reviewWorkspace.test.js src/pages/customer/ReviewManagementPage.test.js src/pages/public/ProductDetailPage.test.js src/acceptance/sl008UiContract.test.js
```

Expected: FAIL because mutations still live on Product Detail and the Review page
lacks the new workspace.

- [ ] **Step 3: Implement the Review page**

Load in parallel:

```js
const [orders, ownPage] = await Promise.all([
  orderService.listMyOrdersWithDetails(),
  reviewService.listOwn({ page: 1, pageSize: 50 }),
]);
```

Build the workspace and support:

- active `pending`/`completed` tab state;
- URL `orderId` prioritization without trusting it for authorization;
- controlled 1–5 star radio group and 1,000-character textarea per pending item;
- create with `orderDetailId`, `rating`, `content`, `expectedVersion: 0`, and a
  fresh idempotency key;
- update with the Review's current version;
- withdraw/republish with exact publication transition and current version;
- one pending key per Review/item, field-local errors, loading and empty states;
- reload workspace after a successful mutation.

Import `customer-reviews.css`. Use accessible radio labels (`aria-label="5 sao"`),
GreenHome gold only for selected stars, and stack cards/actions on mobile.

- [ ] **Step 4: Reduce ProductReviewPanel to public display**

```jsx
import PublicReviewList from './PublicReviewList.jsx';

export default function ProductReviewPanel({ productId }) {
  return (
    <div className="product-review-panel mt-4">
      <PublicReviewList productId={productId} />
    </div>
  );
}
```

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run the exact targeted command from Step 2.

Expected: all tests pass.

- [ ] **Step 6: Commit only Cường-owned files**

Run explicit `git add -- <Cường file list>` and:

```powershell
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "feat(review): move customer reviews to purchase center"
```

## Task 5: Nguyễn Ngọc Thành Avatar Navigation

**Files:**
- Modify: `client/src/components/layout/Header.test.js`
- Modify: `client/src/components/layout/Header.jsx`

- [ ] **Step 1: Change the existing negative test to failing positive contracts**

```js
assert.equal((header.match(/to: '\/orders'/g) || []).length, 1);
assert.equal((header.match(/to: '\/reviews'/g) || []).length, 1);
assert.match(header, /Đơn hàng của tôi/);
assert.match(header, /Đánh giá của tôi/);
```

Also assert the links occur inside `if (role === 'Customer')` and before
return/refund/support entries.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test src/components/layout/Header.test.js
```

Expected: FAIL because the Customer links do not exist.

- [ ] **Step 3: Add Customer-only links**

Inside the Customer return array, insert:

```js
{ to: '/orders', label: 'Đơn hàng của tôi' },
{ to: '/reviews', label: 'Đánh giá của tôi' },
```

Because both desktop dropdown and mobile drawer render `accountLinks`, one
source change supplies both surfaces without duplicate logic.

- [ ] **Step 4: Run and verify GREEN**

Run:

```powershell
node --test src/components/layout/Header.test.js
```

Expected: all Header tests pass.

- [ ] **Step 5: Commit only Thành-owned Header files**

```powershell
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "feat(header): link customer orders and reviews"
```

## Task 6: Documentation and Integration

**Files:**
- Modify: `docs/member-plans/01_NGUYEN_NGOC_THANH_PLAN.md`
- Modify: `docs/member-plans/03_NGUYEN_QUANG_HUY_PLAN.md`
- Modify: `docs/member-plans/05_LE_VU_CUONG_PLAN.md`
- Modify: `docs/reviews/SL-008_G3_TRACEABILITY.md`
- Modify: `docs/reviews/SL-008_HANDOFF.md`
- Modify: `docs/reviews/SL-008_RELEASE_AUDIT.md`
- Modify: `docs/FINAL_DEMO_READINESS_PLAN.md`

- [ ] **Step 1: Record traceability without estimated counts**

Add dated addenda mapping:

- Order tabs/cards/actions → Huy source and targeted tests.
- Review relocation/per-product queue → Cường source and targeted tests.
- Avatar navigation/final integration → Thành source and Header tests.
- Product page public-only Review → Product Detail and SL-008 UI contracts.

Do not write final pass counts until fresh verification has completed.

- [ ] **Step 2: Run focused verification**

Run:

```powershell
node --test src/pages/customer/orderHistoryView.test.js src/pages/customer/OrderHistoryPage.test.js src/pages/customer/reviewWorkspace.test.js src/pages/customer/ReviewManagementPage.test.js src/pages/public/ProductDetailPage.test.js src/components/layout/Header.test.js src/services/orderService.test.js src/services/reviewService.test.js src/acceptance/sl008UiContract.test.js
```

Expected: all focused client tests pass.

- [ ] **Step 3: Run full gates**

Run:

```powershell
cd server
npm test
cd ..\client
npm test
npm run build
cd ..
git diff --check
git status --short
```

Expected:

- server exit 0 with zero failures;
- client exit 0 with zero failures;
- Vite build exit 0; record the existing large-chunk warning if present;
- `git diff --check` exit 0;
- only reviewed in-scope files appear.

- [ ] **Step 4: Update docs with actual evidence and commit by owner**

Stage each owner's documentation explicitly and amend or create the matching
owner commit. Final integration-only docs use:

```powershell
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "docs: record customer purchase UX evidence"
```

## Task 7: Push, Merge and Remote Verification

- [ ] **Step 1: Review each owner diff against `origin/main`**

Check actor/RBAC, Order state predicates, Review identity/version/idempotency,
responsive states, privacy, and no out-of-scope files.

- [ ] **Step 2: Push each feature branch**

Push `feature/huy-order-center`, `feature/cuong-review-center`, and
`feature/thanh-order-review-ux` without force.

- [ ] **Step 3: Create PRs when `gh` or an installed GitHub connector is available**

If unavailable, record that no web PR was created and continue with authorized
local review plus `--no-ff` merge.

- [ ] **Step 4: Merge owner branches into the integration branch**

Use `--no-ff` with Nguyễn Ngọc Thành identity, rerun focused tests, then merge
the integration branch into a clean `main` worktree with `--no-ff`.

- [ ] **Step 5: Run post-merge verification and push main**

Fetch origin, verify `origin/main` equals the pushed merge commit, and do not
touch the user's dirty local `main`.

- [ ] **Step 6: Delete only proven-integrated feature branches/worktrees**

Delete remote/local feature branches and agent-created worktrees only after
`origin/main` verification. Preserve every pre-existing worktree and all user
local changes.
