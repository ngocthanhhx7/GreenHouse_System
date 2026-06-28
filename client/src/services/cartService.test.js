import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCartService } from './cartService.js';

describe('client cart service', () => {
  it('adds item through customer cart endpoint', async () => {
    const service = createCartService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/cart/items');
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({ success: true, data: { totalAmount: 50 } }),
        };
      },
    });

    const result = await service.addItem({ productId: 'p1', quantity: 2 });

    assert.equal(result.totalAmount, 50);
  });
});
