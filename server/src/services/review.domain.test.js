const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const {
  commandFingerprint,
  toModerationDto,
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

  it('serializes MongoDB ObjectIds as hexadecimal ids in Staff moderation data', () => {
    const reviewId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    const productId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');

    assert.deepEqual(
      toModerationDto({
        _id: reviewId,
        productId,
        rating: 5,
        content: 'Good',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        version: 1,
      }),
      {
        id: '507f1f77bcf86cd799439011',
        productId: '507f1f77bcf86cd799439012',
        rating: 5,
        content: 'Good',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        moderationReason: '',
        version: 1,
        createdAt: undefined,
        updatedAt: undefined,
      },
    );
  });
});
