import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const footerPath = join(process.cwd(), 'src/components/layout/Footer.jsx');

describe('shared footer design contract', () => {
  it('provides the canonical Vietnamese navigation and business details', () => {
    assert.equal(existsSync(footerPath), true);
    const footer = readFileSync(footerPath, 'utf8');

    assert.match(footer, /GreenHome Kitchen/);
    assert.match(footer, /Dụng cụ bếp được tuyển chọn cho gia đình Việt hiện đại\./);
    assert.match(footer, /Khám phá/);
    assert.match(footer, /Hỗ trợ/);
    assert.match(footer, /\/products/);
    assert.match(footer, /\/support/);
    assert.match(footer, /\/profile/);
    assert.match(footer, /\/notifications/);
    assert.match(footer, /0856 464 980/);
    assert.match(footer, /kitchennhas@greenhome\.com/);
    assert.match(footer, /Hà Nội, Việt Nam/);
    assert.doesNotMatch(footer, /\/cart/);
    assert.doesNotMatch(footer, /Vermont|Heritage Lane|Newsletter|Shipping Policy|Returns/);
    assert.doesNotMatch(footer, /footer-cta/);
    assert.doesNotMatch(footer, /Sẵn sàng nâng cấp căn bếp của bạn/);
  });
});
