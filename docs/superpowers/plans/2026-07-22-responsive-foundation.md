# Responsive Foundation and Thành UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GreenHome Kitchen's responsive Design DNA, role-safe shared shells, and Thành-owned public, account, and audit-log presentation without changing API contracts, routes, RBAC, or business state machines.

**Architecture:** Keep React page and service logic in place and layer scoped CSS after the legacy stylesheet. The foundation branch creates token/base/shell styles plus empty CSS ownership modules so parallel page owners do not collide; Thành then owns `public-account.css` and `audit.css`. Shared chrome renders according to the authenticated role: Public/Customer use storefront chrome, while Staff/WarehouseManager/Admin use an internal topbar and role-scoped sidebar or compact account navigation.

**Tech Stack:** React 19, React Router 7, existing Bootstrap runtime, plain scoped CSS, Node test runner, Vite 6 production build, existing REST services and formatters.

---

## Guardrails and file map

Create branch `feature/thanh-responsive-foundation` from the agreed integration base. Every commit in this plan must use:

Every commit command below sets `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>` explicitly; do not rely on global Git identity.

Never modify backend files, API services, route definitions, state machines, or the design-input directory `D:\WW\GreenHouse_System\thiết kế stitch`. Do not add Google Fonts runtime imports, `lh3.googleusercontent.com` assets, mock Stitch names/prices/KPIs, wishlist, bottom navigation, newsletter, floating chat, or cross-role navigation.

| File | Responsibility |
|---|---|
| `client/src/main.jsx` | Imports CSS in the canonical cascade order after legacy `styles.css`. |
| `client/src/styles/tokens.css` | Canonical GreenHome colors, self-hosted font faces, spacing/radius/elevation variables. |
| `client/src/styles/base.css` | Reset-safe body, typography, focus-visible, controls, reduced-motion rules. |
| `client/src/styles/shared-shell.css` | Header, footer, internal topbar, responsive sidebar drawer, account shell. |
| `client/src/styles/storefront.css` | Aggregates the public/account, catalog, and customer-purchase style modules. |
| `client/src/styles/operations.css` | Aggregates staff, warehouse-admin, admin-catalog, and audit style modules. |
| `client/src/styles/modules/public-account.css` | Thành-owned styling for P01, P04-P12. |
| `client/src/styles/modules/audit.css` | Thành-owned styling for P39, including mobile labelled records. |
| `client/src/styles/modules/{catalog,customer-purchase,staff,warehouse-admin,admin-catalog}.css` | Empty ownership boundaries for parallel owners; no selectors until those owners implement their routes. |
| `client/src/components/layout/{Header,Footer,InternalTopbar,Sidebar,AccountLayout,AppLayout,CustomerLayout,PublicLayout}.jsx` | Shared chrome; preserve existing services and outlet routing. |
| `client/src/components/notifications/NotificationBell.jsx` | Existing unread dropdown; re-used by customer and internal topbars. |
| `client/src/pages/public/{HomePage,AboutPage,ContactPage}.jsx` | P01/P04/P05; retain API and GSAP logic. |
| `client/src/pages/auth/{LoginPage,RegisterPage}.jsx` | P06/P07; retain auth submission and redirect behavior. |
| `client/src/pages/errors/{UnauthorizedPage,ForbiddenPage}.jsx` | P08/P09. |
| `client/src/pages/profile/ProfilePage.jsx` | P10; retain profile/avatar/password/address CRUD. |
| `client/src/pages/notifications/{NotificationPage,NotificationDetailPage}.jsx` | P11/P12; retain notification service behavior. |
| `client/src/pages/admin/AuditLogPage.jsx` | P39; retain only supported audit filters and fields. |

### Task 1: Create the CSS ownership boundary and canonical cascade

**Files:**
- Create: `client/src/styles/tokens.css`
- Create: `client/src/styles/base.css`
- Create: `client/src/styles/shared-shell.css`
- Create: `client/src/styles/storefront.css`
- Create: `client/src/styles/operations.css`
- Create: `client/src/styles/modules/public-account.css`
- Create: `client/src/styles/modules/audit.css`
- Create: `client/src/styles/modules/catalog.css`
- Create: `client/src/styles/modules/customer-purchase.css`
- Create: `client/src/styles/modules/staff.css`
- Create: `client/src/styles/modules/warehouse-admin.css`
- Create: `client/src/styles/modules/admin-catalog.css`
- Modify: `client/src/main.jsx:7`
- Modify: `client/src/styles.test.js`

- [ ] **Step 1: Write the failing import-order and canonical-token assertions**

Append a new test block to `client/src/styles.test.js` that reads `main.jsx` and `tokens.css`:

```js
const main = readFileSync(join(process.cwd(), 'src/main.jsx'), 'utf8');
const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('responsive Design DNA foundation', () => {
  it('loads scoped layers after the legacy stylesheet in canonical order', () => {
    const imports = [
      "import './styles.css';",
      "import './styles/tokens.css';",
      "import './styles/base.css';",
      "import './styles/shared-shell.css';",
      "import './styles/storefront.css';",
      "import './styles/operations.css';",
    ];
    let previous = -1;
    for (const entry of imports) {
      const position = main.indexOf(entry);
      assert.ok(position > previous, `expected ${entry} after the preceding stylesheet`);
      previous = position;
    }
  });

  it('uses the approved forest token instead of Stitch semantic primary', () => {
    assert.match(tokens, /--gh-forest:\s*#173E31;/);
    assert.match(tokens, /--gh-paper:\s*#FFFDF8;/);
    assert.match(tokens, /--gh-font-display:\s*'Fraunces'/);
    assert.match(tokens, /--gh-font-ui:\s*'Outfit'/);
    assert.doesNotMatch(tokens, /https:\/\/fonts\.googleapis\.com|#00281C/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
Set-Location client
node --test src/styles.test.js
```

Expected: FAIL because `tokens.css` and the five required imports do not exist.

- [ ] **Step 3: Add the minimal CSS files and imports**

Use these complete aggregators; leave parallel-owner modules empty except for their ownership comment:

```css
/* client/src/styles/storefront.css */
@import './modules/public-account.css';
@import './modules/catalog.css';
@import './modules/customer-purchase.css';
```

```css
/* client/src/styles/operations.css */
@import './modules/staff.css';
@import './modules/warehouse-admin.css';
@import './modules/admin-catalog.css';
@import './modules/audit.css';
```

```css
/* client/src/styles/modules/catalog.css */
/* Reserved for Phạm Thành Chung: P02, P03, P38 and P40. */
```

```css
/* client/src/styles/modules/customer-purchase.css */
/* Reserved for Nguyễn Quang Huy: P13-P18. */
```

```css
/* client/src/styles/modules/staff.css */
/* Reserved for Nguyễn Hữu Anh Nhật: P19, P21-P28. */
```

```css
/* client/src/styles/modules/warehouse-admin.css */
/* Reserved for Lê Vũ Cường: P29-P37, P41-P42. */
```

```css
/* client/src/styles/modules/admin-catalog.css */
/* Reserved for Phạm Thành Chung: P38 and P40. */
```

Put the following source of truth in `tokens.css`; font URLs must refer to committed WOFF2 files, never a network URL:

```css
@font-face {
  font-family: 'Fraunces';
  src: url('/fonts/fraunces-latin-vietnamese.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Outfit';
  src: url('/fonts/outfit-latin-vietnamese.woff2') format('woff2');
  font-display: swap;
}

:root {
  --gh-forest: #173E31;
  --gh-forest-deep: #12392D;
  --gh-leaf: #2F6B42;
  --gh-ivory: #F7F3E8;
  --gh-paper: #FFFDF8;
  --gh-gold: #D8A75B;
  --gh-border: #DCE5D8;
  --gh-muted: #657367;
  --gh-ink: #1C1C15;
  --gh-error: #BA1A1A;
  --gh-space-1: 4px;
  --gh-gutter-mobile: 16px;
  --gh-gutter-desktop: 40px;
  --gh-container: 1280px;
  --gh-radius-control: 6px;
  --gh-radius-panel: 10px;
  --gh-radius-card: 16px;
  --gh-shadow: 0 10px 30px -10px rgba(23, 62, 49, 0.12);
  --gh-font-display: 'Fraunces', Georgia, serif;
  --gh-font-ui: 'Outfit', Arial, sans-serif;
}
```

If the two licensed WOFF2 files and their license text are not present or cannot be sourced under the repository's licensing policy, stop this step and request those assets; do not replace them with Google Fonts. When available, create `client/public/fonts/fraunces-latin-vietnamese.woff2`, `client/public/fonts/outfit-latin-vietnamese.woff2`, and their license file, then preload the same two WOFF2 files in `client/index.html`.

Make `base.css` contain the baseline accessibility rules:

```css
body { background: var(--gh-ivory); color: var(--gh-ink); font-family: var(--gh-font-ui); line-height: 1.5; }
h1, h2, h3, .brand-name { color: var(--gh-forest-deep); font-family: var(--gh-font-display); }
button, input, textarea, select { font: inherit; }
:where(a, button, input, textarea, select):focus-visible { outline: 3px solid var(--gh-gold); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
```

Add imports to `main.jsx` immediately after `import './styles.css';`:

```js
import './styles/tokens.css';
import './styles/base.css';
import './styles/shared-shell.css';
import './styles/storefront.css';
import './styles/operations.css';
```

- [ ] **Step 4: Run focused tests and production build**

Run:

```powershell
Set-Location client
node --test src/styles.test.js
npm run build
```

Expected: both commands exit `0`; the existing legacy selector assertions remain green.

- [ ] **Step 5: Commit the isolated foundation**

```powershell
git add client/src/main.jsx client/src/styles client/src/styles.test.js client/public/fonts client/index.html
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "feat(ui): add responsive design foundation"
```

Expected: one commit containing only foundation CSS, font assets/licenses if authorized, `main.jsx`, and its test.

### Task 2: Make storefront and internal shared chrome role-safe and responsive

**Files:**
- Modify: `client/src/components/layout/Header.jsx`
- Modify: `client/src/components/layout/Footer.jsx`
- Modify: `client/src/components/layout/InternalTopbar.jsx`
- Modify: `client/src/components/layout/Sidebar.jsx`
- Modify: `client/src/components/layout/AccountLayout.jsx`
- Modify: `client/src/components/layout/AppLayout.jsx`
- Modify: `client/src/styles/shared-shell.css`
- Modify: `client/src/components/layout/Layout.test.js`
- Modify: `client/src/components/layout/Header.test.js`
- Modify: `client/src/components/layout/Footer.test.js`
- Modify: `client/src/components/layout/AccountLayout.test.js`
- Modify: `client/src/components/notifications/NotificationBell.test.js`

- [ ] **Step 1: Replace the obsolete InternalTopbar test with the approved contract**

In `Layout.test.js`, replace the test named `keeps the operational topbar to non-link identity and logout controls` with assertions that match the approved integration contract:

```js
const sidebar = readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.jsx'), 'utf8');

it('gives operational users notifications and an account menu without storefront controls', () => {
  assert.match(internalTopbar, /NotificationBell/);
  assert.match(internalTopbar, /to="\/profile"/);
  assert.match(internalTopbar, /to="\/notifications"/);
  assert.match(internalTopbar, /Đăng xuất/);
  assert.doesNotMatch(internalTopbar, /to="\/cart"/);
  assert.doesNotMatch(internalTopbar, /Trang chủ|Sản phẩm|Về GreenHome/);
});
```

Place `const sidebar = readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.jsx'), 'utf8');` beside the existing `internalTopbar` declaration at module scope, not inside the test body.

Add a Sidebar assertion that rejects links from other role groups while preserving the existing `ROLE_LINKS` object:

```js
it('selects navigation only from the signed-in role group', () => {
  assert.match(sidebar, /const links = ROLE_LINKS\[user\?\.role\] \|\| ROLE_LINKS\.Customer/);
  assert.match(sidebar, /links\.map/);
});
```

Add Header assertions for a real mobile drawer and search route:

```js
assert.match(header, /mobile-menu-button/);
assert.match(header, /aria-expanded=\{menuOpen\}/);
assert.match(header, /navigate\(query \? `\/products\?keyword=\$\{encodeURIComponent\(query\)\}` : '\/products'\)/);
```

- [ ] **Step 2: Run layout tests to verify they fail**

Run:

```powershell
Set-Location client
node --test src/components/layout/Layout.test.js src/components/layout/Header.test.js src/components/layout/Footer.test.js src/components/layout/AccountLayout.test.js src/components/notifications/NotificationBell.test.js
```

Expected: FAIL because InternalTopbar lacks `NotificationBell` and account links, and Header lacks the drawer/search implementation.

- [ ] **Step 3: Implement the smallest shared components that satisfy the new contract**

Preserve the existing `Header` auth/cart predicates and add state for a mobile drawer and search. Its submit handler must use the current catalog query contract:

```js
function handleSearch(event) {
  event.preventDefault();
  const query = keyword.trim();
  navigate(query ? `/products?keyword=${encodeURIComponent(query)}` : '/products');
  setMenuOpen(false);
}
```

The mobile toggle must be a semantic button and the drawer must only contain the existing `PUBLIC_LINKS` plus permitted current account actions:

```jsx
<button className="mobile-menu-button" type="button" aria-label="Mở menu điều hướng" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
  <span aria-hidden="true">☰</span>
</button>
```

Immediately after the button, conditionally render a `div.mobile-navigation[role="dialog"]` and map every entry in the existing `PUBLIC_LINKS` array to its current `NavLink`. Append only the current role-safe account actions; do not add a new route or action.

Update `InternalTopbar.jsx` to import `Link`, `NotificationBell`, and render a compact account menu with only Profile, Notifications, and Logout:

```jsx
<div className="internal-actions">
  <NotificationBell />
  <div className="internal-profile-menu">
    <Link to="/profile">Hồ sơ</Link>
    <Link to="/notifications">Thông báo</Link>
    <button className="btn btn-outline-success btn-sm" type="button" onClick={handleLogout}>Đăng xuất</button>
  </div>
</div>
```

Do not render cart or public navigation in `InternalTopbar`. Keep `Sidebar` driven only by `ROLE_LINKS`; implement mobile open/close state in `AppLayout`, close on `Escape` and overlay click, restore focus to the toggle, and lock document scrolling while open. Keep `AccountLayout` customer-aware: Customer gets `Header showCart` and `Footer`; operational roles get `InternalTopbar` plus compact account links, never the operational Sidebar.

Use `shared-shell.css` selectors scoped to `.site-header-premium`, `.site-footer`, `.internal-topbar`, `.app-shell`, `.mobile-navigation`, `.sidebar-drawer`, and `.account-shell`. At `max-width: 767px`, hide desktop nav, make the menu toggle at least `44px`, make the sidebar a fixed overlay drawer, and preserve page content gutters of `var(--gh-gutter-mobile)`.

- [ ] **Step 4: Run focused shell tests and verify role boundaries**

Run:

```powershell
Set-Location client
node --test src/components/layout/Layout.test.js src/components/layout/Header.test.js src/components/layout/Footer.test.js src/components/layout/AccountLayout.test.js src/components/notifications/NotificationBell.test.js
npm run build
```

Expected: all tests and build exit `0`; internal chrome contains the bell/account menu but no cart/public links.

- [ ] **Step 5: Commit the shared shell**

```powershell
git add client/src/components/layout client/src/components/notifications/NotificationBell.test.js client/src/styles/shared-shell.css
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "feat(ui): unify responsive role-safe shells"
```

### Task 3: Restyle P01, P04, P05 and public auth/errors without changing behavior

**Files:**
- Modify: `client/src/pages/public/HomePage.jsx`
- Modify: `client/src/pages/public/AboutPage.jsx`
- Modify: `client/src/pages/public/ContactPage.jsx`
- Modify: `client/src/pages/auth/LoginPage.jsx`
- Modify: `client/src/pages/auth/RegisterPage.jsx`
- Modify: `client/src/pages/errors/UnauthorizedPage.jsx`
- Modify: `client/src/pages/errors/ForbiddenPage.jsx`
- Modify: `client/src/styles/modules/public-account.css`
- Modify: `client/src/pages/public/HomePage.test.js`
- Modify: `client/src/pages/public/AboutContactPage.test.js`
- Modify: `client/src/services/authService.test.js`

- [ ] **Step 1: Add failing page-boundary assertions**

Append assertions that prohibit external Stitch dependencies and protect API-driven Home fields:

```js
it('does not embed Stitch mock products or remote Stitch assets', () => {
  assert.doesNotMatch(home, /lh3\.googleusercontent|Nồi Gang Tráng Men Forest Green|Bộ Đĩa Gốm Thủ Công Earth Tone/);
  assert.match(home, /productsLoading/);
  assert.match(home, /featuredProducts/);
  assert.match(home, /getHomeProductDisplay\(product\)/);
  assert.match(home, /formatCurrency\(display\.price\)/);
});
```

Add the following protected About assertion (P04 has no Stitch export and retains its body):

```js
assert.match(aboutPage, /Câu chuyện về GreenHome Kitchen/);
assert.doesNotMatch(aboutPage, /lh3\.googleusercontent/);
```

- [ ] **Step 2: Run tests to verify the new assertions fail if mock markup was introduced**

Run:

```powershell
Set-Location client
node --test src/pages/public/HomePage.test.js src/pages/public/AboutContactPage.test.js src/services/authService.test.js
```

Expected: PASS against the current code before visual refactor; this establishes the regression guard before changing page markup/classes.

- [ ] **Step 3: Apply scoped presentation classes while preserving each data and mutation path**

For P01, use existing `productService.listProducts`, `getHomeProductDisplay`, `resolveMediaUrl`, `formatCurrency`, `productsLoading`, and the current error/empty branches. Do not add static `productShowcase`, category IDs, price/name overrides, quick-view, wishlist, or rating badges.

For P04, keep existing `about-story-page`, all current Vietnamese story content, and its asset references; only harmonize classes/styles with `public-account.css`.

For P05, retain the existing client-side contact success behavior, current phone/email/map URLs and `/support` CTA. Do not claim ticket creation or introduce a backend mutation.

For P06/P07, preserve their existing auth form names, validation, error display, `authService` calls and dashboard redirects. For P08/P09, present the existing recovery links only; do not add a new role or route.

Add only scoped rules such as:

```css
.public-page, .auth-page, .error-page { max-width: var(--gh-container); margin-inline: auto; padding: 48px var(--gh-gutter-mobile); }
.home-premium .home-product-tile, .about-story-page .about-value-card, .contact-story-page .contact-message-card { background: var(--gh-paper); border: 1px solid var(--gh-border); border-radius: var(--gh-radius-card); box-shadow: var(--gh-shadow); }
@media (min-width: 768px) { .public-page, .auth-page, .error-page { padding-inline: var(--gh-gutter-desktop); } }
```

- [ ] **Step 4: Run public/auth tests and build**

Run:

```powershell
Set-Location client
node --test src/pages/public/HomePage.test.js src/pages/public/AboutContactPage.test.js src/services/authService.test.js src/utils/formatters.test.js
npm run build
```

Expected: exit `0`; Home continues to render the API product name and `formatCurrency` price unchanged.

- [ ] **Step 5: Commit public/auth/error presentation**

```powershell
git add client/src/pages/public client/src/pages/auth client/src/pages/errors client/src/styles/modules/public-account.css client/src/pages/public/HomePage.test.js client/src/pages/public/AboutContactPage.test.js client/src/services/authService.test.js
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "feat(ui): restyle public and auth routes"
```

### Task 4: Restyle P10-P12 account pages while retaining API-driven profile and notification flows

**Files:**
- Modify: `client/src/pages/profile/ProfilePage.jsx`
- Modify: `client/src/pages/notifications/NotificationPage.jsx`
- Modify: `client/src/pages/notifications/NotificationDetailPage.jsx`
- Modify: `client/src/styles/modules/public-account.css`
- Modify: `client/src/services/profileService.test.js`
- Modify: `client/src/services/notificationService.test.js`
- Test: `client/src/components/notifications/NotificationBell.test.js`

- [ ] **Step 1: Add failing page/service integration assertions**

Add a test to `profileService.test.js` confirming the intended customer-only address condition stays in the page source:

```js
const profilePage = readFileSync(join(process.cwd(), 'src/pages/profile/ProfilePage.jsx'), 'utf8');

it('keeps the address book customer-only while retaining avatar and password services', () => {
  assert.match(profilePage, /const isCustomer = user\?\.role === 'Customer';/);
  assert.match(profilePage, /isCustomer && <section className="account-panel address-book-section">/);
  assert.match(profilePage, /profileService\.uploadAvatar/);
  assert.match(profilePage, /profileService\.changePassword/);
});
```

Add a notification page-source test in `notificationService.test.js` that protects current interaction methods:

```js
const notificationPage = readFileSync(join(process.cwd(), 'src/pages/notifications/NotificationPage.jsx'), 'utf8');

it('keeps unread filtering, cursor loading, and deletion of read notifications', () => {
  assert.match(notificationPage, /status: 'all'/);
  assert.match(notificationPage, /listMyNotifications\(\{ status, limit: 20, cursor \}\)/);
  assert.match(notificationPage, /deleteNotification/);
  assert.match(notificationPage, /nextCursor/);
});
```

Add the required `node:fs` and `node:path` imports in those test files.

- [ ] **Step 2: Run tests to establish the guard**

Run:

```powershell
Set-Location client
node --test src/services/profileService.test.js src/services/notificationService.test.js src/components/notifications/NotificationBell.test.js
```

Expected: PASS before markup/style changes; this confirms the behavior guard covers the current contract.

- [ ] **Step 3: Implement responsive account presentation without replacing service calls**

Use `.account-shell`, `.account-layout`, `.account-navigation`, `.account-content`, `.profile-page`, `.notification-inbox`, `.notification-list`, and `.notification-detail` scoped rules in `public-account.css`. At mobile widths, make account navigation a horizontal, wrap-safe control row; maintain touch targets at least 44px and never truncate primary Vietnamese names or notification subjects.

Keep the following existing contracts intact:

```js
await profileService.updateProfile(profileForm);
await profileService.changePassword(passwordForm);
await profileService.createAddress(addressForm);
await notificationService.deleteNotification(id);
const result = await notificationService.listMyNotifications({ status, limit: 20, cursor });
```

`NotificationDetailPage.jsx` must still mark/read and route through its current role-aware target behavior; do not use either desktop or mobile Stitch demo notification record as runtime content.

- [ ] **Step 4: Run profile/notification and layout tests**

Run:

```powershell
Set-Location client
node --test src/services/profileService.test.js src/services/notificationService.test.js src/components/notifications/NotificationBell.test.js src/components/layout/AccountLayout.test.js
npm run build
```

Expected: all commands exit `0`; operational users see no address book, while customer profile retains address CRUD.

- [ ] **Step 5: Commit the account flow presentation**

```powershell
git add client/src/pages/profile/ProfilePage.jsx client/src/pages/notifications client/src/styles/modules/public-account.css client/src/services/profileService.test.js client/src/services/notificationService.test.js
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "feat(ui): restyle account and notification flows"
```

### Task 5: Restyle P39 audit log as responsive records without expanding its API

**Files:**
- Modify: `client/src/pages/admin/AuditLogPage.jsx`
- Modify: `client/src/styles/modules/audit.css`
- Create: `client/src/pages/admin/AuditLogPage.test.js`
- Test: `client/src/services/adminService.test.js`

- [ ] **Step 1: Create a failing audit page contract test**

Create `client/src/pages/admin/AuditLogPage.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(join(process.cwd(), 'src/pages/admin/AuditLogPage.jsx'), 'utf8');

describe('audit log responsive presentation contract', () => {
  it('keeps only supported filters and exposes labelled data for mobile CSS', () => {
    assert.match(page, /action: '', userId: '', from: '', to: ''/);
    assert.match(page, /adminService\.listAuditLogs\(nextFilters\)/);
    assert.match(page, /data-label="Thời gian"/);
    assert.match(page, /data-label="Hành động"/);
    assert.doesNotMatch(page, /export|severity|abnormal-login/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
Set-Location client
node --test src/pages/admin/AuditLogPage.test.js src/services/adminService.test.js
```

Expected: FAIL because current `<td>` elements do not yet have `data-label` attributes.

- [ ] **Step 3: Add presentation-only labels and CSS card conversion**

Keep all current filter state and `adminService.listAuditLogs(nextFilters)` intact. Add labels to the existing cells only:

```jsx
<td data-label="Thời gian">{formatDate(item.timestamp)}</td>
<td data-label="Hành động">{item.action}</td>
<td data-label="Người dùng">{item.userId || '-'}</td>
<td data-label="Đối tượng">{item.targetEntity} {item.targetId || ''}</td>
<td data-label="Mô tả">{item.description || '-'}</td>
```

In `audit.css`, preserve the table above 768px and convert only the audit table below 768px:

```css
@media (max-width: 767px) {
  .audit-log-page table, .audit-log-page tbody, .audit-log-page tr, .audit-log-page td { display: block; width: 100%; }
  .audit-log-page thead { display: none; }
  .audit-log-page tbody tr { margin-block: 12px; padding: 16px; background: var(--gh-paper); border: 1px solid var(--gh-border); border-radius: var(--gh-radius-panel); box-shadow: var(--gh-shadow); }
  .audit-log-page td { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; border: 0; padding: 6px 0; }
  .audit-log-page td::before { content: attr(data-label); color: var(--gh-muted); font-weight: 600; }
}
```

Add `className="audit-log-page surface"` to the page root. Do not add export, severity, anomaly, delete, or audit mutation controls.

- [ ] **Step 4: Run audit tests and build**

Run:

```powershell
Set-Location client
node --test src/pages/admin/AuditLogPage.test.js src/services/adminService.test.js
npm run build
```

Expected: exit `0`; audit requests remain `GET /admin/audit-logs` with only `action`, `userId`, `from`, and `to` query keys.

- [ ] **Step 5: Commit P39**

```powershell
git add client/src/pages/admin/AuditLogPage.jsx client/src/pages/admin/AuditLogPage.test.js client/src/styles/modules/audit.css client/src/services/adminService.test.js
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "feat(ui): make audit logs responsive"
```

### Task 6: Execute cross-role regression and visual QA before integration handoff

**Files:**
- Modify only if a failing regression identifies a scoped defect: the exact file named by Tasks 1-5.
- Test: `client/src/App.jsx`, `client/src/components/layout/*.test.js`, all focused tests listed above.

- [ ] **Step 1: Run the full client test suite**

Run:

```powershell
Set-Location client
npm test
```

Expected: exit `0` with no skipped failure; if a test fails, repair only the owner-scoped source or test contract described above and rerun the exact failing command before rerunning the full suite.

- [ ] **Step 2: Run the production build and inspect for forbidden runtime dependencies**

Run:

```powershell
npm run build
rg -n "fonts\.googleapis\.com|lh3\.googleusercontent\.com|productShowcase|wishlist|Yêu thích|Newsletter" src public
```

Expected: build exits `0`; ripgrep has no matches in new Thành-owned runtime code. Existing unrelated legacy content must be evaluated before removal and not silently changed.

- [ ] **Step 3: Perform manual responsive, role, and data passthrough QA**

At viewport widths 390px, 768px, 1024px, and 1440px, verify:

```text
Guest: Header has logo/public nav/search/Login/Register; no cart/bell/avatar.
Customer: Header has search/cart/bell/avatar; Footer visible; profile has Address Book.
Staff/WarehouseManager/Admin: InternalTopbar has bell/Profile/Notifications/Logout; no cart/public nav; Sidebar only exposes that role's ROLE_LINKS.
Home: an API product's name and `formatCurrency` price match the catalog response; loading/error/empty remain distinguishable.
P04: About body and Vietnamese story remain intact.
P10-P12: profile avatar/password/address behavior and notification read/delete/cursor behavior work with API data.
P39: desktop table remains readable; mobile rows expose labels and no horizontal action is hidden.
```

Expected: browser console has no React warnings, errors, asset 404s, or network dependency on Google Fonts/lh3.

- [ ] **Step 4: Commit only verified corrections, then prepare integration review**

```powershell
git status --short
git diff --check
git add <only-owner-scoped-files-fixed-by-regression>
git -c user.name="Nguyễn Ngọc Thành" -c user.email="thanhnnhe186491@fpt.edu.vn" commit -m "test(ui): verify responsive foundation regression"
git log --format='%h %an <%ae> %s' -5
```

Expected: no staged `thiết kế stitch` content or unrelated local files; all new commits identify `Nguyễn Ngọc Thành <thanhnnhe186491@fpt.edu.vn>`.

## Integration acceptance checklist

- [ ] All five new CSS layers load after legacy CSS in `main.jsx` and only the requested modules contain selectors.
- [ ] Design tokens use `#173E31` as canonical primary; no runtime Google font or Stitch image dependency exists.
- [ ] Shared Chrome preserves Guest/Customer/Internal separation, role-scoped Sidebar, Customer-only cart/address book, and approved InternalTopbar bell/account menu.
- [ ] P01/P04-P12/P39 preserve existing API, service, formatter, route, RBAC, and state-machine behavior.
- [ ] P04 body remains intact despite no P04 Stitch export.
- [ ] Mobile tables use labelled records; drawers/dropdowns support keyboard, Escape, click-outside, focus return, and scroll lock.
- [ ] Client tests and production build pass; server tests are run only if an API-contract mismatch was discovered.
- [ ] The branch is reviewed by Nguyễn Ngọc Thành, merged `--no-ff` to `main`, `main` is pushed, and the feature branch is deleted only after successful integration verification.
