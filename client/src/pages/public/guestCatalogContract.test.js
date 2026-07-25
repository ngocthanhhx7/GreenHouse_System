import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const listingPage = readFileSync(
  join(process.cwd(), 'src/pages/public/ProductListingPage.jsx'),
  'utf8',
);
const productFilter = readFileSync(
  join(process.cwd(), 'src/components/product/ProductFilter.jsx'),
  'utf8',
);

describe('guest catalog interaction contract', () => {
  it('keeps the visible filters synchronized with header search URL changes', () => {
    const searchEffect = listingPage.match(
      /useEffect\(\(\) => \{[\s\S]*?\}, \[searchParams\]\);/,
    )?.[0] || '';

    assert.match(searchEffect, /const nextFilters\s*=\s*\{/);
    assert.match(searchEffect, /keyword:\s*searchParams\.get\('keyword'\)/);
    assert.match(searchEffect, /setFilters\(nextFilters\)/);
    assert.match(searchEffect, /loadProducts\(nextFilters\)/);
  });

  it('gives every catalog filter a stable accessible name', () => {
    for (const id of [
      'catalog-keyword',
      'catalog-category',
      'catalog-min-price',
      'catalog-max-price',
      'catalog-availability',
    ]) {
      assert.match(productFilter, new RegExp(`id="${id}"`));
    }

    assert.equal((productFilter.match(/aria-label=/g) || []).length, 5);
  });
});
