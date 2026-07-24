const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const { createReviewService } = require('./review.service');

function castError(value) {
  return new mongoose.Error.CastError('ObjectId', value, '_id');
}

describe('Review identifier privacy boundary', () => {
  it('maps malformed identifiers to safe public and protected Review errors', async () => {
    const repository = {
      async findProductById() {
        throw castError('not-an-object-id');
      },
      async queryPublicSnapshot() {
        throw castError('not-an-object-id');
      },
      async findCommand() {
        return null;
      },
      async findReviewByIdentity() {
        return null;
      },
      async findReviewById() {
        throw castError('not-a-review-id');
      },
    };
    const service = createReviewService({ repository });

    const publicPage = await service.listPublic('not-an-object-id', {
      page: 1,
      pageSize: 20,
    });
    assert.equal(publicPage.total, 0);

    await assert.rejects(
      () => service.createReview(
        { id: 'customer-1', role: 'Customer', status: 'Active' },
        'not-an-object-id',
        {
          rating: 5,
          content: 'safe',
          expectedVersion: 0,
        },
        { idempotencyKey: 'review-bad-product-0001' },
      ),
      (error) => error.errorCode === 'REVIEW_NOT_ELIGIBLE',
    );

    await assert.rejects(
      () => service.updateReview(
        { id: 'customer-1', role: 'Customer', status: 'Active' },
        'not-a-review-id',
        {
          rating: 4,
          content: 'safe',
          expectedVersion: 1,
        },
        { idempotencyKey: 'review-bad-id-0001' },
      ),
      (error) => error.errorCode === 'REVIEW_FORBIDDEN',
    );
  });
});
