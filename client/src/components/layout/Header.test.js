import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const header = readFileSync(join(process.cwd(), 'src/components/layout/Header.jsx'), 'utf8');

describe('shared header design contract', () => {
  it('uses Vietnamese commerce navigation and account actions', () => {
    assert.match(header, /Trang chủ/);
    assert.match(header, /Sản phẩm/);
    assert.match(header, /Về GreenHome/);
    assert.match(header, /Liên hệ/);
    assert.match(header, /Đăng nhập/);
    assert.match(header, /Đăng ký/);
    assert.match(header, /Thông báo/);
    assert.match(header, /Hồ sơ/);
    assert.match(header, /Lịch sử mua hàng/);
    assert.match(header, /Đăng xuất/);
    assert.doesNotMatch(header, /Login|Register|Order History|Dashboard|Logout/);
  });

  it('keeps cart scoped to customer/storefront usage instead of internal dashboards', () => {
    assert.match(header, /showCart/);
    assert.match(header, /to="\/login"/);
    assert.match(header, /to="\/register"/);
    assert.match(header, /<NotificationBell/);
    assert.match(header, /to: '\/notifications'/);
    assert.match(header, /avatar-menu/);
    assert.match(header, /roleMenuLinks/);
  });

  it('uses the premium storefront header structure without changing auth behavior', () => {
    assert.match(header, /site-header-premium/);
    assert.match(header, /header-inner/);
    assert.match(header, /brand-mark/);
    assert.match(header, /nav-pill/);
  });
});
