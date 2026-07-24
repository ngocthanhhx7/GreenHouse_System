const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReviewService } = require('./review.service');

describe('Review bounded persistence reads', () => {
  it('passes stable skip/limit/count semantics to every Review page query', async () => {
    const calls = [];
    const repository = {
      async queryPublicSnapshot(productId, options) {
        calls.push({ method: 'public', productId, options });
        return { items: [], total: 0, ratingSum: 0 };
      },
      async queryReviews(filter, options) {
        calls.push({ method: 'management', filter, options });
        return { items: [], total: 0 };
      },
      async listPublicReviews() {
        throw new Error('unbounded public read must not be used');
      },
      async queryPublicReviews() {
        throw new Error('split public Review reads must not be used');
      },
      async listReviews() {
        throw new Error('unbounded management read must not be used');
      },
      async summarizeReviewHistories() {
        return {};
      },
    };
    const service = createReviewService({ repository });

    await service.listPublic('product-1', { page: 3, pageSize: 10 });
    await service.listOwn(
      { id: 'customer-1', role: 'Customer', status: 'Active' },
      { page: 2, pageSize: 3 },
    );
    await service.listModeration(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      {
        page: 2,
        pageSize: 3,
        productId: 'product-1',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
      },
    );

    assert.deepEqual(calls, [
      {
        method: 'public',
        productId: 'product-1',
        options: { skip: 20, limit: 10 },
      },
      {
        method: 'management',
        filter: { customerId: 'customer-1' },
        options: { skip: 3, limit: 3 },
      },
      {
        method: 'management',
        filter: {
          productId: 'product-1',
          publicationStatus: 'Published',
          moderationStatus: 'Allowed',
        },
        options: { skip: 3, limit: 3 },
      },
    ]);
  });

  it('passes a validated product filter to Customer own Review paging', async () => {
    const calls = [];
    const repository = {
      async queryReviews(filter, options) {
        calls.push({ filter, options });
        return { items: [], total: 0 };
      },
      async summarizeReviewHistories() {
        return {};
      },
    };
    const service = createReviewService({ repository });

    await service.listOwn(
      { id: 'customer-1', role: 'Customer', status: 'Active' },
      { page: 2, pageSize: 20, productId: 'product-1' },
    );

    assert.deepEqual(calls, [{
      filter: { customerId: 'customer-1', productId: 'product-1' },
      options: { skip: 20, limit: 20 },
    }]);
  });
});
