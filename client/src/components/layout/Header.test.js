import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const header = readFileSync(join(process.cwd(), 'src/components/layout/Header.jsx'), 'utf8');

describe('shared header design contract', () => {
  it('uses Vietnamese commerce navigation and account actions', () => {
    assert.match(header, /Trang ch\u1ee7/);
    assert.match(header, /S\u1ea3n ph\u1ea9m/);
    assert.match(header, /V\u1ec1 GreenHome/);
    assert.match(header, /Li\u00ean h\u1ec7/);
    assert.match(header, /\u0110\u0103ng nh\u1eadp/);
    assert.match(header, /\u0110\u0103ng k\u00fd/);
    assert.match(header, /Th\u00f4ng b\u00e1o/);
    assert.match(header, /H\u1ed3 s\u01a1/);
    assert.doesNotMatch(header, /L\u1ecbch s\u1eed mua h\u00e0ng/);
    assert.match(header, /\u0110\u0103ng xu\u1ea5t/);
    assert.doesNotMatch(header, /Login|Register|Order History/);
  });

  it('keeps cart scoped to customer/storefront usage instead of internal dashboards', () => {
    assert.match(header, /showCart/);
    assert.match(header, /useCart/);
    assert.match(header, /cart-indicator-dot/);
    assert.match(header, /itemCount > 0/);
    assert.match(header, /aria-label="Giỏ hàng có sản phẩm mới"/);
    assert.match(header, /to="\/login"/);
    assert.match(header, /to="\/register"/);
    assert.match(header, /<NotificationBell/);
    assert.match(header, /to: '\/notifications'/);
    assert.match(header, /avatar-menu/);
    assert.match(header, /roleMenuLinks/);
    assert.equal((header.match(/to: '\/orders'/g) || []).length, 0);
  });

  it('logs out and replaces the current location with login', () => {
    assert.match(header, /import \{ Link, NavLink, useNavigate \} from 'react-router-dom';/);
    assert.match(header, /const navigate = useNavigate\(\);/);
    assert.match(header, /async function handleLogout\(\) \{[\s\S]*?await logout\(\);[\s\S]*?navigate\('\/login', \{ replace: true \}\);[\s\S]*?\}/);
    assert.match(header, /onClick=\{handleLogout\}/);
  });

  it('uses the premium storefront header structure without changing auth behavior', () => {
    assert.match(header, /site-header-premium/);
    assert.match(header, /header-inner/);
    assert.match(header, /brand-mark/);
    assert.match(header, /nav-pill/);
  });

  it('provides a searchable, keyboard-safe mobile navigation drawer', () => {
    assert.match(header, /mobile-menu-button/);
    assert.match(header, /aria-expanded=\{menuOpen\}/);
    assert.match(header, /navigate\(query \? `\/products\?keyword=\$\{encodeURIComponent\(query\)\}` : '\/products'\)/);
    assert.match(header, /role="dialog"/);
    assert.match(header, /aria-modal="true"/);
    assert.match(header, /event\.key === 'Escape'/);
    assert.match(header, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(header, /menuButtonRef\.current\?\.focus\(\)/);
  });

  it('keeps the desktop profile dropdown independent from the mobile drawer', () => {
    assert.match(header, /profileOpen/);
    assert.match(header, /profileButtonRef/);
    assert.match(header, /avatar-dropdown/);
    assert.match(header, /roleMenuLinks/);
    assert.doesNotMatch(header, /role="menu"|role="menuitem"/);
    assert.doesNotMatch(header, /<span aria-hidden="true">⌄<\/span>/);
  });

  it('closes the modal drawer when the viewport returns to desktop', () => {
    assert.match(header, /window\.matchMedia\('\(min-width: 901px\)'\)/);
    assert.match(header, /if \(event\.matches\) setMenuOpen\(false\)/);
  });
});
