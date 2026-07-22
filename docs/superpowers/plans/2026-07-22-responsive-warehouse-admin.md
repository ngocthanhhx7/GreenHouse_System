# Responsive Warehouse and Admin Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign responsive customer support, Warehouse P29–P36, and Admin P37/P41–P42 screens to the approved Stitch visual language without changing existing APIs, role routing, backend logic, or operational contracts.

**Architecture:** All pages remain thin React consumers of their existing services. Foundation already imports the Cường-owned `client/src/styles/modules/warehouse-admin.css` through `operations.css`; this branch edits that module without touching the shared shell or global imports. Cường owns `SupportPage` and the support service contract tests; Nhật owns Staff support page presentation only and consumes the unchanged interface.

**Tech Stack:** React 19, React Router, Bootstrap utility classes, Vite, Node test runner, CSS media queries.

---

**Branch:** `feature/cuong-responsive-warehouse-admin`

**Commit identity:** `Lê Vũ Cường <levucuong0319@gmail.com>`. Every commit command below sets this identity explicitly.

## Locked scope and contracts

- P20 `/support` is Customer-only. Support API fields are `subject`, `content`, optional owned `orderId`, `status`, `response`, `orderCode`.
- P29 `/warehouse`, P30 `/warehouse/inventory`, P31 `/warehouse/low-stock`, P32 `/warehouse/stock-exports`, P33 `/warehouse/stock-exports/:id`, P34 `/warehouse/replenishments`, P35 `/warehouse/return-refunds`, P36 `/warehouse/return-refunds/:id` are WarehouseManager-only.
- P37 `/admin`, P41 `/admin/replenishments`, P42 `/admin/settings` are Admin-only.
- Do not edit `App.jsx`, layouts, sidebar, header, backend, service implementation, API shape, seed data, `styles.css`, `main.jsx`, `operations.css` or shared-shell styles.
- Use API fields only; values from Stitch screenshots are reference visual content, never runtime data.

## File structure

- Modify: `client/src/styles/modules/warehouse-admin.css` — replace the Foundation ownership marker with responsive classes for P20/P29–P37/P41–P42 only.
- Modify: `client/src/pages/customer/SupportPage.jsx` — P20 responsive form/list using the existing service.
- Modify: `client/src/pages/warehouse/{WarehouseDashboardPage,InventoryListPage,StockExportQueuePage,StockExportDetailPage,LowStockPage,ReplenishmentPage,ReturnRefundQueuePage,ReturnRefundInspectionPage}.jsx` — P29–P36 presentation only.
- Modify: `client/src/pages/admin/{AdminDashboardPage,ReplenishmentAdminPage,SystemSettingsPage}.jsx` — P37/P41/P42 presentation only.
- Test: `client/src/services/{supportService,inventoryService,replenishmentService,adminService}.test.js` — existing contract regression tests; edit only to add endpoint serialization assertions.
- Test: `client/src/pages/warehouse/warehouseDashboardStats.test.js`, `client/src/pages/admin/adminDashboardQuery.test.js` — pure display-data regressions.

### Task 1: Establish the Cường-owned responsive CSS module

**Files:**
- Modify: `client/src/styles/modules/warehouse-admin.css`

- [ ] **Step 1: Verify the Foundation-owned import boundary exists**

Run:

```powershell
Select-String -Path client/src/styles/operations.css -Pattern "modules/warehouse-admin.css"
Get-Content client/src/styles/modules/warehouse-admin.css
```

Expected: `operations.css` imports `./modules/warehouse-admin.css` and the module contains the Foundation reservation marker. Do not edit the importer.

- [ ] **Step 2: Run build before CSS implementation**

Run from the repository root: `Set-Location client`, then `npm run build`.

Expected: `✓ built`.

- [ ] **Step 3: Implement the scoped responsive primitives**

Replace the marker with:

```css
/* P20, P29-P37, P41-P42: warehouse/admin operations */
.ops-page { display: grid; gap: 24px; }
.ops-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ops-panel { background: var(--gh-paper); border: 1px solid var(--gh-border); border-radius: var(--gh-radius-card); box-shadow: var(--gh-shadow); padding: 20px; }
.ops-list { display: grid; gap: 12px; }
.ops-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--gh-border); }
.ops-item:last-child { border-bottom: 0; }
.ops-subtle { color: var(--gh-muted); font-size: .875rem; }
.ops-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 767px) {
  .ops-page { gap: 16px; }
  .ops-heading { flex-direction: column; align-items: stretch; }
  .ops-panel { border-radius: 12px; padding: 16px; }
  .ops-item { grid-template-columns: 1fr; }
  .ops-actions > * { flex: 1 1 140px; }
  .ops-table-desktop { display: none; }
}
@media (min-width: 768px) { .ops-card-mobile { display: none; } }
```

- [ ] **Step 4: Run build and style tests**

Run from the repository root: `Set-Location client`, then `npm run build`, then `npm test -- src/styles.test.js`.

Expected: build and test exit `0`.

- [ ] **Step 5: Commit foundation**

```bash
git add client/src/styles/modules/warehouse-admin.css
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "style(operations): add warehouse admin responsive foundation"
```

### Task 2: Implement P20 support and preserve Cường’s service ownership

**Files:**
- Modify: `client/src/pages/customer/SupportPage.jsx`
- Test: `client/src/services/supportService.test.js`

- [ ] **Step 1: Add a service regression for optional owned order linkage**

Add to `client/src/services/supportService.test.js`:

```js
it('keeps an optional orderId in the customer support payload', async () => {
  const service = createSupportService({ baseUrl: 'http://api.test/api', fetcher: async (url, options) => {
    assert.equal(url, 'http://api.test/api/support-requests');
    assert.deepEqual(JSON.parse(options.body), { subject: 'Giao hàng', content: 'Cần hỗ trợ', orderId: 'order-1' });
    return { ok: true, json: async () => ({ success: true, data: { id: 'support-1' } }) };
  }});
  await service.createCustomerRequest({ subject: 'Giao hàng', content: 'Cần hỗ trợ', orderId: 'order-1' });
});
```

- [ ] **Step 2: Run the support contract tests**

Run from the repository root: `Set-Location client`, then `node --test src/services/supportService.test.js`.

Expected: PASS, including `New`, `Open`, and `InProgress` queue serialization tests.

- [ ] **Step 3: Redesign P20 using the existing form and list values**

Wrap the existing content in:

```jsx
<div className="ops-page">
  <header className="ops-heading"><div><span className="eyebrow">Hỗ trợ khách hàng</span><h1>Gửi yêu cầu hỗ trợ</h1></div></header>
  <section className="ops-panel">{/* existing subject/orderId/content form */}</section>
  <section className="ops-panel"><h2>Yêu cầu của tôi</h2>{/* existing table and mobile list */}</section>
</div>
```

The mobile list must only read current API response fields:

```jsx
{items.map((item) => <article className="ops-card-mobile ops-panel" key={item.id}>
  <strong>{item.subject}</strong><div className="ops-subtle">{item.orderCode || '-'} · {translateRequestStatus(item.status)}</div>
  <p>{item.response || '-'}</p>
</article>)}
```

Do not add support category, FAQ, attachment upload, live chat, ticket priority, SLA, or new status values. Do not modify Staff support pages or `supportService.js`.

- [ ] **Step 4: Run tests and build**

Run from the repository root: `Set-Location client`, then `node --test src/services/supportService.test.js`, then `npm run build`.

Expected: PASS and `✓ built`.

- [ ] **Step 5: Commit P20**

```bash
git add client/src/pages/customer/SupportPage.jsx client/src/services/supportService.test.js client/src/styles/modules/warehouse-admin.css
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "style(support): redesign customer support screen"
```

### Task 3: Redesign Warehouse P29–P34 without extending inventory/replenishment behavior

**Files:**
- Modify: `client/src/pages/warehouse/WarehouseDashboardPage.jsx`
- Modify: `client/src/pages/warehouse/InventoryListPage.jsx`
- Modify: `client/src/pages/warehouse/StockExportQueuePage.jsx`
- Modify: `client/src/pages/warehouse/StockExportDetailPage.jsx`
- Modify: `client/src/pages/warehouse/LowStockPage.jsx`
- Modify: `client/src/pages/warehouse/ReplenishmentPage.jsx`
- Test: `client/src/pages/warehouse/warehouseDashboardStats.test.js`
- Test: `client/src/services/inventoryService.test.js`
- Test: `client/src/services/replenishmentService.test.js`

- [ ] **Step 1: Add data-shape regression tests before markup changes**

Add this test to `client/src/pages/warehouse/warehouseDashboardStats.test.js`:

```js
it('does not count Approved export requests as pending work', () => {
  const stats = getWarehouseDashboardStats({ inventory: [], lowStock: [], stockExports: [{ status: 'Approved' }, { status: 'Pending' }] });
  assert.equal(stats.pendingExports, 1);
});
```

Add this test to `client/src/services/replenishmentService.test.js`:

```js
it('uses the exact receivedQuantity endpoint payload', async () => {
  const service = createReplenishmentService({ baseUrl: 'http://api.test/api', fetcher: async (url, options) => {
    assert.equal(url, 'http://api.test/api/warehouse/replenishments/req-1/receive');
    assert.deepEqual(JSON.parse(options.body), { receivedQuantity: 20 });
    return { ok: true, json: async () => ({ success: true, data: { status: 'Received' } }) };
  }});
  await service.receiveWarehouseRequest('req-1', { receivedQuantity: 20 });
});
```

- [ ] **Step 2: Run the targeted tests**

Run from the repository root: `Set-Location client`, then `node --test src/pages/warehouse/warehouseDashboardStats.test.js src/services/inventoryService.test.js src/services/replenishmentService.test.js`.

Expected: PASS; no service implementation change is required.

- [ ] **Step 3: Apply the ops presentation structure and responsive card siblings**

Wrap each warehouse page body in `<div className="ops-page">`. Keep table rendering for desktop and create each mobile card from the same `items.map` data, for example P31:

```jsx
<div className="ops-card-mobile ops-list">
  {items.map((item) => <article className="ops-panel" key={item.id}>
    <strong>{item.order?.orderCode}</strong>
    <div className="ops-subtle">{translateRequestStatus(item.status)} · {formatCurrency(item.order?.totalAmount)}</div>
    <Link className="btn btn-outline-success btn-sm" to={`/warehouse/stock-exports/${item.id}`}>Mở phiếu</Link>
  </article>)}
</div>
```

For P32 retain exactly these actions based on existing status:

```jsx
item.status === 'Pending' // Approved or Rejected controls
item.status === 'Approved' // Exported control
```

The backend internally traverses `Approved -> Processing -> Exported`; do not expose or add a direct Processing control. In P33 show only `stockQuantity`, `reservedQuantity`, `availableQuantity`, `lowStockThreshold`. In P34 retain only `inventoryId`, `quantity`, `reason`, create request and exact approved receipt.

Block Stitch-only mock features: Excel/PDF export, demand forecasts, 30-day consumption recommendations, per-category threshold editor, map/carrier/priority/timeline, filters not supported by current API, partial receipt, and extra warehouse shell links.

- [ ] **Step 4: Run tests and build**

Run from the repository root: `Set-Location client`, then `node --test src/pages/warehouse/warehouseDashboardStats.test.js src/services/inventoryService.test.js src/services/replenishmentService.test.js`, then `npm run build`.

Expected: PASS and `✓ built`.

- [ ] **Step 5: Commit P29–P34**

```bash
git add client/src/pages/warehouse/WarehouseDashboardPage.jsx client/src/pages/warehouse/InventoryListPage.jsx client/src/pages/warehouse/StockExportQueuePage.jsx client/src/pages/warehouse/StockExportDetailPage.jsx client/src/pages/warehouse/LowStockPage.jsx client/src/pages/warehouse/ReplenishmentPage.jsx client/src/pages/warehouse/warehouseDashboardStats.test.js client/src/services/replenishmentService.test.js client/src/styles/modules/warehouse-admin.css
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "style(warehouse): redesign dashboard inventory export and replenishment"
```

### Task 4: Redesign Warehouse return inspection P35/P36 as a strict consumer of Nhật’s refund hand-off

**Files:**
- Modify: `client/src/pages/warehouse/ReturnRefundQueuePage.jsx`
- Modify: `client/src/pages/warehouse/ReturnRefundInspectionPage.jsx`
- Test: `client/src/services/returnRefundService.test.js` (read/run only)

- [ ] **Step 1: Run the shared return service contract tests**

Run from the repository root: `Set-Location client`, then `node --test src/services/returnRefundService.test.js`.

Expected: PASS; do not edit this shared service/test in this task.

- [ ] **Step 2: Render P35/P36 with existing inspection fields only**

For P35 use the existing `AwaitingInspection` request list and the current detail link. For P36 preserve the item fields and submit mapping:

```jsx
const inspectionItems = items.map(({ productName, requestedQuantity, ...item }) => item);
returnRefundService.inspectRequest(id, { warehouseNote, items: inspectionItems });
```

Use responsive `ops-panel` sections around the existing received/sellable/damaged inputs and note. Do not add restocking, inventory mutation, automatic refund, return shipping tracking, evidence upload, or fake inspection history. The page must continue to submit only when `request.status === 'AwaitingInspection'`.

- [ ] **Step 3: Run contract test and build**

Run from the repository root: `Set-Location client`, then `node --test src/services/returnRefundService.test.js`, then `npm run build`.

Expected: PASS and `✓ built`.

- [ ] **Step 4: Commit P35/P36**

```bash
git add client/src/pages/warehouse/ReturnRefundQueuePage.jsx client/src/pages/warehouse/ReturnRefundInspectionPage.jsx client/src/styles/modules/warehouse-admin.css
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "style(warehouse): redesign return inspection screens"
```

### Task 5: Redesign Admin P37, P41, P42 against current report/settings fields

**Files:**
- Modify: `client/src/pages/admin/AdminDashboardPage.jsx`
- Modify: `client/src/pages/admin/ReplenishmentAdminPage.jsx`
- Modify: `client/src/pages/admin/SystemSettingsPage.jsx`
- Test: `client/src/pages/admin/adminDashboardQuery.test.js`
- Test: `client/src/services/adminService.test.js`

- [ ] **Step 1: Add an admin query regression test**

Add to `client/src/pages/admin/adminDashboardQuery.test.js`:

```js
it('does not add unsupported dashboard preset parameters', () => {
  assert.equal(buildAdminOverviewQuery({ from: '2026-07-22', to: '2026-07-22' }), 'from=2026-07-22&to=2026-07-22');
});
```

- [ ] **Step 2: Run admin tests**

Run from the repository root: `Set-Location client`, then `node --test src/pages/admin/adminDashboardQuery.test.js src/services/adminService.test.js`.

Expected: PASS.

- [ ] **Step 3: Implement P37/P41/P42 presentation only**

For P37, retain the page's present report fields — `revenue`, `orders`, `products`, `inventory`, `support`, `reviews` — and its existing `{ from, to }` date form. Do not add a fake percentage trend, Today/7-day/30-day/quarter preset without mapping it to the existing date fields, Admin orders/customers links, or warehouse cross-role shortcut.

For P41, render only the current request fields: `productName`, `quantity`, `status`, and the existing Approve/Reject action. Do not invent requester role, destination warehouse, currency, multiple line items, export report, or a new status.

For P42, retain exactly these inputs and names:

```jsx
LOW_STOCK_DEFAULT_THRESHOLD
RETURN_WINDOW_DAYS
PAYMENT_TIMEOUT_MINUTES
```

Do not implement Stitch mobile fields for maximum order value, manual confirmation, notification delay, or additional settings. Wrap each existing form/table in `ops-panel`; use the existing `ops-card-mobile` list only where a page already maps items.

- [ ] **Step 4: Run tests and build**

Run from the repository root: `Set-Location client`, then `node --test src/pages/admin/adminDashboardQuery.test.js src/services/adminService.test.js`, then `npm run build`.

Expected: PASS and `✓ built`.

- [ ] **Step 5: Commit P37/P41/P42**

```bash
git add client/src/pages/admin/AdminDashboardPage.jsx client/src/pages/admin/ReplenishmentAdminPage.jsx client/src/pages/admin/SystemSettingsPage.jsx client/src/pages/admin/adminDashboardQuery.test.js client/src/styles/modules/warehouse-admin.css
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "style(admin): redesign dashboard replenishment and settings"
```

### Task 6: Verify the Cường frontend-only and support ownership boundary

**Files:**
- Test: all modified frontend files

- [ ] **Step 1: Check the change set boundary**

Run: `git diff --name-only HEAD~5..HEAD`

Expected: only the planned customer/warehouse/admin pages, `client/src/services/supportService.test.js`, permitted page tests, and `client/src/styles/modules/warehouse-admin.css`. It must not include `App.jsx`, layouts, backend files, service implementations, Staff support pages, `styles.css`, `main.jsx`, `operations.css` or shared-shell styling.

- [ ] **Step 2: Run full frontend verification**

Run from the repository root: `Set-Location client`, then `npm test`, then `npm run build`.

Expected: no failing Node tests and Vite exits `0` with `✓ built`.

- [ ] **Step 3: Commit verification-only corrections if needed**

```bash
git add client/src/pages/customer/SupportPage.jsx client/src/pages/warehouse client/src/pages/admin client/src/services/supportService.test.js client/src/styles/modules/warehouse-admin.css
git -c user.name="Lê Vũ Cường" -c user.email="levucuong0319@gmail.com" commit -m "test(operations-ui): verify responsive warehouse admin redesign"
```

Only create this commit if Task 6 required a corrective source change.
