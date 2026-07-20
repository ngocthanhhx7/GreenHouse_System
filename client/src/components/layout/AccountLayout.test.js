import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const layout = readFileSync(join(process.cwd(), 'src/components/layout/AccountLayout.jsx'), 'utf8');
const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.jsx'), 'utf8');

describe('account layout routing contract', () => {
  it('places profile and notifications in the shared account shell', () => {
    assert.match(app, /<AccountLayout/);
    assert.match(layout, /<Outlet/);
    assert.match(layout, /Hồ sơ cá nhân/);
    assert.match(layout, /Thông báo/);
  });

  it('keeps account links out of operational sidebars', () => {
    assert.doesNotMatch(sidebar, /to: '\/profile'/);
    assert.doesNotMatch(sidebar, /to: '\/notifications'/);
  });

  it('uses storefront chrome for customers and internal topbar for operational roles', () => {
    assert.match(layout, /user\?\.role === 'Customer'/);
    assert.match(layout, /<Header showCart/);
    assert.match(layout, /<InternalTopbar/);
  });
});
