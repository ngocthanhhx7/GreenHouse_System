import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const detailPage = readFileSync(join(process.cwd(), 'src/pages/public/ProductDetailPage.jsx'), 'utf8');

describe('product detail catalog contract', () => {
  it('renders the SKU label through the product SKU formatter', () => {
    assert.match(detailPage, /className="product-sku"/);
    assert.match(detailPage, /formatProductSku\(product\.sku\)/);
  });

  it('formats product price from API currency with a VND fallback', () => {
    assert.match(detailPage, /formatProductCurrency\(product\)/);
  });
});
