import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const appLayout = readFileSync(join(process.cwd(), 'src/components/layout/AppLayout.jsx'), 'utf8');
const customerLayout = readFileSync(join(process.cwd(), 'src/components/layout/CustomerLayout.jsx'), 'utf8');
const publicLayout = readFileSync(join(process.cwd(), 'src/components/layout/PublicLayout.jsx'), 'utf8');
const appRoutes = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
const internalTopbar = readFileSync(join(process.cwd(), 'src/components/layout/InternalTopbar.jsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.jsx'), 'utf8');
const sharedShell = readFileSync(join(process.cwd(), 'src/styles/shared-shell.css'), 'utf8');

describe('role layout separation contract', () => {
  it('keeps footer in storefront and customer layouts only', () => {
    assert.match(publicLayout, /<Footer/);
    assert.match(customerLayout, /<Footer/);
    assert.doesNotMatch(appLayout, /<Footer/);
  });

  it('keeps customer commerce pages outside the internal dashboard shell', () => {
    assert.match(appRoutes, /<CustomerLayout/);
    assert.match(customerLayout, /<Header showCart/);
  });

  it('uses internal topbar controls for authenticated dashboards', () => {
    assert.match(appLayout, /InternalTopbar/);
    assert.match(appLayout, /Sidebar/);
    assert.doesNotMatch(appLayout, /<Header/);
    assert.doesNotMatch(appLayout, /showCart/);
  });

  it('gives operational users notifications and an account menu without storefront controls', () => {
    assert.match(internalTopbar, /NotificationBell/);
    assert.match(internalTopbar, /to="\/profile"/);
    assert.match(internalTopbar, /to="\/notifications"/);
    assert.match(internalTopbar, /Đăng xuất/);
    assert.doesNotMatch(internalTopbar, /to="\/cart"/);
    assert.doesNotMatch(internalTopbar, /Trang chủ|Sản phẩm|Về GreenHome/);
    assert.doesNotMatch(internalTopbar, /to="\/"/);
    assert.doesNotMatch(internalTopbar, /role="menu"|role="menuitem"/);
  });

  it('selects navigation only from the signed-in role group', () => {
    assert.match(sidebar, /const links = ROLE_LINKS\[user\?\.role\] \|\| ROLE_LINKS\.Customer/);
    assert.match(sidebar, /links\.map/);
  });

  it('owns mobile sidebar accessibility in the app shell', () => {
    assert.match(appLayout, /sidebarOpen/);
    assert.match(appLayout, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(appLayout, /event\.key === 'Escape'/);
    assert.match(appLayout, /sidebar-overlay/);
    assert.match(appLayout, /menuButtonRef/);
    assert.match(appLayout, /window\.matchMedia\('\(max-width: 900px\)'\)/);
    assert.match(appLayout, /setSidebarOpen\(false\)/);
    assert.match(sidebar, /role=\{open \? 'dialog' : undefined\}/);
    assert.match(sidebar, /aria-modal=\{open \? 'true' : undefined\}/);
    assert.match(appLayout, /inert=\{modalOpen \? true : undefined\}/);
    assert.match(appLayout, /aria-hidden=\{modalOpen \? 'true' : undefined\}/);
    assert.match(appLayout, /backgroundInert=\{modalOpen\}/);
    assert.match(internalTopbar, /inert=\{backgroundInert \? true : undefined\}/);
  });

  it('scopes shared shell child selectors and keeps both guest actions at tablet width', () => {
    assert.doesNotMatch(sharedShell, /^\.(avatar-dropdown-heading|mobile-navigation|mobile-menu-button|internal-brand-area|sidebar-overlay)\b/m);
    assert.doesNotMatch(sharedShell, /header-auth-btn:first-child/);
  });
});
