import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReviewService } from './reviewService.js';

describe('client review service', () => {
  it('lists public product reviews', async () => {
    const service = createReviewService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/products/product-1/reviews');
        return { ok: true, json: async () => ({ success: true, data: { items: [], total: 0 } }) };
      },
    });

    const result = await service.listProductReviews('product-1');

    assert.equal(result.total, 0);
  });

  it('creates a customer product review', async () => {
    const service = createReviewService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/products/product-1/reviews');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { orderId: 'order-1', rating: 5, content: 'Great product' });
        return { ok: true, json: async () => ({ success: true, data: { rating: 5 } }) };
      },
    });

    const result = await service.createCustomerReview('product-1', { orderId: 'order-1', rating: 5, content: 'Great product' });

    assert.equal(result.rating, 5);
  });
});
