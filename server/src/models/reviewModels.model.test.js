const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ProductReview = require('./productReview.model');

function loadModel(path) {
  try {
    return require(path);
  } catch (error) {
    assert.fail(`expected ${path} to exist: ${error.message}`);
  }
}

function hasIndex(model, keys, options = {}) {
  return model.schema.indexes().some(([actualKeys, actualOptions]) => (
    JSON.stringify(actualKeys) === JSON.stringify(keys)
    && Object.entries(options).every(([key, value]) => actualOptions[key] === value)
  ));
}

describe('SL-008 Review persistence models', () => {
  it('enforces one durable Review identity per Customer and Product', () => {
    assert.equal(
      hasIndex(
        ProductReview,
        { customerId: 1, productId: 1 },
        { unique: true },
      ),
      true,
    );
    assert.equal(ProductReview.schema.path('orderDetailId').options.required, true);
    assert.equal(ProductReview.schema.path('orderDetailId').options.immutable, true);
    assert.ok(ProductReview.schema.path('publicationStatus'));
    assert.ok(ProductReview.schema.path('moderationStatus'));
    assert.ok(ProductReview.schema.path('version'));
  });

  it('defines append-only Review history models with aggregate-version indexes', () => {
    const rows = [
      ['./reviewContentHistory.model', { reviewId: 1, version: 1 }],
      ['./reviewPublicationHistory.model', { reviewId: 1, version: 1 }],
      ['./reviewModerationHistory.model', { reviewId: 1, version: 1 }],
    ];

    for (const [path, index] of rows) {
      const model = loadModel(path);
      assert.equal(hasIndex(model, index, { unique: true }), true, path);
      assert.equal(model.schema.path('reviewId').options.immutable, true, path);
      assert.equal(model.schema.path('version').options.immutable, true, path);
      assert.equal(model.schema.path('createdAt').options.immutable, true, path);
    }
  });

  it('scopes immutable Review commands by actor and idempotency key', () => {
    const ReviewCommand = loadModel('./reviewCommand.model');
    assert.equal(
      hasIndex(
        ReviewCommand,
        { actorId: 1, idempotencyKey: 1 },
        { unique: true },
      ),
      true,
    );
    for (const field of [
      'aggregateType',
      'aggregateId',
      'operation',
      'fingerprint',
      'result',
      'currentResultId',
      'currentResultVersion',
      'createdAt',
    ]) {
      assert.ok(ReviewCommand.schema.path(field), field);
    }
  });
});
