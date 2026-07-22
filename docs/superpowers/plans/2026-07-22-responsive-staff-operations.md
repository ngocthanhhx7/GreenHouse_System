# Responsive Staff Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the responsive customer return history and Staff operational screens P19 and P21–P28 to match the approved Stitch hierarchy while preserving all existing frontend contracts and role boundaries.

**Architecture:** Keep React pages as API consumers; do not alter routes, `App.jsx`, layouts, services, backend, or domain transitions. Foundation already imports the owner-scoped `client/src/styles/modules/staff.css` through `operations.css`, so this branch edits only that module and its assigned pages. `SupportQueuePage` and `SupportDetailPage` only consume the unchanged support service owned by Cường.

**Tech Stack:** React 19, React Router, Bootstrap utility classes, Vite, Node test runner, CSS media queries.

---

**Branch:** `feature/nhat-responsive-staff`

**Commit identity:** `Nguyễn Hữu Anh Nhật <nguyenhuuanhnhat2k3@gmail.com>`. Every commit command below sets this identity explicitly.

## Locked scope and contracts

- P19 `/return-refunds` is Customer-only and displays existing request fields: `orderCode`, `status`, `refundAmount`, `reason`, `staffNote`.
- P21 `/staff`, P22 `/staff/orders`, P23 `/staff/orders/:id`, P24 `/staff/orders/:id/invoice`, P25 `/staff/return-refunds`, P26 `/staff/return-refunds/:id`, P27 `/staff/support-requests`, P28 `/staff/support-requests/:id` are Staff-only existing routes.
- Preserve the return flow: `Pending -> AwaitingInspection | Rejected`, Warehouse moves it to `ReadyForRefund`, Staff completes only `ReadyForRefund -> Completed`.
- Preserve the support payload/service exactly: `New/Open -> InProgress -> Resolved`; Nhật must not edit `client/src/services/supportService.js`, its test, or server support files.
- No new mock data, API endpoint, query parameter, sidebar/header, pagination, attachment, priority, SLA, customer-tier, wallet refund, PDF endpoint, or bank/payment details.

## File structure

- Modify: `client/src/styles/modules/staff.css` — replace the Foundation ownership marker with only P19/P21–P28 layout, cards, action groups, print styles, and mobile breakpoints.
- Modify: `client/src/pages/customer/ReturnRefundPage.jsx` — semantic responsive request cards/table wrapper using existing fields.
- Modify: `client/src/pages/staff/StaffDashboardPage.jsx` — P21 visual structure using current aggregated stats and links.
- Modify: `client/src/pages/staff/StaffOrderQueuePage.jsx` — P22 responsive queue rows; status filter remains unchanged.
- Modify: `client/src/pages/staff/StaffOrderDetailPage.jsx` — P23 responsive order/action layout; retain server-provided `allowedNextStatuses`.
- Modify: `client/src/pages/staff/InvoicePrintPage.jsx` — P24 printable invoice presentation; retain `window.print()`.
- Modify: `client/src/pages/staff/ReturnRefundQueuePage.jsx` — P25 responsive queue cards; status filter remains unchanged.
- Modify: `client/src/pages/staff/ReturnRefundDetailPage.jsx` — P26 decision presentation with existing calls only.
- Modify: `client/src/pages/staff/SupportQueuePage.jsx` — P27 support queue presentation using unchanged service.
- Modify: `client/src/pages/staff/SupportDetailPage.jsx` — P28 support response presentation using unchanged service.
- Test: `client/src/pages/staff/staffDashboardStats.test.js` — retain/extend pure stats assertions only.
- Test: `client/src/services/returnRefundService.test.js` and `client/src/services/staffOrderService.test.js` — regression checks that UI relies on existing contract paths.

### Task 1: Add the staff-only responsive styling foundation

**Files:**
- Modify: `client/src/styles/modules/staff.css`

- [ ] **Step 1: Verify the Foundation-owned import boundary exists**

Run:

```powershell
Select-String -Path client/src/styles/operations.css -Pattern "modules/staff.css"
Get-Content client/src/styles/modules/staff.css
```

Expected: `operations.css` imports `./modules/staff.css` and the module contains the Foundation reservation marker. Do not edit `styles.css`, `main.jsx` or `operations.css`.

- [ ] **Step 2: Run the frontend build to verify the missing styles are discoverable**

Run from the repository root: `Set-Location client`, then `npm run build`.

Expected: `✓ built` (the marker is valid CSS; this establishes the import path before component changes).

- [ ] **Step 3: Implement the minimal shared styling primitives**

Replace the marker with:

```css
/* P19, P21-P28: role-scoped staff operations */
.staff-ops-page { display: grid; gap: 24px; }
.staff-ops-header { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; }
.staff-ops-header h1, .staff-ops-card h2 { color: var(--gh-forest-deep); }
.staff-ops-card { background: var(--gh-paper); border: 1px solid var(--gh-border); border-radius: var(--gh-radius-card); box-shadow: var(--gh-shadow); padding: 20px; }
.staff-ops-list { display: grid; gap: 12px; }
.staff-ops-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--gh-border); }
.staff-ops-row:last-child { border-bottom: 0; }
.staff-ops-meta { color: var(--gh-muted); font-size: .875rem; }
.staff-ops-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.staff-invoice { max-width: 860px; margin: 0 auto; }
@media (max-width: 767px) {
  .staff-ops-page { gap: 16px; }
  .staff-ops-header { align-items: stretch; flex-direction: column; }
  .staff-ops-header .status-select { width: 100%; }
  .staff-ops-card { border-radius: 12px; padding: 16px; }
  .staff-ops-row { grid-template-columns: 1fr; }
  .staff-ops-actions > * { flex: 1 1 140px; }
  .staff-table-desktop { display: none; }
}
@media (min-width: 768px) { .staff-card-mobile { display: none; } }
@media print {
  .staff-print-hidden { display: none !important; }
  .staff-invoice { box-shadow: none; border: 0; max-width: none; }
}
```

- [ ] **Step 4: Run build and CSS regression tests**

Run from the repository root: `Set-Location client`, then `npm run build`, then `npm test -- src/styles.test.js`.

Expected: build exits `0`; test output contains `pass` and no stylesheet import error.

- [ ] **Step 5: Commit the foundation**

```bash
git add client/src/styles/modules/staff.css
git -c user.name="Nguyễn Hữu Anh Nhật" -c user.email="nguyenhuuanhnhat2k3@gmail.com" commit -m "style(staff): add responsive operations foundation"
```

### Task 2: Redesign P21–P24 without changing staff-order behavior

**Files:**
- Modify: `client/src/pages/staff/StaffDashboardPage.jsx`
- Modify: `client/src/pages/staff/StaffOrderQueuePage.jsx`
- Modify: `client/src/pages/staff/StaffOrderDetailPage.jsx`
- Modify: `client/src/pages/staff/InvoicePrintPage.jsx`
- Test: `client/src/pages/staff/staffDashboardStats.test.js`
- Test: `client/src/services/staffOrderService.test.js`

- [ ] **Step 1: Add a regression test for dashboard totals and service endpoint usage**

Append this focused assertion to `client/src/pages/staff/staffDashboardStats.test.js`:

```js
it('does not turn a zero total into an unavailable metric', () => {
  const stats = toStaffDashboardStats({
    orders: { items: [], total: 0 }, returns: { items: [], total: 0 },
    newSupport: { items: [], total: 0 }, openSupport: { items: [], total: 0 }, inProgressSupport: { items: [], total: 0 },
  });
  assert.deepEqual(stats, { pendingOrders: 0, pendingReturns: 0, openSupport: 0 });
});
```

- [ ] **Step 2: Run the test before changing markup**

Run from the repository root: `Set-Location client`, then `node --test src/pages/staff/staffDashboardStats.test.js src/services/staffOrderService.test.js`.

Expected: all assertions pass; no endpoint or data-shape change is needed for the redesign.

- [ ] **Step 3: Wrap each page in the scoped presentation structure**

Use this exact pattern in `StaffDashboardPage.jsx`; keep the existing stats and `Link` targets unchanged:

```jsx
<div className="staff-ops-page">
  <header className="staff-ops-header"><div><span className="eyebrow">Vận hành nội bộ</span><h1>Tổng quan xử lý đơn</h1></div></header>
  <section className="metrics-grid" aria-label="Chỉ số công việc">{/* existing three StatBox components */}</section>
  <section className="staff-ops-card"><div className="staff-ops-actions">{/* existing three Links */}</div></section>
</div>
```

Apply the same class names to P22/P23. Preserve these action calls verbatim:

```jsx
staffOrderService.confirmOrder(order.id)
staffOrderService.requestStockExport(order.id)
staffOrderService.markCodCollected(order.id, { note: 'Nhân viên xác nhận đã thu COD.' })
staffOrderService.updateStatus(order.id, nextStatus)
staffOrderService.cancelOrder(order.id, { cancelReason })
```

For P24, replace only the outer container with:

```jsx
<div className="surface invoice-view staff-invoice">
  <div className="page-heading staff-print-hidden">{/* existing heading and print button */}</div>
  {/* existing invoice recipient, table, total and back Link */}
</div>
```

Do not add address branding, bank account numbers, QR payment, PDF download, shipment weight, promotion fields, or route links absent from the current invoice response.

- [ ] **Step 4: Run targeted UI/service tests and build**

Run from the repository root: `Set-Location client`, then `node --test src/pages/staff/staffDashboardStats.test.js src/services/staffOrderService.test.js`, then `npm run build`.

Expected: all tests pass and Vite reports `✓ built`.

- [ ] **Step 5: Commit P21–P24**

```bash
git add client/src/pages/staff/StaffDashboardPage.jsx client/src/pages/staff/StaffOrderQueuePage.jsx client/src/pages/staff/StaffOrderDetailPage.jsx client/src/pages/staff/InvoicePrintPage.jsx client/src/pages/staff/staffDashboardStats.test.js
git -c user.name="Nguyễn Hữu Anh Nhật" -c user.email="nguyenhuuanhnhat2k3@gmail.com" commit -m "style(staff): redesign dashboard order queue and invoice"
```

### Task 3: Redesign P19, P25, and P26 while preserving the return/refund state hand-off

**Files:**
- Modify: `client/src/pages/customer/ReturnRefundPage.jsx`
- Modify: `client/src/pages/staff/ReturnRefundQueuePage.jsx`
- Modify: `client/src/pages/staff/ReturnRefundDetailPage.jsx`
- Test: `client/src/services/returnRefundService.test.js`

- [ ] **Step 1: Add a contract regression test for the two distinct operations**

Add to `client/src/services/returnRefundService.test.js`:

```js
it('keeps approval and completion as separate staff actions', async () => {
  const calls = [];
  const service = createReturnRefundService({ baseUrl: 'http://api.test/api', fetcher: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ success: true, data: {} }) };
  }});
  await service.decideRequest('refund-1', { status: 'Approved', refundAmount: 10, staffNote: 'Kiểm tra đủ điều kiện' });
  await service.completeRefund('refund-1', { note: 'Đối soát xong' });
  assert.equal(calls[0].url, 'http://api.test/api/staff/return-refunds/refund-1/status');
  assert.equal(calls[1].url, 'http://api.test/api/staff/return-refunds/refund-1/complete-refund');
});
```

- [ ] **Step 2: Run it to verify the unchanged contract**

Run from the repository root: `Set-Location client`, then `node --test src/services/returnRefundService.test.js`.

Expected: PASS; the work is presentation-only.

- [ ] **Step 3: Implement responsive card/table presentation with existing values**

For P19 and P25, retain the existing table for desktop and add a mobile sibling from the same `items` map:

```jsx
<div className="staff-card-mobile staff-ops-list">
  {items.map((item) => (
    <article className="staff-ops-card" key={item.id}>
      <strong>{item.orderCode}</strong>
      <div className="staff-ops-meta">{translateRequestStatus(item.status)} · {formatCurrency(item.refundAmount)}</div>
      <p>{item.reason}</p>
      <Link className="btn btn-outline-success btn-sm" to={`/staff/return-refunds/${item.id}`}>Mở yêu cầu</Link>
    </article>
  ))}
</div>
```

For `ReturnRefundPage.jsx`, do not render the Staff link; show `staffNote || '-'` from the current customer payload.

For P26, keep the current conditional branches exactly:

```jsx
request.status === 'Pending'
request.status === 'AwaitingInspection'
request.status === 'ReadyForRefund'
```

and keep the existing `decideRequest`/`completeRefund` handlers. Do not introduce an automatic wallet refund, an approval-to-completion shortcut, evidence upload, audit timeline, or mock values.

- [ ] **Step 4: Run targeted tests and build**

Run from the repository root: `Set-Location client`, then `node --test src/services/returnRefundService.test.js`, then `npm run build`.

Expected: PASS and `✓ built`.

- [ ] **Step 5: Commit P19/P25/P26**

```bash
git add client/src/pages/customer/ReturnRefundPage.jsx client/src/pages/staff/ReturnRefundQueuePage.jsx client/src/pages/staff/ReturnRefundDetailPage.jsx client/src/services/returnRefundService.test.js
git -c user.name="Nguyễn Hữu Anh Nhật" -c user.email="nguyenhuuanhnhat2k3@gmail.com" commit -m "style(returns): redesign customer and staff return screens"
```

### Task 4: Redesign Staff support consumers P27/P28 without touching Cường-owned support contracts

**Files:**
- Modify: `client/src/pages/staff/SupportQueuePage.jsx`
- Modify: `client/src/pages/staff/SupportDetailPage.jsx`
- Test: `client/src/services/supportService.test.js` (read/run only; do not edit)

- [ ] **Step 1: Run the contract test before UI work**

Run from the repository root: `Set-Location client`, then `node --test src/services/supportService.test.js`.

Expected: PASS, including serialized `New`, `Open`, and `InProgress` queue statuses.

- [ ] **Step 2: Implement presentation-only responsive support rows**

Keep the unchanged query and status set:

```jsx
const STATUS_OPTIONS = ['', 'New', 'Open', 'InProgress', 'Resolved'];
const result = await supportService.listStaffRequests({ status: nextStatus });
```

Add a mobile rendering sibling in `SupportQueuePage.jsx` that uses only existing values:

```jsx
<div className="staff-card-mobile staff-ops-list">
  {items.map((item) => (
    <article className="staff-ops-card" key={item.id}>
      <strong>{item.subject}</strong>
      <div className="staff-ops-meta">{item.orderCode || '-'} · {translateRequestStatus(item.status)}</div>
      <Link className="btn btn-outline-success btn-sm" to={`/staff/support-requests/${item.id}`}>Mở yêu cầu</Link>
    </article>
  ))}
</div>
```

In `SupportDetailPage.jsx`, preserve `supportService.respondToRequest(id, form)` and render the existing `subject`, `orderCode`, `content`, `response`, and status selector. Do not add priority, SLA, assignee, attachment, customer tier, print ticket, delivery tracking, or new status values.

- [ ] **Step 3: Run consumer regression test and build**

Run from the repository root: `Set-Location client`, then `node --test src/services/supportService.test.js`, then `npm run build`.

Expected: PASS and `✓ built`; `git diff -- client/src/services/supportService.js client/src/services/supportService.test.js` is empty.

- [ ] **Step 4: Commit P27/P28**

```bash
git add client/src/pages/staff/SupportQueuePage.jsx client/src/pages/staff/SupportDetailPage.jsx client/src/styles/modules/staff.css
git -c user.name="Nguyễn Hữu Anh Nhật" -c user.email="nguyenhuuanhnhat2k3@gmail.com" commit -m "style(staff): redesign support queue and detail"
```

### Task 5: Verify the Staff frontend-only boundary

**Files:**
- Test: all files changed above

- [ ] **Step 1: Verify prohibited files remain untouched**

Run: `git diff --name-only HEAD~4..HEAD`

Expected: only `client/src/pages/customer/ReturnRefundPage.jsx`, `client/src/pages/staff/*`, `client/src/styles/modules/staff.css`, and permitted frontend tests. It must not list `App.jsx`, layout files, service implementations, server files, `styles.css`, `main.jsx`, `operations.css` or shared-shell changes.

- [ ] **Step 2: Run the full frontend verification**

Run from the repository root: `Set-Location client`, then `npm test`, then `npm run build`.

Expected: Node test runner reports no failures; Vite exits `0` with `✓ built`.

- [ ] **Step 3: Commit verification-only corrections if needed**

```bash
git add client/src/pages/customer/ReturnRefundPage.jsx client/src/pages/staff client/src/styles/modules/staff.css
git -c user.name="Nguyễn Hữu Anh Nhật" -c user.email="nguyenhuuanhnhat2k3@gmail.com" commit -m "test(staff-ui): verify responsive operations redesign"
```

Only create this commit if Task 5 required a corrective source change.
