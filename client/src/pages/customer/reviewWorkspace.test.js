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

  it('keeps the first page count stable when later metadata changes', async () => {
    assert.equal(typeof reviewWorkspace.loadAllOwnReviews, 'function');
    const pages = [];
    const result = await reviewWorkspace.loadAllOwnReviews(async ({ page }) => {
      pages.push(page);
      return {
        items: [{ id: `review-${page}` }],
        totalPages: page === 1 ? 3 : 1,
      };
    }, { maxPages: 3 });

    assert.deepEqual(pages, [1, 2, 3]);
    assert.deepEqual(result.map((review) => review.id), ['review-1', 'review-2', 'review-3']);
  });

  it('fails closed instead of returning an incomplete workspace above the page bound', async () => {
    const pages = [];
    await assert.rejects(
      reviewWorkspace.loadAllOwnReviews(async ({ page }) => {
        pages.push(page);
        return { items: [], totalPages: 4 };
      }, { maxPages: 3 }),
      /page bound/i,
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
