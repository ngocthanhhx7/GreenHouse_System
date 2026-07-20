import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatCurrency, formatProductCurrency, formatProductSku } from './formatters.js';

describe('product detail formatters', () => {
  it('formats the API currency and falls back to VND for legacy products', () => {
    const expectedVnd = formatCurrency(125000, 'VND');

    assert.equal(formatProductCurrency({ price: 125000, currency: 'vnd' }), expectedVnd);
    assert.equal(formatProductCurrency({ price: 125000 }), expectedVnd);
    assert.equal(formatProductCurrency({ price: 125000, currency: 'USD' }), expectedVnd);
  });

  it('formats a Vietnamese SKU label with a legacy fallback', () => {
    assert.equal(formatProductSku('GP-001'), 'SKU: GP-001');
    assert.equal(formatProductSku(''), 'SKU: Chưa cập nhật');
  });
});
