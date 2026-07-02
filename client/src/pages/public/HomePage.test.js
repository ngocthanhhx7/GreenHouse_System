import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const home = readFileSync(join(process.cwd(), 'src/pages/public/HomePage.jsx'), 'utf8');

describe('home page premium commerce design contract', () => {
  it('uses Vietnamese commerce-first content without demo/internal workflow copy', () => {
    assert.match(home, /Căn bếp xanh/);
    assert.match(home, /Mua sắm ngay/);
    assert.match(home, /Danh mục nổi bật/);
    assert.match(home, /Sản phẩm bán chạy/);
    assert.match(home, /Khách hàng nói gì/);
    assert.match(home, /Cam kết xử lý đơn hàng/);
    assert.doesNotMatch(home, /Ready for demo|Business workflow preview|Staff Processing|Warehouse|Shop Now|Start Shopping|Category Showcase|Kitchen Collections|Newsletter/);
  });

  it('keeps GSAP scoped but removes heavy looping and tilt animation patterns', () => {
    assert.match(home, /useGSAP/);
    assert.match(home, /ScrollTrigger/);
    assert.match(home, /prefers-reduced-motion/);
    assert.match(home, /\/assets\/banner\/banner\.png/);
    assert.doesNotMatch(home, /repeat:\s*-1/);
    assert.doesNotMatch(home, /handleMouseMove/);
    assert.doesNotMatch(home, /ambient-blob/);
  });
});
