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

  it('filters delivered customer orders that contain the product for review selection', async () => {
    const service = createReviewService();
    const orders = [
      { id: 'order-1', orderCode: 'GH-1', orderStatus: 'Delivered', details: [{ productId: 'product-1' }] },
      { id: 'order-2', orderCode: 'GH-2', orderStatus: 'Shipped', details: [{ productId: 'product-1' }] },
      { id: 'order-3', orderCode: 'GH-3', orderStatus: 'Delivered', details: [{ productId: 'product-2' }] },
    ];

    const result = service.filterReviewableOrders(orders, 'product-1');

    assert.deepEqual(result.map((order) => order.id), ['order-1']);
  });

  it('lists staff moderation with product and independent state filters', async () => {
    const service = createReviewService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(
          url,
          'http://api.test/api/staff/reviews?page=1&pageSize=20&productId=product-1&publicationStatus=Published&moderationStatus=Allowed',
        );
        return { ok: true, json: async () => ({ success: true, data: { items: [] } }) };
      },
    });

    await service.listModeration({
      page: 1,
      pageSize: 20,
      productId: 'product-1',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
    });
  });
});
