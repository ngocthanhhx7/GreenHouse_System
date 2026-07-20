import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatProductCurrency, formatProductSku } from './formatters.js';

describe('product detail formatters', () => {
  it('formats the API currency and falls back to VND for legacy products', () => {
    assert.equal(formatProductCurrency({ price: 125000, currency: 'vnd' }), '125.000 ₫');
    assert.equal(formatProductCurrency({ price: 125000 }), '125.000 ₫');
    assert.equal(formatProductCurrency({ price: 125000, currency: 'USD' }), '125.000 ₫');
  });

  it('formats a Vietnamese SKU label with a legacy fallback', () => {
    assert.equal(formatProductSku('GP-001'), 'SKU: GP-001');
    assert.equal(formatProductSku(''), 'SKU: Chưa cập nhật');
  });
});
