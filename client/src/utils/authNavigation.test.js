import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { safeReturnPath } from './authNavigation.js';

describe('safe auth return paths', () => {
  it('keeps local product paths including query and hash', () => {
    assert.equal(
      safeReturnPath('/products/product-1?from=search#reviews'),
      '/products/product-1?from=search#reviews',
    );
  });

  it('rejects external, protocol-relative, malformed, and backslash paths', () => {
    for (const candidate of [
      'https://evil.example/products/1',
      '//evil.example/products/1',
      'javascript:alert(1)',
      '/\\evil.example',
      '',
      null,
    ]) {
      assert.equal(safeReturnPath(candidate, '/products'), '/products');
    }
  });
});
