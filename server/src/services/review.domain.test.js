const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  commandFingerprint,
} = require('./review.domain');

describe('Review canonical command facts', () => {
  it('treats recursively reordered object keys as the same command', () => {
    const left = commandFingerprint({
      actorId: 'customer-1',
      aggregateId: 'product-1',
      aggregateType: 'Review',
      operation: 'createReview',
      command: {
        expectedVersion: 0,
        facts: {
          purchase: { delivered: true, orderDetailId: 'detail-1' },
          rating: 5,
        },
      },
    });
    const right = commandFingerprint({
      operation: 'createReview',
      aggregateType: 'Review',
      aggregateId: 'product-1',
      actorId: 'customer-1',
      command: {
        facts: {
          rating: 5,
          purchase: { orderDetailId: 'detail-1', delivered: true },
        },
        expectedVersion: 0,
      },
    });

    assert.equal(right, left);
  });

  it('keeps distinct nested command facts conflict-distinct', () => {
    const base = {
      actorId: 'customer-1',
      aggregateId: 'product-1',
      aggregateType: 'Review',
      operation: 'createReview',
    };

    assert.notEqual(
      commandFingerprint({
        ...base,
        command: { expectedVersion: 0, facts: { rating: 5 } },
      }),
      commandFingerprint({
        ...base,
        command: { expectedVersion: 0, facts: { rating: 4 } },
      }),
    );
  });
});
