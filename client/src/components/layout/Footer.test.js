import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const footerPath = join(process.cwd(), 'src/components/layout/Footer.jsx');

describe('shared footer design contract', () => {
  it('provides enterprise footer links and business contact details', () => {
    assert.equal(existsSync(footerPath), true);
    const footer = readFileSync(footerPath, 'utf8');

    assert.match(footer, /GreenHome Kitchen/);
    assert.match(footer, /\/products/);
    assert.match(footer, /\/support/);
    assert.match(footer, /\/cart/);
    assert.match(footer, /kitchennhas@greenhome\.com/);
    assert.match(footer, /footer-cta/);
    assert.match(footer, /Sẵn sàng nâng cấp căn bếp của bạn/);
  });
});
