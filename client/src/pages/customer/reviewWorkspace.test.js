import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildReviewWorkspace } from './reviewWorkspace.js';

describe('customer review workspace', () => {
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
