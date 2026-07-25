import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as reviewWorkspace from './reviewWorkspace.js';

const { buildReviewWorkspace } = reviewWorkspace;

describe('customer review workspace', () => {
  it('loads every stable own-review page with the backend maximum page size', async () => {
    assert.equal(typeof reviewWorkspace.loadAllOwnReviews, 'function');
    const calls = [];
    const result = await reviewWorkspace.loadAllOwnReviews(async ({ page, pageSize }) => {
      calls.push({ page, pageSize });
      return {
        items: page === 1
          ? Array.from({ length: 50 }, (_, index) => ({
            id: `review-${index + 1}`,
            productId: `product-${index + 1}`,
          }))
          : [{ id: 'review-51', productId: 'old-reviewed-product' }],
        total: 51,
        page,
        pageSize,
        totalPages: 2,
      };
    });

    assert.deepEqual(calls, [
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
    ]);
    assert.equal(result.length, 51);
    assert.equal(result.at(-1).id, 'review-51');
    const workspace = buildReviewWorkspace([{
      id: 'order-1',
      orderStatus: 'Delivered',
      details: [{
        id: 'line-old',
        productId: 'old-reviewed-product',
        productNameSnapshot: 'Old purchase',
      }],
    }], result);
    assert.equal(workspace.pending.length, 0);
    assert.equal(workspace.completed.length, 51);
  });

  it('retries an offset-shifted insert until two unique snapshots stabilize', async () => {
    let request = 0;
    const calls = [];
    const stableItems = [
      { id: 'review-new' },
      ...Array.from({ length: 51 }, (_, index) => ({ id: `review-${index + 1}` })),
    ];
    const result = await reviewWorkspace.loadAllOwnReviews(async ({ page, pageSize }) => {
      request += 1;
      calls.push({ page, pageSize });
      if (request === 1) {
        return {
          items: stableItems.slice(1, 51),
          total: 51,
          totalPages: 2,
        };
      }
      if (request === 2) {
        return {
          items: stableItems.slice(50),
          total: 52,
          totalPages: 2,
        };
      }
      return {
        items: page === 1 ? stableItems.slice(0, 50) : stableItems.slice(50),
        total: 52,
        totalPages: 2,
      };
    }, { maxAttempts: 3 });

    assert.equal(result.length, 52);
    assert.equal(new Set(result.map((review) => review.id)).size, 52);
    assert.deepEqual(calls, [
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
    ]);
  });

  it('fails closed instead of returning an incomplete workspace above the page bound', async () => {
    const pages = [];
    await assert.rejects(
      reviewWorkspace.loadAllOwnReviews(async ({ page }) => {
        pages.push(page);
        return { items: [], totalPages: 4 };
      }, { maxPages: 3 }),
      (error) => {
        assert.equal(error.code, 'REVIEW_SNAPSHOT_UNSTABLE');
        assert.doesNotMatch(error.message, /Review page bound/i);
        return true;
      },
    );
    assert.deepEqual(pages, [1]);
  });

  it('creates one pending item per delivered order line', () => {
    const result = buildReviewWorkspace([
      {
        id: 'order-1',
        orderCode: 'GH-1',
        orderStatus: 'Delivered',
        details: [
          { id: 'line-1', productId: 'p1', productNameSnapshot: 'Dao' },
          { id: 'line-2', productId: 'p2', productNameSnapshot: 'Chảo' },
        ],
      },
    ], []);
    assert.deepEqual(result.pending.map((item) => item.orderDetailId), ['line-1', 'line-2']);
  });

  it('removes an existing Customer+Product identity from pending', () => {
    const result = buildReviewWorkspace([
      {
        id: 'order-1',
        orderStatus: 'Delivered',
        details: [{ id: 'line-1', productId: 'p1', productNameSnapshot: 'Dao' }],
      },
    ], [{ id: 'review-1', productId: 'p1', rating: 5 }]);
    assert.equal(result.pending.length, 0);
    assert.equal(result.completed[0].productName, 'Dao');
  });

  it('ignores non-delivered orders and keeps a safe completed fallback', () => {
    const result = buildReviewWorkspace([
      { id: 'order-1', orderStatus: 'Shipped', details: [{ id: 'line-1', productId: 'p1' }] },
    ], [{ id: 'review-2', productId: 'p2', rating: 4 }]);
    assert.equal(result.pending.length, 0);
    assert.equal(result.completed[0].productName, 'Sản phẩm đã đánh giá');
  });
});
